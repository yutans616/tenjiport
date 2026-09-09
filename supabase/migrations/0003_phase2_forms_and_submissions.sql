-- 0003_phase2_forms_and_submissions.sql
-- Phase 2: フォーム設計・出展者情報収集
--
-- 設計変更メモ（data-model.md記載の当初案からの見直し）：
-- 当初は「匿名下書きトークン＋専用テーブル＋RPC」で入力前のメール確認を省略する案だったが、
-- 実装時に「メールアドレスを確認して提出」（ブリーフ4章）を素直に読み、
-- 入力開始の直前（E1の次）でメール確認を前倒しする設計に変更した。
-- これにより：
--   - 入力中の自動保存は通常のRLS保護された直接REST呼び出しで完結する
--     （匿名の擬似トークン方式のような「知っていれば書き換えられる」設計を避けられる）
--   - 追加のテーブル・RPCが1系統不要になる
-- 「事前登録フローなしに開始できる」という受け入れ条件は、メール確認自体は
-- パスワード等を要求しない軽量な操作であるため引き続き満たす。

-- 主催者がURLを再発行・失効できるよう、イベントに公開トークンを持たせる
alter table events add column public_form_token uuid not null default gen_random_uuid();
create unique index uq_events_public_form_token on events(public_form_token);

-- ============================================================
-- 公開読み取り（匿名・認証済み問わず）：エントリーページとフォーム定義
-- ============================================================

create policy "anyone can view open events for entry page"
  on events for select
  using (status = 'open');

create policy "anyone can view published forms of open events"
  on forms for select
  using (
    status = 'published'
    and exists (select 1 from events e where e.id = forms.event_id and e.status = 'open')
  );

create policy "anyone can view sections of viewable forms"
  on form_sections for select
  using (
    exists (
      select 1 from forms f
      where f.id = form_sections.form_id
        and f.status = 'published'
        and exists (select 1 from events e where e.id = f.event_id and e.status = 'open')
    )
  );

create policy "anyone can view fields of viewable forms"
  on form_fields for select
  using (
    exists (
      select 1 from form_sections fs
      join forms f on f.id = fs.form_id
      where fs.id = form_fields.form_section_id
        and f.status = 'published'
        and exists (select 1 from events e where e.id = f.event_id and e.status = 'open')
    )
  );

-- ============================================================
-- 主催者：フォームビルダー（forms / form_sections / form_fields の書き込み）
-- ============================================================

create policy "organizer members can select forms in own events"
  on forms for select
  using (exists (select 1 from events e where e.id = forms.event_id and is_organizer_member(e.organizer_organization_id)));

create policy "organizer members can insert forms in own events"
  on forms for insert
  with check (exists (select 1 from events e where e.id = forms.event_id and is_organizer_member(e.organizer_organization_id)));

create policy "organizer members can update forms in own events"
  on forms for update
  using (exists (select 1 from events e where e.id = forms.event_id and is_organizer_member(e.organizer_organization_id)))
  with check (exists (select 1 from events e where e.id = forms.event_id and is_organizer_member(e.organizer_organization_id)));

create policy "organizer members can select form sections in own events"
  on form_sections for select
  using (exists (select 1 from forms f join events e on e.id = f.event_id where f.id = form_sections.form_id and is_organizer_member(e.organizer_organization_id)));

create policy "organizer members can insert form sections in own events"
  on form_sections for insert
  with check (exists (select 1 from forms f join events e on e.id = f.event_id where f.id = form_sections.form_id and is_organizer_member(e.organizer_organization_id)));

create policy "organizer members can update form sections in own events"
  on form_sections for update
  using (exists (select 1 from forms f join events e on e.id = f.event_id where f.id = form_sections.form_id and is_organizer_member(e.organizer_organization_id)))
  with check (exists (select 1 from forms f join events e on e.id = f.event_id where f.id = form_sections.form_id and is_organizer_member(e.organizer_organization_id)));

create policy "organizer members can delete form sections in own events"
  on form_sections for delete
  using (exists (select 1 from forms f join events e on e.id = f.event_id where f.id = form_sections.form_id and is_organizer_member(e.organizer_organization_id)));

