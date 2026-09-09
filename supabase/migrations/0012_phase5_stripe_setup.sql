-- 0012_phase5_stripe_setup.sql
-- カード登録（Stripe Checkout, mode=setup）に必要な列を追加する。
-- 支払い方法はService Contractではなく組織単位で保持する（プラン変更をまたいで使い回すため）。

alter table organizer_organizations add column stripe_default_payment_method_id text;

create policy "organizer can update own organization payment fields"
  on organizer_organizations for update
  using (is_organizer_member(id))
  with check (is_organizer_member(id));

-- カード登録完了時に、組織の支払い方法とアクティブな契約のpayment_method_statusを
-- 一括更新する（Checkout成功後のリダイレクト先ページから呼び出す）。
create or replace function record_payment_method_setup(
  p_org_id uuid,
  p_stripe_customer_id text,
  p_stripe_payment_method_id text
)
returns organizer_organizations
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_result organizer_organizations;
begin
  if auth.uid() is null or not is_organizer_member(p_org_id) then
    raise exception 'not authorized';
  end if;

  update organizer_organizations
  set payment_provider_customer_id = p_stripe_customer_id, stripe_default_payment_method_id = p_stripe_payment_method_id
  where id = p_org_id
  returning * into v_result;

  update service_contracts
  set payment_method_status = 'valid'
  where organizer_organization_id = p_org_id and status = 'active';

  insert into audit_logs (actor_user_id, organization_id, action_type, entity_type, entity_id, after_json)
  values (auth.uid(), p_org_id, 'record_payment_method_setup', 'organizer_organization', p_org_id, jsonb_build_object('stripe_customer_id', p_stripe_customer_id));

  return v_result;
end;
$$;
