-- 0064_phase12_fix_revision_request_resend_template_type.sql
-- 0063で追加したresend_revision_requestが実際に動作するかを検証したところ、
-- notification_deliveries.template_typeのCHECK制約に'revision_request_resend'が
-- 含まれておらず、挿入時に制約違反で失敗することが判明した（既存のresend_announcement/
-- resend_invoice_reminder導入時も同様にannouncement_resend/invoice_reminderを
-- この制約へ追加する必要があったはずだが、こちらは既に含まれていたため見落とさずに済んでいた）。

alter table notification_deliveries drop constraint notification_deliveries_template_type_check;
alter table notification_deliveries add constraint notification_deliveries_template_type_check
  check (template_type in (
    'announcement_publish', 'announcement_resend', 'invoice_publish',
    'invoice_reminder', 'revision_request', 'revision_request_resend',
    'email_verification', 'magic_link'
  ));