create policy "organizer members can select form fields in own events"
  on form_fields for select
  using (exists (select 1 from form_sections fs join forms f on f.id = fs.form_id join events e on e.id = f.event_id where fs.id = form_fields.form_section_id and is_organizer_member(e.organizer_organization_id)));

create policy "organizer members can insert form fields in own events"
  on form_fields for insert
  with check (exists (select 1 from form_sections fs join forms f on f.id = fs.form_id join events e on e.id = f.event_id where fs.id = form_fields.form_section_id and is_organizer_member(e.organizer_organization_id)));

create policy "organizer members can update form fields in own events"
  on form_fields for update
  using (exists (select 1 from form_sections fs join forms f on f.id = fs.form_id join events e on e.id = f.event_id where fs.id = form_fields.form_section_id and is_organizer_member(e.organizer_organization_id)))
  with check (exists (select 1 from form_sections fs join forms f on f.id = fs.form_id join events e on e.id = f.event_id where fs.id = form_fields.form_section_id and is_organizer_member(e.organizer_organization_id)));

create policy "organizer members can delete form fields in own events"
  on form_fields for delete
  using (exists (select 1 from form_sections fs join forms f on f.id = fs.form_id join events e on e.id = f.event_id where fs.id = form_fields.form_section_id and is_organizer_member(e.organizer_organization_id)));

-- ============================================================
-- 主催者：重複統合のための event_participations 更新
-- （merge/cancel 等の状態遷移のみを想定。それ以外の項目編集はまだ画面がないため未対応）
-- ============================================================

create policy "organizer can update participations in own events"
  on event_participations for update
  using (exists (select 1 from events e where e.id = event_participations.event_id and is_organizer_member(e.organizer_organization_id)))
  with check (exists (select 1 from events e where e.id = event_participations.event_id and is_organizer_member(e.organizer_organization_id)));

-- ============================================================
-- 主催者：自組織の出展者ブランド情報の閲覧（出展者一覧・詳細画面用）
-- ============================================================

create policy "organizer can select exhibitor profiles of own event participants"
  on exhibitor_profiles for select
  using (
    exists (
      select 1 from event_participations ep
      join events e on e.id = ep.event_id
      where ep.exhibitor_profile_id = exhibitor_profiles.id and is_organizer_member(e.organizer_organization_id)
    )
  );

-- ============================================================
-- 出展者：提出（submission_versions の自動保存用の直接アクセス）
-- ============================================================

create policy "exhibitor can select own submission versions"
  on submission_versions for select
  using (exists (select 1 from event_participations ep where ep.id = submission_versions.event_participation_id and is_exhibitor_member(ep.exhibitor_profile_id)));

-- 自動保存は draft のあいだだけ直接更新を許可する。status遷移（submitted等）はRPC経由のみ。
create policy "exhibitor can autosave own draft submission versions"
  on submission_versions for update
  using (
    status = 'draft'
    and exists (select 1 from event_participations ep where ep.id = submission_versions.event_participation_id and is_exhibitor_member(ep.exhibitor_profile_id))
  )
  with check (
    status = 'draft'
    and exists (select 1 from event_participations ep where ep.id = submission_versions.event_participation_id and is_exhibitor_member(ep.exhibitor_profile_id))
  );

create policy "organizer can select submission versions in own events"
  on submission_versions for select
  using (
    exists (
      select 1 from event_participations ep
      join events e on e.id = ep.event_id
      where ep.id = submission_versions.event_participation_id and is_organizer_member(e.organizer_organization_id)
    )
  );

-- ============================================================
-- 修正依頼（revision_requests）
-- ============================================================

create policy "organizer can select revision requests in own events"
  on revision_requests for select
  using (
    exists (
      select 1 from submission_versions sv
      join event_participations ep on ep.id = sv.event_participation_id
      join events e on e.id = ep.event_id
      where sv.id = revision_requests.submission_version_id and is_organizer_member(e.organizer_organization_id)
    )
  );

