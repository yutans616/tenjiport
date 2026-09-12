-- 0048_phase12_exhibitor_brand_profile_edit.sql
-- 出展者が自分のブランドプロフィール（exhibitor_profiles）を編集する手段が
-- これまで一切存在しなかった（RLSにSELECTポリシーはあるがUPDATEポリシーが無く、
-- 書き込みはstart_or_resume_submissionでの新規作成時のみだった）ため追加する。
-- 既存の書き込み系RPCと同じくSECURITY DEFINER + is_exhibitor_memberでの権限チェックとする
-- （RLSの直接UPDATEポリシーではなく、必須項目のサーバー側バリデーションを行うため）。

create function update_exhibitor_profile(
  p_exhibitor_profile_id uuid,
  p_brand_name text,
  p_company_name text,
  p_address text,
  p_website text,
  p_default_contact_name text,
  p_default_contact_email text,
  p_default_contact_phone text,
  p_description text
)
returns exhibitor_profiles
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_result exhibitor_profiles;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;
  if not is_exhibitor_member(p_exhibitor_profile_id) then
    raise exception 'not authorized';
  end if;
  if p_brand_name is null or length(trim(p_brand_name)) = 0 then
    raise exception 'brand name is required';
  end if;
  if p_company_name is null or length(trim(p_company_name)) = 0 then
    raise exception 'company name is required';
  end if;

  update exhibitor_profiles
  set brand_name = p_brand_name,
      company_name = p_company_name,
      address = p_address,
      website = p_website,
      default_contact_name = p_default_contact_name,
      default_contact_email = p_default_contact_email,
      default_contact_phone = p_default_contact_phone,
      description = p_description,
      updated_at = now()
  where id = p_exhibitor_profile_id
  returning * into v_result;

  return v_result;
end;
$$;
