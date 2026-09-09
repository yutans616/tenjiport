-- 0015_phase7_uploader_file_access.sql
-- Phase 7: 出展者が自分でアップロードしたファイル（ロゴ等）を、提出後も自分で閲覧できるようにする。

create or replace function can_access_file_asset(p_file_asset_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org_id uuid;
  v_uploader_user_id uuid;
begin
  if auth.uid() is null then
    return false;
  end if;

  select organizer_organization_id, uploader_user_id into v_org_id, v_uploader_user_id
  from file_assets where id = p_file_asset_id;

  if v_org_id is not null and is_organizer_member(v_org_id) then
    return true;
  end if;

  if v_uploader_user_id is not null and v_uploader_user_id = auth.uid() then
    return true;
  end if;

  if exists (
    select 1
    from announcement_attachments att
    join announcement_versions av on av.id = att.announcement_version_id
    join announcements a on a.id = av.announcement_id
    join announcement_audiences aud on aud.announcement_version_id = av.id
    join event_participations ep on ep.event_id = a.event_id
    join exhibitor_memberships m on m.exhibitor_profile_id = ep.exhibitor_profile_id
    where att.file_asset_id = p_file_asset_id
      and av.status = 'published'
      and m.user_id = auth.uid()
      and m.status = 'active'
      and (
        aud.audience_type = 'all'
        or (aud.audience_type = 'individual' and ep.id = any (aud.event_participation_ids))
      )
  ) then
    return true;
  end if;

  return exists (
    select 1
    from exhibitor_invoices inv
    join event_participations ep on ep.id = inv.event_participation_id
    join exhibitor_memberships m on m.exhibitor_profile_id = ep.exhibitor_profile_id
    where inv.invoice_file_id = p_file_asset_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  );
end;
$$;
