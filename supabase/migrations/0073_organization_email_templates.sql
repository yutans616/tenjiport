-- 0073_organization_email_templates.sql
-- 出展者へ送る通知メール（資料公開・請求書・修正依頼と、それぞれの再送）の件名・本文、
-- および全メール共通の署名を、組織ごとに変更できるようにする。未設定の項目は
-- アプリ側の標準文面を使う。template_type='signature' の行は署名（bodyのみ使用）。
-- あわせて、実際に送った件名・本文をnotification_deliveriesに残し、主催者が
-- 送信済みの文面を後から確認できるようにする。

create table organization_email_templates (
  organization_id uuid not null references organizer_organizations(id),
  template_type text not null check (template_type in (
    'announcement_publish', 'announcement_resend', 'invoice_publish',
    'invoice_reminder', 'revision_request', 'revision_request_resend', 'signature'
  )),
  subject text check (subject is null or char_length(subject) <= 200),
  body text check (body is null or char_length(body) <= 5000),
  updated_at timestamptz not null default now(),
  primary key (organization_id, template_type)
);

alter table organization_email_templates enable row level security;

create policy "organizer members can select email templates"
  on organization_email_templates for select
  using (is_organizer_member(organization_id));

create policy "owner or admin can insert email templates"
  on organization_email_templates for insert
  with check (
    exists (
      select 1 from organizer_memberships m
      where m.organization_id = organization_email_templates.organization_id
        and m.user_id = auth.uid()
        and m.status = 'active'
        and m.role in ('owner', 'admin')
    )
  );

create policy "owner or admin can update email templates"
  on organization_email_templates for update
  using (
    exists (
      select 1 from organizer_memberships m
      where m.organization_id = organization_email_templates.organization_id
        and m.user_id = auth.uid()
        and m.status = 'active'
        and m.role in ('owner', 'admin')
    )
  )
  with check (
    exists (
      select 1 from organizer_memberships m
      where m.organization_id = organization_email_templates.organization_id
        and m.user_id = auth.uid()
        and m.status = 'active'
        and m.role in ('owner', 'admin')
    )
  );

create policy "owner or admin can delete email templates"
  on organization_email_templates for delete
  using (
    exists (
      select 1 from organizer_memberships m
      where m.organization_id = organization_email_templates.organization_id
        and m.user_id = auth.uid()
        and m.status = 'active'
        and m.role in ('owner', 'admin')
    )
  );

alter table notification_deliveries add column sent_subject text;
alter table notification_deliveries add column sent_body text;
