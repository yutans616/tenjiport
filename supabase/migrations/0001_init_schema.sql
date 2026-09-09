-- 0001_init_schema.sql
-- 出展者情報・資料共有管理SaaS 初期スキーマ
--
-- 方針:
--   - 業務データの物理削除は行わない。すべて status 列によるソフトデリート/状態遷移で表現する。
--   - UsageLedger, InvoiceChangeLog, AuditLog, PaymentEvent は追記専用（アプリのDBロールに
--     UPDATE/DELETE 権限を付与しない運用を前提とする。権限付与自体は Phase 5 で実DB接続時に設定）。
--   - User の認証情報は Supabase Auth (auth.users) を正とし、独自の users テーブルは持たない。
--   - すべての金額は整数円 (bigint/integer, 通貨小数点なし)。
--   - RLS は本マイグレーションで全テーブルに ENABLE し、コアなテナント境界（組織/ブランド単位の
--     参照）のみ SELECT ポリシーを先行実装する。書き込みポリシーおよび残りのテーブルのポリシーは
--     各機能を実装するフェーズ（Phase 1-6）で追加する。ポリシー未設定のテーブルは
--     「RLS有効・ポリシーなし = 全拒否」がデフォルト動作となるため、安全側に倒れる。

create extension if not exists pgcrypto;

-- ============================================================
-- 共通ユーティリティ
-- ============================================================

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================
-- 1. 主催者組織・メンバーシップ
-- ============================================================

create table organizer_organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  billing_email text not null,
  status text not null default 'active' check (status in ('active', 'suspended')),
  payment_provider_customer_id text,
  created_at timestamptz not null default now()
);

create table organizer_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizer_organizations(id),
  user_id uuid not null references auth.users(id),
  role text not null check (role in ('owner', 'admin', 'staff')),
  status text not null default 'invited' check (status in ('invited', 'active', 'removed')),
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create index idx_organizer_memberships_user on organizer_memberships(user_id);

-- ============================================================
-- 2. 出展者ブランド・メンバーシップ
-- ============================================================

create table exhibitor_profiles (
  id uuid primary key default gen_random_uuid(),
  brand_name text not null,
  company_name text not null,
  address text,
  website text,
  sns_links jsonb,
  default_contact_name text,
  default_contact_email text,
  default_contact_phone text,
  logo_file_id uuid,
  description text,
  created_by_user_id uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_exhibitor_profiles_updated_at
  before update on exhibitor_profiles
  for each row execute function set_updated_at();

create table exhibitor_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  exhibitor_profile_id uuid not null references exhibitor_profiles(id),
  role text not null default 'owner' check (role in ('owner', 'staff')),
  status text not null default 'active' check (status in ('active', 'removed')),
  created_at timestamptz not null default now(),
  unique (user_id, exhibitor_profile_id)
);

create index idx_exhibitor_memberships_user on exhibitor_memberships(user_id);
create index idx_exhibitor_memberships_profile on exhibitor_memberships(exhibitor_profile_id);

-- ============================================================
-- 3. イベント・参加
-- ============================================================

create table events (
  id uuid primary key default gen_random_uuid(),
  organizer_organization_id uuid not null references organizer_organizations(id),
  name text not null,
  venue text,
  start_date date,
  end_date date,
  status text not null default 'draft' check (status in ('draft', 'open', 'closed', 'archived')),
  timezone text not null default 'Asia/Tokyo',
  spam_guard_config jsonb not null default '{"captcha_enabled": false, "honeypot_enabled": true}'::jsonb,
  created_at timestamptz not null default now()
);

create index idx_events_organization on events(organizer_organization_id);

create table event_participations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id),
  exhibitor_profile_id uuid not null references exhibitor_profiles(id),
  group_tags text[] not null default '{}',
  status text not null default 'invited'
    check (status in ('invited', 'draft', 'submitted', 'revision_requested', 'confirmed', 'cancelled', 'merged')),
  first_submitted_at timestamptz,
  is_billable boolean not null default false,
  duplicate_of_id uuid references event_participations(id),
  duplicate_status text not null default 'none' check (duplicate_status in ('none', 'flagged', 'merged', 'dismissed')),
  cancelled_at timestamptz,
  cancelled_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, exhibitor_profile_id)
);

