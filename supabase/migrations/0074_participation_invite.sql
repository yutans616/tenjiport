-- 0074_participation_invite.sql
-- 過去のイベントの出展者を次のイベントへ招待する機能のため、通知の種類に
-- 'participation_invite'（出展のご案内）を追加する。招待された出展者は
-- event_participations.status='invited'で登録され、提出するまで課金対象にならない
-- （is_billableは提出時にtrueになる）。メール文面も組織ごとに変更できるようにする。

alter table notification_deliveries drop constraint notification_deliveries_template_type_check;
alter table notification_deliveries add constraint notification_deliveries_template_type_check
  check (template_type in (
    'announcement_publish', 'announcement_resend', 'invoice_publish',
    'invoice_reminder', 'revision_request', 'revision_request_resend',
    'participation_invite', 'email_verification', 'magic_link'
  ));

alter table organization_email_templates drop constraint organization_email_templates_template_type_check;
alter table organization_email_templates add constraint organization_email_templates_template_type_check
  check (template_type in (
    'announcement_publish', 'announcement_resend', 'invoice_publish',
    'invoice_reminder', 'revision_request', 'revision_request_resend',
    'participation_invite', 'signature'
  ));
