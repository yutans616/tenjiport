-- 0033_phase10_invoice_pdf_fields.sql
-- 請求書PDFの発行元欄に郵便番号・住所を記載できるよう、組織の請求関連設定
-- （organizer_bank_accounts。適格請求書発行事業者登録番号も既にここに入っている）
-- に追加する。

alter table organizer_bank_accounts add column postal_code text;
alter table organizer_bank_accounts add column address text;
