-- 0029_phase10_announcement_audience_edit.sql
-- 資料の公開対象（announcement_audiences）は作成時に1回設定するだけで、後から
-- 変更する手段がなかった（DELETEポリシーも存在しなかった）。編集機能を追加するため、
-- 主催者が自組織イベントの資料についてDELETEできるポリシーを追加する
-- （編集は「既存行を削除して作り直す」方式のため、DELETEポリシーが必須）。

create policy "organizer can delete announcement audiences in own events"
  on announcement_audiences for delete
  using (
    exists (
      select 1 from announcement_versions av
      join announcements a on a.id = av.announcement_id
      join events e on e.id = a.event_id
      where av.id = announcement_audiences.announcement_version_id and is_organizer_member(e.organizer_organization_id)
    )
  );
