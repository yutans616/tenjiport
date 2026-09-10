-- 0034_phase10_invoice_company_phone.sql
-- 請求書PDFの発行元情報に会社名・電話番号を追加。
-- organizer_organizations.name（アプリ内の組織表示名）とは別に、請求書に記載する
-- 正式な会社名を持てるようにする（表示名と法人名が異なるケースに対応）。

alter table organizer_bank_accounts
  add column company_name text,
  add column phone_number text;
