-- 0072_projects.sql
-- 組織＞プロジェクト＞イベントの3階層にする（例：A社＞プロジェクトA・プロジェクトB＞各イベント）。
-- 契約・課金・発行元情報・振込口座・メンバーは従来どおり組織単位で共通。プロジェクトは
-- イベントのまとまりで、プロジェクト内・組織全体でイベントを横断した一覧・集計に使う。
-- イベントのプロジェクトは任意（未設定＝未分類）。プロジェクトを削除しても
-- イベントは消えず未分類に戻る。閲覧権限は組織単位のまま（プロジェクト単位の制限は無い）。

create table projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizer_organizations(id),
  name text not null check (char_length(btrim(name)) between 1 and 100),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index idx_projects_organization on projects(organization_id);

alter table events add column project_id uuid references projects(id) on delete set null;
create index idx_events_project on events(project_id);

-- 他の組織のプロジェクトにイベントを入れられないようにする。
create function check_event_project_organization()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.project_id is not null and not exists (
    select 1 from projects p
    where p.id = new.project_id and p.organization_id = new.organizer_organization_id
  ) then
    raise exception 'project does not belong to the event organization';
  end if;
  return new;
end;
$$;

create trigger trg_events_project_organization
  before insert or update of project_id, organizer_organization_id on events
  for each row execute function check_event_project_organization();

alter table projects enable row level security;

create policy "organizer members can select projects"
  on projects for select
  using (is_organizer_member(organization_id));

create policy "owner or admin can insert projects"
  on projects for insert
  with check (
    exists (
      select 1 from organizer_memberships m
      where m.organization_id = projects.organization_id
        and m.user_id = auth.uid()
        and m.status = 'active'
        and m.role in ('owner', 'admin')
    )
  );

create policy "owner or admin can update projects"
  on projects for update
  using (
    exists (
      select 1 from organizer_memberships m
      where m.organization_id = projects.organization_id
        and m.user_id = auth.uid()
        and m.status = 'active'
        and m.role in ('owner', 'admin')
    )
  )
  with check (
    exists (
      select 1 from organizer_memberships m
      where m.organization_id = projects.organization_id
        and m.user_id = auth.uid()
        and m.status = 'active'
        and m.role in ('owner', 'admin')
    )
  );

create policy "owner or admin can delete projects"
  on projects for delete
  using (
    exists (
      select 1 from organizer_memberships m
      where m.organization_id = projects.organization_id
        and m.user_id = auth.uid()
        and m.status = 'active'
        and m.role in ('owner', 'admin')
    )
  );
