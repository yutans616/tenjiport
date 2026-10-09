-- 0076_membership_last_active.sql
-- 運営者ページで組織ごとの最終利用日時を確認できるよう、主催者画面を開いた日時を
-- メンバーごとに記録する。ログイン日時（auth.users.last_sign_in_at）はログインし直した時しか
-- 更新されず、ログイン状態のまま画面を開いた利用を把握できないため。
-- 書き込みはサーバー側（service role）で、主催者画面の表示後に最大10分に1回だけ行う。

alter table organizer_memberships add column last_active_at timestamptz;
