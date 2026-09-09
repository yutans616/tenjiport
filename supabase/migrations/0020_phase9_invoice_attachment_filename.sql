-- 0020_phase9_invoice_attachment_filename.sql
-- 出展者側の請求書ファイルリンクも、資料の添付ファイルと同様にファイル名を表示できるようにする。
-- file_assetsはRLSで主催者組織メンバーのみSELECT可能なため、既存のcan_access_file_asset
-- （ダウンロードAPIと同じ認可ロジック）を再利用したSECURITY DEFINER関数を用意する。

create or replace function get_accessible_file_filename(p_file_asset_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_filename text;
begin
  if not can_access_file_asset(p_file_asset_id) then
    return null;
  end if;

  select filename into v_filename from file_assets where id = p_file_asset_id;
  return v_filename;
end;
$$;
