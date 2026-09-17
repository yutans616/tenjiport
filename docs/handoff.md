# 作業引き継ぎメモ

作成日：2026-09-11
関連：[open-decisions.md](./open-decisions.md) / [implementation-plan.md](./implementation-plan.md)

## 目的

このプロジェクトはOneDrive配下にあり、複数PCでファイル自体は自動同期される。一方でClaude Codeのチャット履歴・セッション状態は各PCの`~/.claude/`配下（OneDriveの外）に保存されるため、**PCを変えるとチャットの続きは引き継がれない**。

この状況を前提に、チャット履歴を同期する代わりに「次に作業する人（＝別PCの新しいセッション）が読めば状況を把握できる」情報をこのファイルに残す運用とする。git管理下にあり、かつOneDrive同期にも乗るため、コミットの有無に関わらず保存した時点で他PCにも伝わる。

## 運用ルール

- 作業を区切る時（その日の作業を終える、別PCに移る、など）は、必ず下記「現在の状況」を最新化してから終了する
- このファイルは**今の状態のスナップショット**として上書き更新する（時系列ログにはしない）。何を・いつ・なぜ変更したかの履歴はgitのコミットメッセージ側に残す
- 未決の事業判断（価格・法務・決済等）は本ファイルではなく[open-decisions.md](./open-decisions.md)に記載する
- 新しいセッションを開始したら、作業に入る前にまずこのファイルを読むこと

## 現在の状況

**最終更新**: 2026-09-17（本体アプリ：ファイル削除のStorage解放バグ修正・robots.txt/sitemap.xml追加、および本ファイル・open-decisions.mdの記述更新）

### 【完了】インフラ無料枠の消費管理：イベント容量上限・終了日上限・保存期間（2026-09-17）

`docs/open-decisions.md`の「開催利用期間・保存期間・ファイル容量」が未定だったのを、Supabase無料プラン（DB 500MB・ファイルストレージ1GB）の制約試算に基づいて確定・実装。詳細は同ファイル該当行参照。要点：
- イベント終了日は作成日から最大24ヶ月以内（`events/eventDateLimits.ts`、フォームの`max`属性＋サーバー側検証の二重チェック）
- 1イベントあたりファイル合計容量200MB上限（`lib/storage/eventStorageQuota.ts`、署名付きアップロードURL発行前に検証。全4つのアップロード経路に適用済み）
- 終了から2年経過したイベントの`announcement_attachment`・`submission_attachment`ファイルを週次cron（`/api/storage/cleanup`、日曜1:00 UTC）で自動削除。`invoice_pdf`（消費税法等の保存義務あり）は対象外。`deleted_at`で論理削除しStorage実体のみ物理削除、冪等
- 使い捨てテストデータ（容量上限の境界値・終了日上限の境界値・実際の保存期間削除の3系統）でend-to-end検証済み

### 【完了】営業フェーズ前の総点検・メール周り仕上げ（2026-09-17）