create trigger trg_event_participations_updated_at
  before update on event_participations
  for each row execute function set_updated_at();

create index idx_event_participations_event on event_participations(event_id);
create index idx_event_participations_profile on event_participations(exhibitor_profile_id);

-- ============================================================
-- 4. フォーム定義
-- ============================================================

create table forms (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id),
  version integer not null default 1,
  status text not null default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_forms_event on forms(event_id);

create table form_sections (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references forms(id),
  title text not null,
  "order" integer not null default 0
);

create index idx_form_sections_form on form_sections(form_id);

create table form_fields (
  id uuid primary key default gen_random_uuid(),
  form_section_id uuid not null references form_sections(id),
  key text not null,
  label text not null,
  type text not null check (type in (
    'short_text', 'long_text', 'number', 'date',
    'single_select', 'multi_select', 'checkbox', 'file', 'repeating'
  )),
  required boolean not null default false,
  help_text text,
  "order" integer not null default 0,
  deadline timestamptz,
  condition_json jsonb,
  options_json jsonb,
  max_files integer,
  unique (form_section_id, key)
);

create index idx_form_fields_section on form_fields(form_section_id);

-- ============================================================
-- 5. 提出（スナップショット履歴）
-- ============================================================

create table submission_versions (
  id uuid primary key default gen_random_uuid(),
  event_participation_id uuid not null references event_participations(id),
  form_id uuid not null references forms(id),
  version_number integer not null,
  status text not null default 'draft'
    check (status in ('draft', 'submitted', 'revision_requested', 'confirmed')),
  data_snapshot_json jsonb not null default '{}'::jsonb,
  submitted_at timestamptz,
  confirmed_at timestamptz,
  confirmed_by_user_id uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_participation_id, version_number)
);

create trigger trg_submission_versions_updated_at
  before update on submission_versions
  for each row execute function set_updated_at();

create index idx_submission_versions_participation on submission_versions(event_participation_id);

create table revision_requests (
  id uuid primary key default gen_random_uuid(),
  submission_version_id uuid not null references submission_versions(id),
  requested_by_user_id uuid not null references auth.users(id),
  requested_at timestamptz not null default now(),
  comment text,
  target_field_keys text[] not null default '{}',
  resolved_at timestamptz,
  resolved_by_version_id uuid references submission_versions(id)
);

create index idx_revision_requests_submission on revision_requests(submission_version_id);

-- ============================================================
-- 6. ファイル資産（非公開ストレージメタデータ）
-- ============================================================

create table file_assets (
  id uuid primary key default gen_random_uuid(),
  organizer_organization_id uuid not null references organizer_organizations(id),
  event_id uuid references events(id),
  uploader_user_id uuid references auth.users(id),
  kind text not null check (kind in (
    'logo', 'photo', 'announcement_attachment', 'invoice_pdf', 'export_zip', 'submission_attachment'
  )),
  storage_key text not null unique,
  content_type text not null,
  size_bytes bigint not null,
  checksum text,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index idx_file_assets_organization on file_assets(organizer_organization_id);
create index idx_file_assets_event on file_assets(event_id);

alter table exhibitor_profiles
  add constraint fk_exhibitor_profiles_logo_file
  foreign key (logo_file_id) references file_assets(id);

-- ============================================================
-- 7. 資料公開・通知対象・確認
-- ============================================================

create table announcements (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id),
  created_by_user_id uuid not null references auth.users(id),
  ack_required boolean not null default false,
  current_version_id uuid,
  created_at timestamptz not null default now()
);

create index idx_announcements_event on announcements(event_id);

create table announcement_versions (
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references announcements(id),
  version_number integer not null,
  title text not null,
  body text not null,
  status text not null default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz,
  published_by_user_id uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (announcement_id, version_number)
);

