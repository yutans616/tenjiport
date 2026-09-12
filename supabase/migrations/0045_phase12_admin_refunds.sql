-- 0045_phase12_admin_refunds.sql
-- TenjiPort運営者が、TenjiPort利用料請求（service_invoices）を返金できるようにする。
-- 全額・部分返金の両方に対応するため、返金履歴を別テーブルに持ち、
-- service_invoices.refunded_amount_yenで累計額を追跡する。
-- refunded_amount_yen < total_amount_yenの間はstatus='charged'のまま維持し、
-- 全額に達した時点でのみstatus='refunded'に遷移する（新しいstatus値は増やさない）。

alter table service_invoices add column refunded_amount_yen integer not null default 0;

create table service_invoice_refunds (
  id uuid primary key default gen_random_uuid(),
  service_invoice_id uuid not null references service_invoices(id),
  amount_yen integer not null check (amount_yen > 0),
  reason text,
  stripe_refund_id text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index idx_service_invoice_refunds_invoice on service_invoice_refunds(service_invoice_id);

alter table service_invoice_refunds enable row level security;

-- 返金の実行自体はTenjiPort運営者のみ（service roleクライアント経由、RLSをバイパス）が
-- 行うため書き込みポリシーは不要。主催者は自分の組織の返金履歴を閲覧できる
-- （/planページへの表示追加は将来対応、ここではポリシーのみ用意する）。
create policy "organizer can select own service invoice refunds"
  on service_invoice_refunds for select
  using (
    exists (
      select 1 from service_invoices si
      where si.id = service_invoice_refunds.service_invoice_id
        and is_organizer_member(si.organizer_organization_id)
    )
  );