- **お問い合わせ先メールアドレスを`contact@tenjiport.com`に統一**：特定商取引法表記・プライバシーポリシー・営業LP・営業PDF。Microsoft 365でこのメールボックスを新規開設したことがきっかけ。
- **Resendの送信ドメインを`mail.tenjiport.com`（サブドメイン）で認証・本番反映**：本体ドメイン`tenjiport.com`のSPFがMicrosoft 365のメールボックス設定時に上書きされ`v=spf1 include:spf.protection.outlook.com ~all`のみになっており、Resend（Amazon SES基盤）からの送信がSPF未認証になっていた問題を発見。サブドメインなら本体ドメインのSPFに一切影響しないため、送信元をこちらに切替（Vercel`RESEND_FROM_EMAIL`更新済み）。DMARCレコード（`_dmarc.tenjiport.com`）も設定済み。
- **主催者向け「お問い合わせ」ページを追加**（`/contact`）：バグ報告・機能提案・その他を種別選択して送信、`contact@tenjiport.com`宛・Reply-Toは送信者本人。
- **SupabaseカスタムSMTP設定＋メールテンプレート全面刷新**：Resend経由に切替、Magic Link・Confirm signupテンプレートを日本語のブランドデザインで作成。
- **【重要】メール確認リンクの「本人がクリックすると無効」バグを修正**：上記テンプレート整備後も再現。原因はGmail等のリンク事前スキャン（安全性チェックのための自動アクセス）がワンタイムトークンを本人クリック前に消費してしまうこと。`/auth/confirm`をGETで即時検証するルートから、本人の明示的なクリック（Server Action呼び出し）で初めて検証するページに変更して解決（本番で「事前GETアクセス→実クリック」の順を再現し、実クリックが成功することを確認済み）。デモのサイレントログイン（`/demo/app`・`/demo/exhibitor`）は`/auth/confirm`を経由せずサーバー側で直接サインインする方式に変更し、従来通りのワンクリック体験を維持。
- **Vercel環境変数のクロス混入インシデント**：ユーザーがVercelを確認していて、TenjiPortとAdMediQ（別プロダクト、`広告健康診断SaaS/mvp0-app`）の環境変数（Stripeキー等）が混在していたことに気付いた。値が見えないため、両プロジェクトとも正しい値を再度コピー貼付けで更新・両方レデプロイ済み。TenjiPort側のSupabase接続は本番で使い捨て組織を作って動作確認済み。AdMediQ側のStripe Webhookは「再送する」で200 OK確認済み。**TenjiPort側のStripe Webhookは、実イベント配信が一度もないため未確認のまま**（Stripe Workbenchの「Shell」タブで`stripe trigger`コマンドを使うと確認できるはず）。
- **ギャップ総点検の結果**：年間プランの更新（自動継続）課金は未実装（意図的なスコープ外、[[gap_analysis_2026_09_12]]参照、現時点で唯一の既知の未実装ギャップ）。`jabi4623@yahoo.co.jp`の重複組織問題はDB確認したところ現在は所属組織ゼロになっており、解消済み（経緯不明）。

### 【完了】インフラ無料枠管理の後続対応・SEO基本ファイル（2026-09-17）

- **削除機能がStorage実体を解放していなかった不具合を修正**：ユーザーからの指摘で発覚。主催者の資料添付削除・出展社の提出物削除は、既存のUIに削除ボタンこそあったが紐付けテーブルの行を消すだけでStorage実体は放置されており、削除してもイベントのファイル容量上限（200MB）が一切戻らなかった。共通ヘルパー`deleteFileAsset()`（Storage削除＋`file_assets`論理削除）を新設し修正。あわせて出展社フォームのファイル項目「差し替える」時に旧ファイルが放置される同種のリークも修正。いずれも実データで検証済み。
- **`robots.txt`・`sitemap.xml`を追加**：`/apply/[token]`（出展者ごとの一意なトークンを含む実質非公開リンク）や認証必須画面は明示的にクロール対象外にし、公開ページ（トップ・`/demo`・`/help`・法務ページ）のみsitemapに列挙。

### 【完了】Stripe本番（Live）移行＋3Dセキュア（SCA）対応（2026-09-13〜17）

- **本番移行**: StripeアカウントはLiveモードが既に有効。ユーザーがVercel環境変数
  （`STRIPE_SECRET_KEY`＝`sk_live_...`、`STRIPE_WEBHOOK_SECRET`＝Live用Webhook署名
  シークレット、`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`＝`pk_live_...`）を直接設定済み。
  コード変更は無し（ガイダンスのみ）。
