-- 0059_phase12_security_fixes_batch1.sql
-- 全体バグ・ギャップ点検で見つかったセキュリティ上の穴を修正する（1件目）。
--
-- get_or_create_client_code / generate_invoice_number は SECURITY DEFINER でありながら、
-- 同じマイグレーションファイル内の他の全関数（create_exhibitor_invoice等）と異なり
-- auth.uid()チェック・is_organizer_memberチェックが一切無く、revoke execute もされて
-- いなかった。PostgreSQLは新規関数のEXECUTE権限をデフォルトでPUBLICに付与するため、
-- 未ログインの匿名クライアントでも直接RPC呼び出しが可能で、他組織IDを指定して
-- organizer_exhibitor_codesに任意の行を書き込み、取引先コードの連番を汚染できる
-- 状態だった。
--
-- 両関数は create_exhibitor_invoice / create_exhibitor_invoices_bulk の内部からのみ
-- 呼ばれる想定（呼び出し元が既に is_organizer_member を検証済み）のため、他の内部
-- ヘルパー（finalize_event_service_invoice 等）と同じ revoke パターンで塞ぐ。
-- SECURITY DEFINER関数同士の内部呼び出しは呼び出し元の所有者権限で行われるため、
-- revokeしても既存の正規の呼び出し経路には影響しない。

revoke execute on function get_or_create_client_code(uuid, uuid) from public, anon, authenticated;
revoke execute on function generate_invoice_number(uuid, uuid) from public, anon, authenticated;
