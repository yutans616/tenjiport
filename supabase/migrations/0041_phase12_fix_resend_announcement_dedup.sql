-- 0041_phase12_fix_resend_announcement_dedup.sql
-- resend_announcement：未確認者を再通知の対象として拾うCTEが event_participation_id を
-- 重複除去していなかった。ある出展者が既に一度「再通知」を受けていると、その出展者宛の
-- sentレコードが2件（当初の公開通知＋前回の再通知）になり、次に再通知を実行した際に
-- 同一トランザクション内で同じ出展者向けに2行INSERTしようとする。idempotency_keyは
-- now()（1ステートメント内で一定値）を含むため、この2行が完全に同一の値になり
-- unique制約違反でエラーになっていた（画面にはエラー画面がそのまま表示される）。
-- distinctを追加し、出展者ごとに高々1行しか対象にならないようにする。
--
-- それでもなお、idempotency_keyが秒単位のため、同じ出展者に対して1秒以内に2回
-- 「再通知」が実行される（例：ボタンの連打）と、直前の呼び出しで既にコミットされた
-- 行と衝突しうる。これは本来「既に直近で再通知済みなので何もしない」が正しい挙動の
-- ため、on conflict do nothingにしてエラーではなく無視するようにする（このテーブルの
-- 他の冪等キー付きinsertと同じパターン）。

create or replace function resend_announcement(p_announcement_version_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org_id uuid;
  v_created_count integer;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select e.organizer_organization_id into v_org_id
  from announcement_versions av
  join announcements a on a.id = av.announcement_id
  join events e on e.id = a.event_id
  where av.id = p_announcement_version_id;

  if v_org_id is null or not is_organizer_member(v_org_id) then
    raise exception 'not authorized';
  end if;

  with unacknowledged as (
    select distinct nd.event_participation_id
    from notification_deliveries nd
    where nd.related_entity_type = 'announcement_version'
      and nd.related_entity_id = p_announcement_version_id
      and nd.status = 'sent'
      and not exists (
        select 1 from acknowledgements ack
        where ack.announcement_version_id = p_announcement_version_id
          and ack.event_participation_id = nd.event_participation_id
      )
  ),
  inserted as (
    insert into notification_deliveries (event_participation_id, channel, template_type, related_entity_type, related_entity_id, idempotency_key)
    select
      event_participation_id,
      'email',
      'announcement_resend',
      'announcement_version',
      p_announcement_version_id,
      'announcement_resend:' || p_announcement_version_id || ':' || event_participation_id || ':' || extract(epoch from now())::bigint
    from unacknowledged
    on conflict (idempotency_key) do nothing
    returning 1
  )
  select count(*) into v_created_count from inserted;

  return v_created_count;
end;
$$;
