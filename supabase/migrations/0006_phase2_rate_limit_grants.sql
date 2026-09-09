-- 0006_phase2_rate_limit_grants.sql
-- check_and_increment_rate_limit はPostgreSQLのデフォルト仕様上、作成時にPUBLICへ
-- EXECUTE権限が付与されており、anon/authenticatedキーからも直接呼び出せてしまっていた
-- （動作検証で確認）。第三者が特定のIP・メールアドレスのカウンタを故意に消費させ、
-- 正規の出展者を意図的にレート制限できてしまうため、Server Action（service_role経由）
-- からのみ呼び出せるよう権限を絞る。

revoke execute on function check_and_increment_rate_limit(text, text, integer, integer) from public;
revoke execute on function check_and_increment_rate_limit(text, text, integer, integer) from anon;
revoke execute on function check_and_increment_rate_limit(text, text, integer, integer) from authenticated;
grant execute on function check_and_increment_rate_limit(text, text, integer, integer) to service_role;
