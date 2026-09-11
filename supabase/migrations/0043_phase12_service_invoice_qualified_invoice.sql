-- 0043_phase12_service_invoice_qualified_invoice.sql
-- TenjiPort自身の利用料請求書（service_invoices）を、適格請求書（インボイス制度）の
-- 記載要件を満たすPDFとして自動発行できるようにする。
--
-- exhibitor_invoices（主催者→出展者）と違い、service_invoicesの売り手は常に
-- TenjiPort運営会社1社のみのため、組織ごとの登録番号テーブルは不要。TenjiPort側の
-- 会社情報・登録番号はアプリコード側の定数として持つ（/legal/tokushohoと同じ方針）。
--
-- 請求書番号・PDFの確定は「実際に課金が成功した時点」（Stripe Webhookでstatus='charged'に
-- なったタイミング）で行う。課金失敗に終わった請求行は番号を消費しない
-- （＝欠番を作らない）ための意図的な設計。

alter table service_invoices add column invoice_number text;
create unique index idx_service_invoices_number on service_invoices(invoice_number) where invoice_number is not null;

alter table service_invoices add column invoice_file_id uuid references file_assets(id);

-- 請求書番号（SI-発行年月-連番、例：SI-202609-0001）を採番する。TenjiPort側は
-- 単一の売り手のため、組織をまたいだ通し番号とする。cron/Webhookからservice roleで
-- 呼ぶ専用関数のためauth.uid()チェックは行わず、REVOKE/GRANTで直接呼び出しを防ぐ。
create function assign_service_invoice_number(p_service_invoice_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_existing text;
  v_year_month text;
  v_seq int;
  v_number text;
begin
  select invoice_number into v_existing from service_invoices where id = p_service_invoice_id;
  if v_existing is not null then
    return v_existing;
  end if;

  v_year_month := to_char(now(), 'YYYYMM');

  -- 同一年月内の採番を直列化する（advisory lockはトランザクション終了時に自動解放される）。
  perform pg_advisory_xact_lock(hashtextextended('service_invoice_number:' || v_year_month, 0));

  select count(*) + 1 into v_seq
  from service_invoices
  where invoice_number is not null
    and to_char(created_at, 'YYYYMM') = v_year_month;

  v_number := 'SI-' || v_year_month || '-' || lpad(v_seq::text, 4, '0');

  update service_invoices set invoice_number = v_number where id = p_service_invoice_id;

  return v_number;
end;
$$;

revoke execute on function assign_service_invoice_number(uuid) from public, anon, authenticated;
grant execute on function assign_service_invoice_number(uuid) to service_role;

-- 自動生成した請求書PDFをfile_assetsとしてアップロードした後、請求書に紐付ける。
-- Stripe Webhook（service role・非対話的処理）から呼ぶ専用関数のためauth.uid()チェックは
-- 行わない。invoice_file_idがnullの場合のみ更新する（二重生成時の上書き防止）。
create function attach_service_invoice_pdf(p_service_invoice_id uuid, p_file_asset_id uuid)
returns service_invoices
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_result service_invoices;
begin
  update service_invoices
  set invoice_file_id = p_file_asset_id
  where id = p_service_invoice_id and invoice_file_id is null
  returning * into v_result;

  return v_result;
end;
$$;

revoke execute on function attach_service_invoice_pdf(uuid, uuid) from public, anon, authenticated;
grant execute on function attach_service_invoice_pdf(uuid, uuid) to service_role;