- **Stripeアカウント構成（重要・要記憶）**: 本番は「BlackishGear」プロジェクト配下の
  「TenjiPort」サブアカウント。ローカル開発用のテスト環境は同プロジェクト配下の
  「TenjiPortサンドボックス」（Stripeダッシュボード左上のアカウント切替から選択）。
  これとは別に、プロジェクト初期から使われていた素の個人アカウント
  （`acct_1UDbg0CqUHcTtZ0d`）や、名称の紛らわしい「テスト環境」という別エンティティも
  存在するが、**どちらも現行のTenjiPort本番とは無関係な別アカウント**。sk_test/pk_test
  キーは`sk_test_5`/`pk_test_5`の直後に続く十数文字（＝アカウントID相当）が完全一致
  しているかで必ず照合すること（食い違うと`confirmCardPayment`が
  「No such payment_intent」で失敗する。サーバー側`paymentIntents.retrieve`は
  secret keyのアカウントで成功するため、そこだけ見ると気づきにくい）。現在
  `.env.local`にはTenjiPortサンドボックスの正しいペアが設定済み。
- **3Dセキュア（SCA）対応**: `attemptCharge`（`src/lib/billing/runEventBilling.ts`）が、
  カードに追加認証が必要な場合を検知して処理する経路を実装。重要な非対称性：
  `off_session:true`（cron自動課金、本人不在）はStripeが`authentication_required`
  エラーをthrowするが、`off_session:false`（イベント作成時・年間プラン開始時・
  手動再試行、本人操作中）はエラーをthrowせず`PaymentIntent.status==='requires_action'`
  を返す。両方の経路を検知して`service_invoices.requires_payment_authentication=true`
  にし、`/plan/confirm-payment/[invoiceId]`（新規ページ、Stripe.js
  `confirmCardPayment`で認証完了）へ誘導する。イベント作成・年間プラン契約の
  ロールバックはこのケースのみスキップ（請求書IDを安定させ、メール内リンクを
  有効に保つため）。マイグレーション`0069`適用済み・検証済み（使い捨てテスト組織＋
  Playwright＋Stripeテストカード`4000002760003184`で全経路をend-to-endで確認、
  cron側の経路も一時的な限定テストルートで直接検証してから削除済み）。

### 【解決済み・アーカイブ】一括請求書発行の不具合（2026-09-13）

`/events/[eventId]/invoices/bulk`が`organizer_organization_id`のNOT NULL制約違反で必ず失敗していた不具合。マイグレーション`0068_hotfix_bulk_invoice_organizer_org_id.sql`で修正・検証済み（¥56,000での正常発行を確認）。別セッションとの重複発見だったため一時的に詳細を記録していたが、双方とも解消済みのため要点のみ残す。

**参考（2026-09-12〜13の本体アプリ全体像）**: 全体バグ点検（バッチ1〜5、計18件対応：Stripe決済IDOR・オープンリダイレクト・請求書番号の組織またぎ衝突・返金の競合状態・出展者ダッシュボード導線・ZIP生成の並列化・重複検知の再実行漏れ等）と、デモ営業LP（`/demo`）の追加を実施、いずれも本番デプロイ済み。詳細はgitログ（コミット`22dd448`〜`c5da24b`）参照。

**直近やっていたこと**:
- `exhibition-list-tool/`（展示会主催会社の営業リスト獲得ツール、本体Next.js/Supabase
  とは完全独立のPython製CLI）のPhase 1〜3は完成済み。詳細設計・実装状況は
  `exhibition-list-tool/README.md`に集約済み。
