-- 0007_phase2_cascade_delete_fields.sql
-- deleteSection（セクション削除）が、配下のform_fieldsを先に消さずセクションだけ
-- 削除しようとしており、外部キー制約違反で失敗する不具合があった（動作検証で発見）。
-- 「セクションを削除する」は配下の項目も含めて削除する、という意図の操作のため、
-- 外部キーにON DELETE CASCADEを付け直し、DB側で一貫して解決する。

alter table form_fields drop constraint form_fields_form_section_id_fkey;
alter table form_fields
  add constraint form_fields_form_section_id_fkey
  foreign key (form_section_id) references form_sections(id) on delete cascade;