create index idx_announcement_versions_announcement on announcement_versions(announcement_id);

alter table announcements
  add constraint fk_announcements_current_version
  foreign key (current_version_id) references announcement_versions(id);

create table announcement_attachments (
  id uuid primary key default gen_random_uuid(),
  announcement_version_id uuid not null references announcement_versions(id),
  file_asset_id uuid not null references file_assets(id)
);

create index idx_announcement_attachments_version on announcement_attachments(announcement_version_id);

create table announcement_audiences (
  id uuid primary key default gen_random_uuid(),
  announcement_version_id uuid not null references announcement_versions(id),
  audience_type text not null check (audience_type in ('all', 'group', 'individual')),
  group_tags text[] not null default '{}',
  event_participation_ids uuid[] not null default '{}'
);

create index idx_announcement_audiences_version on announcement_audiences(announcement_version_id);

create table acknowledgements (
  id uuid primary key default gen_random_uuid(),
  announcement_version_id uuid not null references announcement_versions(id),
  event_participation_id uuid not null references event_participations(id),
  acknowledged_by_user_id uuid not null references auth.users(id),
  acknowledged_at timestamptz not null default now(),
  unique (announcement_version_id, event_participation_id, acknowledged_by_user_id)
);

create index idx_acknowledgements_participation on acknowledgements(event_participation_id);

-- ============================================================
-- 8. 通知配信（冪等性の要）
-- ============================================================

create table notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  event_participation_id uuid not null references event_participations(id),
  channel text not null default 'email' check (channel in ('email')),
  template_type text not null check (template_type in (
    'announcement_publish', 'announcement_resend', 'invoice_publish',
    'invoice_reminder', 'revision_request', 'email_verification', 'magic_link'
  )),
  related_entity_type text not null,
  related_entity_id uuid not null,
  idempotency_key text not null unique,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'bounced')),
  provider_message_id text,
  attempt_count integer not null default 0,
  last_attempted_at timestamptz,
  error_message text,
  created_at timestamptz not null default now()
);

create index idx_notification_deliveries_participation on notification_deliveries(event_participation_id);
create index idx_notification_deliveries_status on notification_deliveries(status);

-- ============================================================
-- 9. 出展料請求書・入金管理
-- ============================================================

create table exhibitor_invoices (
  id uuid primary key default gen_random_uuid(),
  event_participation_id uuid not null references event_participations(id),
  invoice_file_id uuid references file_assets(id),
  amount_yen integer not null check (amount_yen >= 0),
  due_date date,
  invoice_ack_status text not null default 'unconfirmed' check (invoice_ack_status in ('unconfirmed', 'confirmed')),
  invoice_ack_at timestamptz,
  invoice_ack_by_user_id uuid references auth.users(id),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid', 'paid')),
  paid_at timestamptz,
  organizer_internal_memo text,
  created_by_user_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_exhibitor_invoices_updated_at
  before update on exhibitor_invoices
  for each row execute function set_updated_at();

create index idx_exhibitor_invoices_participation on exhibitor_invoices(event_participation_id);

create table invoice_change_logs (
  id uuid primary key default gen_random_uuid(),
  exhibitor_invoice_id uuid not null references exhibitor_invoices(id),
  changed_by_user_id uuid not null references auth.users(id),
  changed_at timestamptz not null default now(),
  field_changed text not null,
  old_value text,
  new_value text,
  note text
);

create index idx_invoice_change_logs_invoice on invoice_change_logs(exhibitor_invoice_id);

-- ============================================================
-- 10. SaaS課金設定値（未確定価格はここに集約、is_test で本番反映を制御）
-- ============================================================

create table pricing_configs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_test boolean not null default true,
  effective_from timestamptz not null default now(),
  base_fee_yen integer not null,
  included_participants integer not null,
  overage_unit_yen integer not null,
  overage_block_size integer not null default 1,
  tax_rule text not null default 'excluded_undetermined',
  created_at timestamptz not null default now()
);

