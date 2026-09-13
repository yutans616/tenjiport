-- 0070_demo_analytics_events.sql
-- /demo LPの計測（tenjiport_demo_lp_spec.md 8章）を、GA4への送信に加えて自社DBにも
-- 記録する。GA4のレポート機能を使わなくても、管理画面（/admin）で即座にKPIを
-- 集計・表示できるようにするため。会社名・メールアドレス等の自由入力は保存しない
-- （event_typeは許可リスト固定、propsはAPI側でキー・型を検証したものだけを許可する）。

create table demo_analytics_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in (
    'demo_lp_view', 'demo_start_click', 'document_view_click',
    'document_download_click', 'booking_open_click', 'signup_click'
  )),
  props jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index idx_demo_analytics_events_type_created on demo_analytics_events(event_type, created_at);

-- サーバー側（service role）のみが読み書きする内部集計テーブルのため、
-- 通常ロールからは全拒否（RLS有効化・ポリシー無し）にする。
alter table demo_analytics_events enable row level security;
