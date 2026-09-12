-- 0052_phase12_organizer_org_profile_edit.sql
-- 組織名・請求先メールアドレスは新規作成時（create_organizer_organization）にしか
-- 設定できず、以降変更する手段がどこにも無かった。/settings から編集できるようにする。
--
-- あわせて、調査の過程で organizer_organizations に対する既存のUPDATE用RLSポリシー
-- （0012_phase5_stripe_setup.sql「organizer can update own organization payment fields」）
-- が is_organizer_member（役割を問わず全アクティブメンバー）だけを条件にした行レベルの
-- ポリシーで、列を一切制限していないことが判明した。このテーブルへの他のすべての書き込み
-- （create_organizer_organization・record_payment_method_setup等）はSECURITY DEFINER
-- RPC経由でこのポリシーに一切依存しておらず（アプリ全体をgrepして確認済み）、
-- 実質誰も使っていない死んだポリシーである一方、その気になれば一般スタッフでも
-- billing_exempt・payment_provider_customer_id・stripe_default_payment_method_id・
-- status を直接書き換え可能な状態だった（無制限利用の自己付与や決済情報の差し替えが
-- 理論上可能）。実害の報告は無いが、放置する理由も無いため塞ぐ。

drop policy "organizer can update own organization payment fields" on organizer_organizations;

-- 組織名・請求先メールアドレスの変更（オーナー・管理者のみ）。
create or replace function update_organizer_organization_profile(p_org_id uuid, p_name text, p_billing_email text)
returns organizer_organizations
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text;
  v_before organizer_organizations;
  v_after organizer_organizations;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select role into v_role
  from organizer_memberships
  where organization_id = p_org_id and user_id = auth.uid() and status = 'active';

  if v_role is null or v_role not in ('owner', 'admin') then
    raise exception 'not authorized';
  end if;

  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'organization name is required';
  end if;
  if p_billing_email is null or length(trim(p_billing_email)) = 0 then
    raise exception 'billing email is required';
  end if;

  select * into v_before from organizer_organizations where id = p_org_id;

  update organizer_organizations
  set name = p_name, billing_email = p_billing_email
  where id = p_org_id
  returning * into v_after;

  insert into audit_logs (actor_user_id, organization_id, action_type, entity_type, entity_id, before_json, after_json)
  values (auth.uid(), p_org_id, 'update_organizer_organization_profile', 'organizer_organization', p_org_id, to_jsonb(v_before), to_jsonb(v_after));

  return v_after;
end;
$$;