- **会場カバレッジを大幅拡大（2026-09-13）**: ユーザー提示の全国39会場候補リストを
  「強い施設から実装→弱い/要再調査を深掘り」の方針で全件調査し、19会場を新規実装
  （東京国際フォーラム・青森産業会館・山形ビッグウイング・夢メッセみやぎ・
  Ｇメッセ群馬・神戸コンベンションセンター・ママカリフォーラム・京都パルスプラザ・
  熊本城ホール・広島産業会館・大宮ソニックシティ・アクセス札幌・にぎわい交流館ＡＵ・
  アイテムえひめ・高松シンボルタワー・新潟三伸・鹿児島アリーナ・沖縄コンベンション
  センター・アクトシティ浜松・グランキューブ大阪・ビッグハット・セラミックパーク
  MINO・マロニエプラザ・くにびきメッセ）。`sources.yaml`のenabledソース数は
  約30→49に増加。マリンメッセ福岡（Playwright必須のSPA）・出島メッセ長崎（主催者欄
  自体が存在しない）・テクスポート今治（イベントカレンダー自体が無い）・海峡メッセ
  下関（組織立った構造が無く自由記述の抽出効率が悪い）等は詳細ページまで確認した
  うえで除外と結論。詳細・技術的知見（selectolaxのセレクタの罠2種、全角数字regex
  バグ、日付の年推定・月またぎロールオーバー処理等）は`exhibition-list-tool/README.md`
  の「会場カバレッジの大幅拡大」節に集約。
- ビッグサイト・幕張メッセが従来「現在掲載中」分のみしか取得しておらず他会場
  （7年分の履歴を持つインテックス大阪等）と取得期間の条件が揃っていなかった問題を
  修正済み（ビッグサイトは絞り込みフォームを空でPOSTすると2009年〜のセッションが
  解放される、幕張メッセは`?month=YYYYMM`で2015年1月〜が取得できる、をそれぞれ発見）。
- こくちーずプロ由来organizerの`official_site_url`誤検出（kokuchpro.com自身の
  イベントページURLを主催会社の公式サイトと誤認）を修正済み。
- **OneDrive+SQLiteの書き込み耐性を修正（2026-09-13〜17）**: `database is locked`/
  `attempt to write a readonly database`が、他プロセスとの競合が無い状態でも
  長時間クロール中（ビッグサイト807ページ目）に単独で発生することを確認。原因は
  `db/repository.py`が1行upsertごとに新規SQLite接続を開閉しており、OneDriveの
  バックグラウンド同期との衝突window（transient interference）を毎回作っていた
  ことと推定。全書き込みメソッドにtenacityの指数バックオフ付きリトライ
  （`_retry_on_sqlite_contention`、最大6回）と`PRAGMA busy_timeout=30000`を追加し、
  新しい接続から丸ごと再試行する方式に変更。データ破損は無し（失敗時は
  commit前に例外が飛ぶためロールバックされ、部分書き込みは残らない）。
- **Playwrightでマリンメッセ福岡・パシフィコ横浜を再調査（2026-09-17）**:
  マリンメッセ福岡はStudio.Design製Nuxt SPAだがPlaywrightでJS実行後DOM評価すれば
  実データ（A館・B館各10件、日刊工業新聞社・本田技研工業・ブティックス株式会社等の
  強い主催者を確認）が取得できることが判明し実装・`enabled: true`化した
  （本ツールで唯一Playwrightを実行時に使うソース、`pyproject.toml`の依存関係に
  昇格）。パシフィコ横浜も同じ技術だが、実データはサイト自体ではなく6カテゴリの
  **公開Googleカレンダー**（学会・展示会等）に集約されており、公開ICSフィードを
  httpxで直接取得できる質の良いデータ（展示会カテゴリだけで148件、2025年3月〜
  2026年10月超）を発見した。しかし`calendar.google.com/robots.txt`が
  `Disallow: /`（ルート直下以外全面禁止）を明示しており、本ツールの
  robots.txt遵守方針（PoliteHttpClientがデフォルトで自動チェック）に従い実装を
  見送った。詳細は`config/sources.yaml`の該当エントリのnoteを参照。
- ユニットテスト240件全てpass（実サイトへの自動アクセスは無し、保存済み
  フィクスチャで検証。マリンメッセ福岡のみPlaywright実行が必要だがテスト自体は
  純粋なパース関数のみを対象にしておりブラウザ起動は不要）。