create table annual_plan_configs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_test boolean not null default true,
  effective_from timestamptz not null default now(),
  annual_fee_yen integer not null,
  participant_cap_per_event integer not null,
  event_count_cap integer,
  cap_definition_note text,
  created_at timestamptz not null default now()
);

-- ============================================================
-- 11. SaaS契約・課金台帳・請求
-- ============================================================

create table service_contracts (
  id uuid primary key default gen_random_uuid(),
  organizer_organization_id uuid not null references organizer_organizations(id),
  plan_type text not null check (plan_type in ('standard', 'annual')),
  status text not null default 'active' check (status in ('active', 'closed', 'cancelled')),
  pricing_config_id uuid references pricing_configs(id),
  annual_plan_config_id uuid references annual_plan_configs(id),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  payment_method_status text not null default 'not_set'
    check (payment_method_status in ('not_set', 'valid', 'failed')),
  created_at timestamptz not null default now(),
  check (
    (plan_type = 'standard' and pricing_config_id is not null and annual_plan_config_id is null)
    or (plan_type = 'annual' and annual_plan_config_id is not null and pricing_config_id is null)
  )
);

-- 組織ごとに status='active' な契約は同時に1件のみ（プラン変更時の二重請求防止の要）
create unique index uq_service_contracts_active_per_org
  on service_contracts(organizer_organization_id)
  where (status = 'active');

create index idx_service_contracts_organization on service_contracts(organizer_organization_id);

-- UsageLedger は追記専用。アプリDBロールへの UPDATE/DELETE 権限付与は行わない運用とする。
create table usage_ledger (
  id uuid primary key default gen_random_uuid(),
  organizer_organization_id uuid not null references organizer_organizations(id),
  service_contract_id uuid not null references service_contracts(id),
  event_id uuid not null references events(id),
  event_participation_id uuid references event_participations(id),
  entry_type text not null check (entry_type in ('billable_participation', 'correction_credit', 'correction_debit')),
  quantity integer not null default 1,
  unit_price_yen integer not null,
  amount_yen integer not null,
  idempotency_key text not null unique,
  related_entry_id uuid references usage_ledger(id),
  reason text,
  billed_in_invoice_id uuid,
  occurred_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index idx_usage_ledger_organization on usage_ledger(organizer_organization_id);
create index idx_usage_ledger_contract on usage_ledger(service_contract_id);
create index idx_usage_ledger_participation on usage_ledger(event_participation_id);
create index idx_usage_ledger_unbilled on usage_ledger(service_contract_id) where (billed_in_invoice_id is null);

create table service_invoices (
  id uuid primary key default gen_random_uuid(),
  organizer_organization_id uuid not null references organizer_organizations(id),
  service_contract_id uuid not null references service_contracts(id),
  billing_period_start timestamptz not null,
  billing_period_end timestamptz not null,
  base_fee_yen integer not null default 0,
  overage_count integer not null default 0,
  overage_amount_yen integer not null default 0,
  tax_amount_yen integer not null default 0,
  total_amount_yen integer not null default 0,
  status text not null default 'draft' check (status in ('draft', 'finalized', 'charged', 'failed', 'refunded')),
  idempotency_key text not null unique,
  finalized_at timestamptz,
  charged_at timestamptz,
  payment_event_id uuid,
  created_at timestamptz not null default now()
);

create index idx_service_invoices_organization on service_invoices(organizer_organization_id);
create index idx_service_invoices_contract on service_invoices(service_contract_id);

alter table usage_ledger
  add constraint fk_usage_ledger_billed_invoice
  foreign key (billed_in_invoice_id) references service_invoices(id);

-- ============================================================
-- 12. 決済Webhook冪等性
-- ============================================================

create table payment_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_event_id text not null,
  event_type text not null,
  payload_json jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  processing_status text not null default 'pending'
    check (processing_status in ('pending', 'processed', 'ignored', 'error')),
  related_service_invoice_id uuid references service_invoices(id),
  unique (provider, provider_event_id)
);

