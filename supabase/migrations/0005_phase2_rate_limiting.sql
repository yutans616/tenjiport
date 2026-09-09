-- 0005_phase2_rate_limiting.sql
-- 公開URL（メール確認リクエスト・提出）へのスパム対策：固定ウィンドウ方式のレート制限。
--
-- 課金カウントが「初回提出完了の参加レコード数」に直結するため、公開URLへの乱用が
-- そのまま主催者の実費コストに波及する（ブラッシュアップ提案1）。ここでは
-- 外部サービス（Redis等）を追加せず、Postgres内で完結する軽量なレート制限を実装する。
-- ハニーポット（見えない入力欄）はアプリ側（Server Action）で検査するため、DBの変更は不要。
--
-- 呼び出し側は必ずService Role（信頼されたサーバー環境）からのみ使用する。
-- クライアントに直接RPCを公開しない（アプリ層のServer Action経由のみ）。

create table rate_limit_hits (
  id uuid primary key default gen_random_uuid(),
  scope text not null,
  key text not null,
  window_start timestamptz not null,
  count integer not null default 1,
  unique (scope, key, window_start)
);

alter table rate_limit_hits enable row level security;
-- ポリシーは意図的に定義しない（RLS有効・ポリシーなし＝全拒否）。
-- アクセスは下記のSECURITY DEFINER関数経由のみに限定する。

create or replace function check_and_increment_rate_limit(
  p_scope text,
  p_key text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_window_start timestamptz;
  v_count integer;
begin
  v_window_start := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);

  insert into rate_limit_hits (scope, key, window_start, count)
  values (p_scope, p_key, v_window_start, 1)
  on conflict (scope, key, window_start) do update set count = rate_limit_hits.count + 1
  returning count into v_count;

  return v_count <= p_limit;
end;
$$;
