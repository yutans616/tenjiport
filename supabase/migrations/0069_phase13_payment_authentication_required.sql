-- 0069_phase13_payment_authentication_required.sql
-- Stripe本番環境移行に伴い、3Dセキュア等の追加認証が必要なカードへの対応を追加する。
--
-- これまでattemptChargeは automatic_payment_methods: { allow_redirects: 'never' } で
-- リダイレクト系の認証を明示的に無効化しており、追加認証が必要なカードは
-- 単に「課金失敗」として扱っていた（テストモードのカードでは再現しない挙動）。
-- 本番の実カードでは3Dセキュアが要求されるケースが相応にあるため、この状態を
-- 明示的に検知し、出展者ではなく主催者自身が「その場にいる」オンセッションの
-- 確認画面（/plan/confirm-payment/[invoiceId]、Stripe.jsのconfirmCardPaymentを使用）
-- へ案内できるようにする。

alter table service_invoices add column requires_payment_authentication boolean not null default false;
