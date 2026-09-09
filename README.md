# 出展者情報・資料共有管理SaaS

キャンプ・アウトドア展示会向けの出展者情報収集・資料共有・入金管理SaaS（Next.js / Supabase / Resend / Stripe）。

サービス名は未定。現時点は設計・実装の初期段階（Phase 0）。

## ドキュメント

- [docs/exhibitor_saas_design_brief.md](./docs/exhibitor_saas_design_brief.md) — 元の設計ブリーフ（確定/設計案/未確定の区別あり）
- [docs/implementation-plan.md](./docs/implementation-plan.md) — 実装計画・ブラッシュアップ提案・技術スタック・フェーズ分割
- [docs/screens.md](./docs/screens.md) — 画面一覧
- [docs/data-model.md](./docs/data-model.md) — データモデル・状態遷移
- [docs/open-decisions.md](./docs/open-decisions.md) — 残る判断事項（本番反映前に確定するもの）

## セットアップ

```bash
npm install
cp .env.example .env.local   # Supabase/Resend/Stripeの認証情報を設定
npm run dev
```

`http://localhost:3000/health` でヘルスチェックページを確認できる。

DBスキーマは `supabase/migrations/0001_init_schema.sql`、テスト用の価格設定は `supabase/seed.sql` にある。実Supabaseプロジェクト作成後、Supabase CLIまたはSQL Editorで適用する。

## 実装状況

- Phase 0（リポジトリ基盤）: 完了。
- Phase 1（認証・組織・イベント管理の骨格）: 完了。実Supabaseプロジェクトで動作確認済み。
- Phase 2（フォーム設計・出展者情報収集）: 完了。フォームビルダー（セクションテンプレート付き）、公開URL経由の出展者提出、修正依頼・再提出、重複検知、CSV出力、レート制限・ハニーポットまで実データで検証済み。
- Phase 3（ファイル公開・自動通知・確認状況）: 完了。資料の作成・添付・公開、Resend経由の実メール送信、認可付きリンクでの出展者アクセス、「確認しました」の記録、未確認者への再通知、送信失敗の可視化まで実データ・実メール送信で検証済み。デザインはshadcn/uiベースのSaaS管理画面調に統一。
- Phase 4（請求書・入金管理）: 完了。請求書作成時の自動通知（Phase 3基盤を再利用）、請求書確認状態と入金状態の完全分離、金額・支払期限の訂正と入金状態変更の変更履歴記録、他組織・他出展者からのアクセス不可まで実データで検証済み。
- Phase 5（SaaS従量課金・通常プラン）: 課金計算ロジック（UsageLedger・見込み額表示・請求確定・課金訂正）完了・検証済み（30社=9,800円/31社=10,100円/87社=26,900円を自動テストで再現、再提出・請求確定の二重実行で二重計上されないことを確認）。Stripeカード登録（Checkout, mode=setup）も実装・実ブラウザで動作確認済み。**自動課金の実行（確定請求へのカード請求）とWebhook接続は未実装**（受信基盤のみ用意、ダッシュボード未登録）。
- Phase 6（年間プラン）: 完了。年間契約では従量課金（UsageLedger）が一切発生しないこと、1開催あたりの上限超過を検知しても出展者の入力・提出は止まらないこと、通常⇔年間プランの切替を二重クリックしても契約が二重化されず旧契約の最終精算が1回だけ確定することを自動テストで確認済み。
- Phase 7（出力強化・権限強化・運用仕上げ）: 完了。出展者によるファイルアップロード（ロゴ等）、電源・備品/車両/スタッフ別のCSVテンプレート、ブランド紹介CSV+ロゴZIP（ファイル単位の再認可付き）、削除耐性（参加キャンセル後もUsageLedger・請求変更履歴が残る）を実データで検証済み。特定商取引法表記ページ（要事業者情報入力）、運用手順書（`docs/runbook.md`）を追加。
- Supabaseアカウント自体は別プロジェクト（広告健康診断SaaS）で作成済み。本SaaS用には**別プロジェクトを新規作成**することを推奨（テナント分離、請求・障害影響範囲の分離のため）。
- サインアップ確認メール・マジックリンクを機能させるには、Supabaseダッシュボードの Authentication > Email Templates で確認リンクを次の形式にカスタマイズする必要がある：
  `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type={{ .Type }}&next=/onboard`
  ただしSupabaseの仕様上、テンプレート編集にはカスタムSMTP設定が必要。カスタムSMTP（Resend等）未設定の間は、下記の開発用スクリプトでメール送信を経由せずに確認リンクを発行できる。

### 開発中のメール確認バイパス

カスタムSMTP未設定でも、`scripts/dev-magic-link.mjs` で実際にメールを送らずに確認リンクを発行できる（Supabase Admin APIを使用。**service_role keyを使うため開発専用、本番には組み込まない**）。

```bash
# Git Bashではパスの自動変換を防ぐため MSYS_NO_PATHCONV=1 を付ける
MSYS_NO_PATHCONV=1 node scripts/dev-magic-link.mjs 出展者用メールアドレス /apply/共有トークン/form
```
表示されたURLをブラウザで開くと、そのメールアドレスで確認済みになり、指定した`next`へ遷移する。

## 開発方針

- 未確定の価格・上限値はすべて設定値（`pricing_configs`/`annual_plan_configs`の`is_test`フラグ）として扱い、本番課金には反映しない。
- 業務データの物理削除は行わない（状態遷移で表現）。
- RLS（Row Level Security）をアプリ層の権限チェックに加えた多層防御として必須採用する。

詳細は [docs/implementation-plan.md](./docs/implementation-plan.md) を参照。
