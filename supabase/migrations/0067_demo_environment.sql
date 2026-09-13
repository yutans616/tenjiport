-- 0067_demo_environment.sql
-- 営業LP用の操作デモ（実環境シード方式）のためのスキーマ変更。
-- tenjiport_demo_lp_spec.md 4.3節参照。
--
-- is_demoは既存のbilling_exempt（0046_phase12_billing_exempt_org.sql）とは別目的：
-- billing_exemptは「課金しない」ことのみを制御する既存の仕組みで、そのまま流用する。
-- is_demoは「メール送信を行わない」「画面にデモ環境バナーを出す」「深夜バッチでのリセット
-- 対象にする」ための新規フラグで、billing_exemptな組織すべてに適用したいわけではない
-- （運営者の検証用組織はbilling_exemptだがメールは実際に送りたい場合がある）ため分離する。
alter table organizer_organizations add column if not exists is_demo boolean not null default false;

-- 本番運用中に複数のデモ組織が誤って増えないよう、is_demo=trueは高々1件に制限する
-- （部分ユニークインデックス）。将来的に複数デモ環境が必要になった場合はここを見直す。
create unique index if not exists organizer_organizations_single_demo_org
  on organizer_organizations ((is_demo))
  where is_demo;

-- get_pending_notification_batch（0021時点の定義）にis_demoを追加する。
-- デモ組織向けの通知は、processPendingNotifications側でResend実送信をスキップし、
-- 「通知プレビュー」として扱うために組織のis_demoを判定する必要があるため。
-- 戻り値の列構成を変える場合、create or replaceでは変更できず42P13エラーになるため
-- 先にdrop functionする（Postgresの制約）。
drop function if exists get_pending_notification_batch(integer);

create or replace function get_pending_notification_batch(p_limit integer default 20)
returns table (
  delivery_id uuid,
  event_participation_id uuid,
  template_type text,
  related_entity_type text,
  related_entity_id uuid,
  recipient_email text,
  public_form_token uuid,
  announcement_title text,
  announcement_body text,
  attempt_count integer,
  is_demo boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return query
  select
    nd.id::uuid,
    nd.event_participation_id::uuid,
    nd.template_type::text,
    nd.related_entity_type::text,
    nd.related_entity_id::uuid,
    u.email::text,
    e.public_form_token::uuid,
    av.title::text,
    coalesce(av.body, rr.comment)::text,
    nd.attempt_count::integer,
    o.is_demo::boolean
  from notification_deliveries nd
  join event_participations ep on ep.id = nd.event_participation_id
  join events e on e.id = ep.event_id
  join organizer_organizations o on o.id = e.organizer_organization_id
  join exhibitor_memberships m on m.exhibitor_profile_id = ep.exhibitor_profile_id and m.role = 'owner' and m.status = 'active'
  join auth.users u on u.id = m.user_id
  left join announcement_versions av on av.id = nd.related_entity_id and nd.related_entity_type = 'announcement_version'
  left join revision_requests rr on rr.id = nd.related_entity_id and nd.related_entity_type = 'revision_request'
  where nd.status = 'pending'
  order by nd.created_at
  limit p_limit;
end;
$$;
revoke execute on function get_pending_notification_batch(integer) from public;
revoke execute on function get_pending_notification_batch(integer) from anon;
revoke execute on function get_pending_notification_batch(integer) from authenticated;
grant execute on function get_pending_notification_batch(integer) to service_role;
