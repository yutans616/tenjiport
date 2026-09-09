-- seed.sql
-- 開発・テスト環境用の初期データ。すべて is_test = true。
-- 本番運用に反映する際は、正式な価格・上限が確定してから is_test = false の行を別途投入する。
-- （exhibitor_saas_design_brief.md 9章「現行料金案」をそのままテスト値として使用）

insert into pricing_configs (name, is_test, base_fee_yen, included_participants, overage_unit_yen, overage_block_size, tax_rule)
values ('standard-test-v1', true, 9800, 30, 300, 1, 'tax_excluded_undetermined');

insert into annual_plan_configs (name, is_test, annual_fee_yen, participant_cap_per_event, event_count_cap, cap_definition_note)
values (
  'annual-test-v1',
  true,
  1980000,
  300,
  null,
  '年額・年間開催上限は未確定（ブリーフ14章）。ここではテスト用の仮値を使用し、本番反映しない。'
);