create index idx_payment_events_status on payment_events(processing_status);

alter table service_invoices
  add constraint fk_service_invoices_payment_event
  foreign key (payment_event_id) references payment_events(id);

-- ============================================================
-- 13. 監査ログ・重複登録レビュー
-- ============================================================

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id),
  organization_id uuid references organizer_organizations(id),
  action_type text not null,
  entity_type text not null,
  entity_id uuid not null,
  before_json jsonb,
  after_json jsonb,
  occurred_at timestamptz not null default now(),
  ip_address text
);

create index idx_audit_logs_organization on audit_logs(organization_id);
create index idx_audit_logs_entity on audit_logs(entity_type, entity_id);

create table duplicate_flags (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id),
  participation_id_a uuid not null references event_participations(id),
  participation_id_b uuid not null references event_participations(id),
  match_reason text not null check (match_reason in ('email', 'company_name_similarity')),
  status text not null default 'flagged' check (status in ('flagged', 'dismissed', 'merged')),
  reviewed_by_user_id uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_duplicate_flags_event on duplicate_flags(event_id);

-- ============================================================
-- 14. RLS ベースライン
-- ============================================================

create or replace function is_organizer_member(target_org_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from organizer_memberships m
    where m.organization_id = target_org_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  );
$$;

create or replace function is_exhibitor_member(target_profile_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from exhibitor_memberships m
    where m.exhibitor_profile_id = target_profile_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  );
$$;

-- 全テーブルで RLS を有効化（ポリシー未定義のテーブルはデフォルトで全拒否）
alter table organizer_organizations enable row level security;
alter table organizer_memberships enable row level security;
alter table exhibitor_profiles enable row level security;
alter table exhibitor_memberships enable row level security;
alter table events enable row level security;
alter table event_participations enable row level security;
alter table forms enable row level security;
alter table form_sections enable row level security;
alter table form_fields enable row level security;
alter table submission_versions enable row level security;
alter table revision_requests enable row level security;
alter table file_assets enable row level security;
alter table announcements enable row level security;
alter table announcement_versions enable row level security;
alter table announcement_attachments enable row level security;
alter table announcement_audiences enable row level security;
alter table acknowledgements enable row level security;
alter table notification_deliveries enable row level security;
alter table exhibitor_invoices enable row level security;
alter table invoice_change_logs enable row level security;
alter table pricing_configs enable row level security;
alter table annual_plan_configs enable row level security;
alter table service_contracts enable row level security;
alter table usage_ledger enable row level security;
alter table service_invoices enable row level security;
alter table payment_events enable row level security;
alter table audit_logs enable row level security;
alter table duplicate_flags enable row level security;

-- コアなテナント境界の SELECT ポリシーのみ先行実装。
-- 書き込み系ポリシーと、他のテーブル（forms/announcements/invoices等）の
-- SELECT/INSERT/UPDATE ポリシーは、各機能を実装する Phase 1-6 で追加する。

create policy "organizer members can view own organization"
  on organizer_organizations for select
  using (is_organizer_member(id));

create policy "organizer members can view own memberships"
  on organizer_memberships for select
  using (is_organizer_member(organization_id));

create policy "organizer members can view own events"
  on events for select
  using (is_organizer_member(organizer_organization_id));

create policy "exhibitor members can view own profile"
  on exhibitor_profiles for select
  using (is_exhibitor_member(id));

create policy "exhibitor members can view own memberships"
  on exhibitor_memberships for select
  using (is_exhibitor_member(exhibitor_profile_id));

create policy "organizer members can view participations in own events"
  on event_participations for select
  using (
    exists (
      select 1 from events e
      where e.id = event_participations.event_id
        and is_organizer_member(e.organizer_organization_id)
    )
  );

create policy "exhibitor members can view own participations"
  on event_participations for select
  using (is_exhibitor_member(exhibitor_profile_id));