create policy "exhibitor can select own revision requests"
  on revision_requests for select
  using (
    exists (
      select 1 from submission_versions sv
      join event_participations ep on ep.id = sv.event_participation_id
      where sv.id = revision_requests.submission_version_id and is_exhibitor_member(ep.exhibitor_profile_id)
    )
  );

-- ============================================================
-- 重複登録レビュー（duplicate_flags）
-- ============================================================

create policy "organizer can select duplicate flags in own events"
  on duplicate_flags for select
  using (exists (select 1 from events e where e.id = duplicate_flags.event_id and is_organizer_member(e.organizer_organization_id)));

create policy "organizer can update duplicate flags in own events"
  on duplicate_flags for update
  using (exists (select 1 from events e where e.id = duplicate_flags.event_id and is_organizer_member(e.organizer_organization_id)))
  with check (exists (select 1 from events e where e.id = duplicate_flags.event_id and is_organizer_member(e.organizer_organization_id)));

-- ============================================================
-- RPC: 出展者側
-- ============================================================

-- メール確認済みの出展者が「今書くべき下書きバージョン」を取得・用意する。
-- 初回：exhibitor_profile / exhibitor_membership / event_participation を作成し、v1のdraftを新規作成。
-- 再訪問：既存のdraftをそのまま返す（途中再開）。
-- 再提出：直近が submitted / revision_requested / confirmed なら、その内容を引き継いだ新バージョンをdraftとして作成。
create or replace function start_or_resume_submission(p_event_id uuid)
returns table (
  participation_id uuid,
  submission_version_id uuid,
  version_number integer,
  status text,
  data_snapshot_json jsonb
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile_id uuid;
  v_participation event_participations;
  v_form_id uuid;
  v_latest submission_versions;
  v_new submission_versions;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  -- 既存のプロフィール（このユーザーが所属する最初のアクティブなブランド）を再利用する
  select m.exhibitor_profile_id into v_profile_id
  from exhibitor_memberships m
  where m.user_id = auth.uid() and m.status = 'active'
  order by m.created_at
  limit 1;

  if v_profile_id is null then
    insert into exhibitor_profiles (brand_name, company_name, created_by_user_id)
    values ('未設定', '未設定', auth.uid())
    returning id into v_profile_id;

    insert into exhibitor_memberships (user_id, exhibitor_profile_id, role, status)
    values (auth.uid(), v_profile_id, 'owner', 'active');
  end if;

  select f.id into v_form_id
  from forms f
  where f.event_id = p_event_id and f.status = 'published'
  order by f.version desc
  limit 1;

  if v_form_id is null then
    raise exception 'no published form for this event';
  end if;

  insert into event_participations (event_id, exhibitor_profile_id, status)
  values (p_event_id, v_profile_id, 'draft')
  on conflict (event_id, exhibitor_profile_id) do nothing;

  select * into v_participation
  from event_participations
  where event_id = p_event_id and exhibitor_profile_id = v_profile_id;

  select * into v_latest
  from submission_versions
  where event_participation_id = v_participation.id
  order by version_number desc
  limit 1;

  if v_latest.id is not null and v_latest.status = 'draft' then
    return query select v_participation.id, v_latest.id, v_latest.version_number, v_latest.status, v_latest.data_snapshot_json;
    return;
  end if;

  insert into submission_versions (event_participation_id, form_id, version_number, status, data_snapshot_json)
  values (
    v_participation.id,
    v_form_id,
    coalesce(v_latest.version_number, 0) + 1,
    'draft',
    coalesce(v_latest.data_snapshot_json, '{}'::jsonb)
  )
  returning * into v_new;

  return query select v_participation.id, v_new.id, v_new.version_number, v_new.status, v_new.data_snapshot_json;
end;
$$;

-- 出展者が下書きを提出する。所有者チェックを関数内で必ず行う（security definerのため）。
create or replace function submit_current_version(p_submission_version_id uuid, p_answers jsonb)
returns submission_versions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_version submission_versions;
  v_participation event_participations;
  v_profile exhibitor_profiles;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select sv.* into v_version from submission_versions sv where sv.id = p_submission_version_id;
  if v_version.id is null then
    raise exception 'submission version not found';
  end if;

  select ep.* into v_participation from event_participations ep where ep.id = v_version.event_participation_id;

  if not exists (
    select 1 from exhibitor_memberships m
    where m.exhibitor_profile_id = v_participation.exhibitor_profile_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  ) then
    raise exception 'not authorized';
  end if;

  if v_version.status <> 'draft' then
    raise exception 'only a draft version can be submitted';
  end if;

  update submission_versions
  set data_snapshot_json = p_answers, status = 'submitted', submitted_at = now()
  where id = v_version.id
  returning * into v_version;

  update event_participations
  set
    status = 'submitted',
    first_submitted_at = coalesce(first_submitted_at, now()),
    is_billable = true
  where id = v_participation.id
  returning * into v_participation;

  select * into v_profile from exhibitor_profiles where id = v_participation.exhibitor_profile_id;

  -- 簡易な重複検知：同一イベント内で、連絡先メールが一致する別ブランドの参加を突き合わせる
  insert into duplicate_flags (event_id, participation_id_a, participation_id_b, match_reason)
  select v_participation.event_id, v_participation.id, other_ep.id, 'email'
  from event_participations other_ep
  join exhibitor_profiles other_profile on other_profile.id = other_ep.exhibitor_profile_id
  where other_ep.event_id = v_participation.event_id
    and other_ep.exhibitor_profile_id <> v_participation.exhibitor_profile_id
    and other_ep.status <> 'merged'
    and v_profile.default_contact_email is not null
    and other_profile.default_contact_email = v_profile.default_contact_email
    and not exists (
      select 1 from duplicate_flags df
      where df.event_id = v_participation.event_id
        and (
          (df.participation_id_a = v_participation.id and df.participation_id_b = other_ep.id)
          or (df.participation_id_a = other_ep.id and df.participation_id_b = v_participation.id)
        )
    );

  return v_version;
end;
$$;

-- ============================================================
-- RPC: 主催者側
-- ============================================================

create or replace function request_revision(p_submission_version_id uuid, p_comment text, p_target_field_keys text[])
returns revision_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org_id uuid;
  v_participation_id uuid;
  v_result revision_requests;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select e.organizer_organization_id, ep.id into v_org_id, v_participation_id
  from submission_versions sv
  join event_participations ep on ep.id = sv.event_participation_id
  join events e on e.id = ep.event_id
  where sv.id = p_submission_version_id;

  if v_org_id is null or not is_organizer_member(v_org_id) then
    raise exception 'not authorized';
  end if;

  insert into revision_requests (submission_version_id, requested_by_user_id, comment, target_field_keys)
  values (p_submission_version_id, auth.uid(), p_comment, coalesce(p_target_field_keys, '{}'))
  returning * into v_result;

  update submission_versions set status = 'revision_requested' where id = p_submission_version_id;
  update event_participations set status = 'revision_requested' where id = v_participation_id;

  insert into audit_logs (actor_user_id, organization_id, action_type, entity_type, entity_id, after_json)
  values (auth.uid(), v_org_id, 'request_revision', 'submission_version', p_submission_version_id, to_jsonb(v_result));

  return v_result;
end;
$$;

create or replace function confirm_submission(p_submission_version_id uuid)
returns submission_versions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org_id uuid;
  v_participation_id uuid;
  v_result submission_versions;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select e.organizer_organization_id, ep.id into v_org_id, v_participation_id
  from submission_versions sv
  join event_participations ep on ep.id = sv.event_participation_id
  join events e on e.id = ep.event_id
  where sv.id = p_submission_version_id;

  if v_org_id is null or not is_organizer_member(v_org_id) then
    raise exception 'not authorized';
  end if;

  update submission_versions
  set status = 'confirmed', confirmed_at = now(), confirmed_by_user_id = auth.uid()
  where id = p_submission_version_id
  returning * into v_result;

  update event_participations set status = 'confirmed' where id = v_participation_id;

  insert into audit_logs (actor_user_id, organization_id, action_type, entity_type, entity_id, after_json)
  values (auth.uid(), v_org_id, 'confirm_submission', 'submission_version', p_submission_version_id, to_jsonb(v_result));

  return v_result;
end;
$$;