**次にやること**:
- **最優先**: 上記19+1会場（マリンメッセ福岡含む）の追加を反映した完全な再クロール
  を2026-09-17時点でバックグラウンド実行中（`exhibitool run`）。東京国際フォーラムの
  過去アーカイブが非常に大きく（1ヶ月だけで2,600件超のミーティングルーム予約級の
  イベントが存在）、詳細ページ逐次取得が1件あたり約5秒かかるため、全履歴の完走には
  長時間（数時間〜それ以上）を要する見込み。次回セッションでは
  `exhibitool status`で完了しているか確認し、完了していれば`resolve-organizers`→
  `recompute-aggregates`→`enrich-contact`→`score`→`export`を実行して最終的な
  organizer数・スコア分布・メール充足率を報告すること。未完了なら再開するか、
  東京国際フォーラムの`months_ahead`を絞って現実的な範囲に縮小するかを検討する
  （東京国際フォーラムの1ヶ月あたりのイベント密度が異常に高い原因が本当に
  実データなのか、クロール側の重複バグなのか未検証、要確認）。
- Phase 1〜3が完了。残るは`exhibition-list-tool/README.md`記載のPhase 4
  （営業メール送信=アウトリーチ。sales-list-toolのoutreachモジュール移植、
  本プロダクト向け文面・送信者情報の設定、特定電子メール法の遵守再確認が必要）。
  ユーザーの指示で**自動送信は行わず、フォーム/メールの収集精度向上に留める**方針
  確定済み。具体的な精度改善スコープ（`enrichment/contact_extractor.py`の改善点）は
  まだ未定義。
- 本体アプリ（展示会管理SaaS）側は、実ユーザー利用を想定したギャップ分析を踏まえ
  以下を追加実装・本番デプロイ済み（2026-09-11）：①出展者の参加キャンセル機能
  （キャンセルしても課金は自動訂正しない設計。詳細は[open-decisions.md](./open-decisions.md)参照）、
  ②重複統合時の自動課金訂正、③`resend_announcement`の重複キー衝突バグ修正、
  ④全ボタンへの二重送信防止（`SubmitButton`化）、⑤エラー画面（`error.tsx`一式）と
  やり直し導線、⑥資料提出依頼への提出期限設定（`announcements.submission_due_date`、
  超過かつ未提出は出展者側で赤字強調）。これ以前の依頼4件（年間プラン上限バナー・
  繰り返し入力フィールド・1ユーザー1ブランド制限解消・Turnstile接続）も完了済み。
  Turnstileは`.env.local`にキー設定済みで機能有効（Vercel本番側の設定は未再確認）。

**未コミット・進行中の変更**:
- `exhibition-list-tool/`一式（新規、未コミット）。`.venv/`・`data/state.sqlite`・
  `data/output/*.csv`・`data/*.log`は`.gitignore`済みで追跡対象外。

**引き継ぎ時の注意事項**:
- Stripeは2026-09-13〜17にLiveモードへ移行済み（Vercel環境変数のみ変更、コード変更なし）。ローカル開発は「TenjiPortサンドボックス」のテストキーを使うこと（詳細は上記「現在の状況」参照。他の紛らわしいStripeアカウントと混同しないこと）。
- メール送信は2026-09-17にResendのドメイン認証（`mail.tenjiport.com`）＋DMARC設定が完了し、Supabase AuthもカスタムSMTP経由に切替済み。本体ドメイン`tenjiport.com`（apex）のSPFはMicrosoft 365用のみで上書きされているため、送信元に使わないこと。
- 検証は使い捨てテスト組織＋一時APIルート（`src/app/api/test-*`）＋一時スクリプト（`tmp-check-*.mjs`）を作って行い、検証後は必ず削除してから確定コミットする運用。DB変更（マイグレーション）はSupabase CLI/ダッシュボードへの直接アクセス権がないため、SQLをユーザーに提示して実行してもらい、「完了」の返信を待ってから検証に進む。
- `exhibition-list-tool`は本体と別のPython環境（`exhibition-list-tool/.venv`）が必要。別PCで続きを行う場合は`pip install -e ".[dev]"`をそのPC上で再実行すること（`.venv`自体はgit管理外）。
