-- 0017_phase8_annual_plan_gating.sql
-- 年間プランは大型案件向けの個別提供とし、通常は「年間プランへ切り替える」導線を非表示にする。
-- 特定の主催者にだけ、個別合意した annual_plan_configs 行（金額・上限をその組織用にカスタマイズ）を
-- 紐付けることで、その組織にのみパーソナライズされた年間プランの案内を表示できるようにする。
--
-- 運用: 個別提供する組織向けに annual_plan_configs へ新規行（is_test=false, 合意した annual_fee_yen 等）を作成し、
-- organizer_organizations.annual_plan_offer_config_id にそのidを設定する（Supabase側で手動運用。組織自身は更新不可）。

alter table organizer_organizations
  add column annual_plan_offer_config_id uuid references annual_plan_configs(id);

-- 組織は自組織の行をSELECTはできるが、この列は主催者自身のクライアントからは更新できないようにする
-- （個別提供の可否・金額を自己申告で書き換えられないようにするため）。
revoke update (annual_plan_offer_config_id) on organizer_organizations from authenticated;

-- annual_plan_configs は元々 using(true) で全件参照可能だったが、個別提供分の金額が
-- 他組織から見えてしまわないよう、関連する行のみ参照可能に絞る。
drop policy "organizer can select own annual plan configs" on annual_plan_configs;

create policy "organizer can select relevant annual plan configs"
  on annual_plan_configs for select
  using (
    is_test = true
    or exists (
      select 1 from organizer_organizations oo
      where oo.annual_plan_offer_config_id = annual_plan_configs.id
        and is_organizer_member(oo.id)
    )
    or exists (
      select 1 from service_contracts sc
      where sc.annual_plan_config_id = annual_plan_configs.id
        and is_organizer_member(sc.organizer_organization_id)
    )
  );
