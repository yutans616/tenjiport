# 運用手順書（バックアップ復旧・監視）

作成日：2026-09-09
関連：[implementation-plan.md](./implementation-plan.md) / [open-decisions.md](./open-decisions.md)

本番の実データに対する破壊的な操作を伴うため、実際のリハーサルはステージング環境または新規プロジェクトで実施すること。本ドキュメントは手順の整理であり、実施記録ではない。

## バックアップ・復旧（Supabase PITR）

1. **前提**: Point-in-Time Recovery（PITR）はSupabaseの有料プランで利用可能。本番運用開始前に、プロジェクト設定でPITRを有効化し、保持期間（例：7日）を確認する。
2. **定期バックアップの確認**: ダッシュボード Database > Backups で自動バックアップが実行されていることを定期的に確認する。
3. **復旧手順（リハーサル用）**:
   - ダッシュボード Database > Backups > Point in Time Recovery で復旧したい時刻を指定
   - 復旧は元のプロジェクトを直接上書きせず、新しいプロジェクトとして復元されることを確認してから実行する（誤って本番を上書きしない）
   - 復元後、アプリの `.env.local` / 本番環境変数を復元先のURL・キーに向け直し、`npm run build` が通ることを確認する
   - `supabase/migrations/` の適用順序が復元後のDBと一致しているか確認する（復元時点より後のマイグレーションは再適用が必要）
4. **リハーサルの実施記録**: 実際にリハーサルを行った場合は、日時・所要時間・気づいた問題をこのファイルに追記していくこと。

## 監視・アラート（本番デプロイ後に設定）

| 項目 | 内容 | 状態 |
|---|---|---|
| エラー監視 | Sentry等をVercelプロジェクトに接続 | 未設定 |
| 稼働監視 | UptimeRobot等で `/health` を定期チェック | 未設定 |
| 通知失敗の可視化 | `notification_deliveries.status='failed'` の件数を定期確認する運用（O18画面で確認可能） | 画面は実装済み、定期確認の運用は未定義 |
| 決済失敗の可視化 | `payment_events.processing_status='error'` の監視 | Webhook未接続のため対象外（Webhook接続時に追加） |
| Cron失敗の検知 | `/api/notifications/process` を定期実行するCronの失敗通知 | 未設定（本番デプロイ時にVercel Cron設定と合わせて対応） |

## 本番反映前のチェックリスト

`docs/open-decisions.md` の未決事項に加えて、以下を確認する。

- [ ] `pricing_configs` / `annual_plan_configs` に `is_test=false` の正式価格を投入し、アプリ側の参照ロジックがテスト値を選ばないことを確認
- [ ] Resendの独自ドメインを検証（SPF/DKIM/DMARC）し、`onboarding@resend.dev` から本番送信元アドレスへ切り替え
- [ ] Stripe Webhookエンドポイントを本番URLでダッシュボードに登録し、`STRIPE_WEBHOOK_SECRET` を本番用に設定
- [ ] 自動課金の実行機能（確定請求へのカード請求）を実装・検証
- [ ] `docs/legal/tokushoho`（特定商取引法表記）の【要入力】箇所を正式な事業者情報に差し替え
- [ ] PITRを有効化し、本セクションの復旧手順を一度リハーサルする
- [ ] Sentry・稼働監視を接続する
