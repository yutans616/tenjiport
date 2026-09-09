# データモデル

作成日：2026-09-08
実体：[../supabase/migrations/0001_init_schema.sql](../supabase/migrations/0001_init_schema.sql)（本ドキュメントの内容をそのままSQLで実装済み）

## 設計原則

1. **物理削除しない**。すべて `status` によるソフトデリート/状態遷移で表現する。DELETE権限はアプリのDBロールに付与しない運用とする（Phase 5でSupabase接続時に設定）。
2. **金額は常に整数円**（サーバー側計算のみ、フロントに計算ロジックを置かない）。
3. **User（認証アイデンティティ）は Supabase Auth (`auth.users`) を正とし、独自の users テーブルは持たない**。組織・ブランドへの所属は `organizer_memberships` / `exhibitor_memberships` の中間テーブルで表現する。
4. **課金台帳（UsageLedger）と請求（ServiceInvoice）は追記専用**。補正は新規行（`correction_credit` / `correction_debit`）でのみ行い、既存行のUPDATE/DELETEは行わない。

## 主要エンティティと状態遷移

### EventParticipation（課金の起点）

```
invited（招待のみ、EventParticipation行のみ存在）
  → draft（自動保存開始、SubmissionVersion v1が作成される）
  → submitted（初回のみ: first_submitted_at を設定し、同一トランザクションで
               UsageLedger に billable_participation を1行追記。
               idempotency_key の DBユニーク制約により二重計上を構造的に防止）
  → revision_requested（主催者がRevisionRequestを作成）
  → draft（出展者が編集開始、新しいSubmissionVersionを作成）
  → submitted（再提出。バージョン番号++。first_submitted_atは変更しない＝再課金しない）
  → confirmed（主催者が内容OKと判断）

cancelled（提出後キャンセル。UsageLedgerは無変更＝カウント維持がデフォルト）
merged（重複統合により別のEventParticipationへ統合。行自体は残す）
```

同一企業が同一イベントで複数ブランド出展する場合、ブランド（`ExhibitorProfile`）ごとに別の`EventParticipation`が作られるため、**課金カウントもブランド単位で個別に発生する**。

### SubmissionVersion（提出スナップショット）

- 提出（`submitted`）後は不変（イミュータブル）。編集は必ず新しいバージョン行を生成する。
- `data_snapshot_json` はフォーム回答値に加えて、提出時点の `ExhibitorProfile` 主要フィールドをディープコピーして埋め込む。過去イベントの表示・出力は常にこのスナップショットを参照し、`ExhibitorProfile` を直接JOINしない（プロフィール変更で過去イベントを上書きしないため）。

### Announcement / AnnouncementVersion（資料の版管理）

- `AnnouncementVersion` は公開のたびに新規不変行として追加。
- 「公開して通知」操作のみが通知ジョブをenqueueするトリガー。下書き保存では絶対にenqueueしない。
- 重要変更で再確認を求める場合、新版で `ack_required=true` を設定。旧版への `Acknowledgement` は保持したまま、新版に対しては未確認から再スタートする。

### ExhibitorInvoice（請求書・入金）

- `invoice_ack_status`（出展者が更新）と `payment_status`（主催者のみ更新）は**別カラム・別API**。相互に自動連動させない。
- 全フィールド変更は `InvoiceChangeLog`（変更者・日時・旧値・新値）に強制記録する共通フックを通す。

### UsageLedger（課金カウント）

- カウント単位＝ `EventParticipation` が初めて `submitted` になった瞬間の1回のみ。スタッフ人数・コマ数は加算対象に含めない（そもそも参照しない）。
- 冪等性：`idempotency_key = "participation:{event_participation_id}:first_submit"` にDBユニーク制約。submit処理と同一トランザクションで `INSERT ... ON CONFLICT DO NOTHING`。
- 招待・下書きのみは `is_billable=false` のまま、UsageLedger行は作られない。
- 提出後キャンセルは既定でカウント維持。重複・テスト登録の是正は理由必須の `correction_credit` 行でのみ行う。

### ServiceContract（SaaS契約）

- 組織ごとに `status='active'` な契約が同時に1件のみとなるよう、部分ユニークインデックスで保証。
- プラン変更（通常⇔年間）は「旧契約への計上停止→旧契約の最終精算確定→新契約有効化」の3ステップを1トランザクションで実施し、二重請求を防ぐ。

### PaymentEvent（決済Webhook冪等性）

- `provider_event_id` にユニーク制約。署名検証後、`INSERT ... ON CONFLICT DO NOTHING` で重複配信を検知。
- 業務更新は前方遷移のみの状態機械（`draft→finalized→charged|failed`）とし、順序が入れ替わって届いても終端状態なら無視する。

## 権限（RLS）

- Postgres RLS を全テーブルで有効化。ポリシー未設定のテーブルはデフォルトで全拒否（安全側）。
- `is_organizer_member(org_id)` / `is_exhibitor_member(profile_id)` ヘルパー関数で、主催者は自組織のみ、出展者は所属確認済みの自社情報のみにアクセスを制限する。
- Phase 0では中核テーブル（組織・メンバーシップ・イベント・参加）のSELECTポリシーのみ先行実装。書き込みポリシーと残りのテーブル（forms/announcements/invoices等）のポリシーは各機能を実装するPhase 1-6で追加する。
- 請求書ファイルは非公開バケット＋短期署名URLでのみ配信。主催者内部メモは出展者へのレスポンスに含めない（APIレベルで除外）。

## Phase 0からの簡略化（実装計画からの変更点）

- `packages/domain` という独立パッケージ分割は、実際のドメインロジックが書かれるPhase 2以降に作成する（Phase 0時点では中身のないディレクトリを作らない）。
- Prisma等のORMは導入せず、SQLマイグレーション（`supabase/migrations/`）をスキーマの正とする。RLSポリシーがSQL前提であり、ORMスキーマとの二重管理を避けるため。
