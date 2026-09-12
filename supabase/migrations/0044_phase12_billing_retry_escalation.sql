-- 0044_phase12_billing_retry_escalation.sql
-- 課金自動リトライが上限（3回）に達した後、静かに放置されていた問題への対応。
--
-- 新しいstatus値 'uncollectible'（Stripeの同名ステータスに合わせた命名）を追加し、
-- 自動リトライを使い切った請求を明示的に区別する。'failed'のままだと「まだ自動で
-- リトライされる」のか「もう諦めた」のか画面上・コード上で区別できないため。
-- 実際の遷移・通知・手動再試行はアプリケーション側（runEventBilling.ts /
-- webhooks/stripe/route.ts / plan/actions.ts）で行う。

alter table service_invoices drop constraint service_invoices_status_check;
alter table service_invoices add constraint service_invoices_status_check
  check (status in ('draft', 'finalized', 'charged', 'failed', 'refunded', 'uncollectible'));
