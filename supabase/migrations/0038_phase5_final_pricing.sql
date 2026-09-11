-- 0038_phase5_final_pricing.sql
-- 正式な料金を確定する。既存のis_test=trueの行はテスト・検証用にそのまま残し、
-- 新たにis_test=falseの行を追加して、実際のプラン開始時にはこちらを参照するようにする
-- （コード側の参照先切り替えは本マイグレーションと合わせて別途行う）。

insert into pricing_configs (name, is_test, base_fee_yen, included_participants, overage_unit_yen, tax_rule)
values ('通常プラン（開催ごと）', false, 9800, 30, 300, 'included_10pct');

insert into annual_plan_configs (name, is_test, annual_fee_yen, participant_cap_per_event, event_count_cap, cap_definition_note)
values (
  '年間プラン',
  false,
  298000,
  300,
  6,
  '契約開始日から12か月間が対象です。1開催あたり300社まで、未使用枠は他の開催へ合算できません。年間6開催を超える、または1開催301社以上が見込まれる場合は個別見積もりとなります（年額298,000円を基本の出発点に、開催数・最大出展者数・必要な支援を加味して算定）。上限に近づいた場合は上限に達する前に契約変更をご案内し、既存の出展者の閲覧・提出を突然停止することはありません。'
);
