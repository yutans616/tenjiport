-- 0069_demo_ephemeral_sessions.sql
-- 訪問者ごとのデモ完全分離（tenjiport_demo_lp_spec.md 4.3節P2）。
-- これまでは is_demo=true の組織を1件だけに限定し、全訪問者が共有していた。
-- 今後は訪問者ごとにエフェメラルな組織（+3つのダミーauthユーザー）を発行し、
-- ブラウザのCookie（demo_token）で対応付ける。demo_sessionsがその対応表。

-- 「デモ組織は高々1件」制約はもう成り立たない（訪問者ごとに複数存在する）。
drop index if exists organizer_organizations_single_demo_org;

create table demo_sessions (
  token text primary key,
  organization_id uuid not null references organizer_organizations(id) on delete cascade,
  organizer_user_id uuid not null,
  background_exhibitor_user_id uuid not null,
  featured_exhibitor_user_id uuid not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index idx_demo_sessions_expires_at on demo_sessions(expires_at);
create index idx_demo_sessions_organization on demo_sessions(organization_id);

-- サーバー側（service role）のみが読み書きする内部テーブルのため、
-- 通常ロールからは全拒否（RLS有効化・ポリシー無し）にする。
alter table demo_sessions enable row level security;
