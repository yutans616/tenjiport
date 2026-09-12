-- 0046_phase12_billing_exempt_org.sql
-- TenjiPort運営者自身の組織を、課金対象から恒久的に除外できるようにする。
-- アプリコード側（createEvent / (organizer)layout / runEventBilling / plan page）で
-- billing_exempt=trueの組織は契約の有無・カード登録状況にかかわらず無制限に利用でき、
-- 一切課金されない。

alter table organizer_organizations add column billing_exempt boolean not null default false;

-- TenjiPort運営者自身の組織（BlackishGear）を課金対象外にする。
update organizer_organizations set billing_exempt = true
where id = '95c5dd8e-2369-40f2-a027-add014785709';

-- 既存の有効な通常プラン契約はもう不要（billing_exemptにより契約自体が
-- 参照されなくなるため）、履歴として残しつつ終了させる。
update service_contracts set status = 'closed', ended_at = now()
where organizer_organization_id = '95c5dd8e-2369-40f2-a027-add014785709' and status = 'active';
