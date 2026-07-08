<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# プロジェクト概要：受入・タンク管理システム

AppSheet（barge_ops_db）からのフルリプレイス。産廃・海防法関連の受入品（ビルジ等）と受入タンクの残量を管理する。利用者は約20名・3部署（運搬×2、処理×1）。スマホ利用が主で、PCは管理者のみ。

## スタック
- Next.js (App Router, TypeScript) + Tailwind v4 / Prisma 7（client出力先: `src/generated/prisma`、接続は `@prisma/adapter-pg`。`PrismaClient`は必ず`adapter`経由で生成）
- DB: Neon PostgreSQL（接続情報は `.env` の DATABASE_URL）
- 認証: NextAuth v5 Credentials（JWT）。Edge非対応のPrismaを避けるため `src/lib/auth.config.ts`（Edge安全）と `src/lib/auth.ts`（DB依存）を分離。ルート保護は `src/proxy.ts`（Next16でmiddleware.tsは非推奨）
- デプロイ: Vercel（https://claude-neon-pi.vercel.app ／初回deployのためproduction扱い）。Sheets出力は未実装（将来: 台帳をGoogle Sheets/Excelへエクスポート）

## 絶対に守る設計原則
1. **`tank_transactions` は追記専用台帳**。数量・残高・取引の実体（数値・タンク・種別・日時・記録者等）のUPDATEとDELETEはDBトリガーで物理的に禁止済み。**唯一の例外は`siteId`のみのUPDATE**（自由入力で重複した現場のマスタ統合用。migration: allow_site_correction_on_ledger がsiteId以外の変更を列単位で拒否）。数値の訂正は従来通り`CORRECTION`行の追加＋`referenceTransactionId`参照で表現する（法的証拠性の要件）
2. **`Vessel.currentBalance` はキャッシュ**。直接編集するUIを作らない。更新は台帳INSERTと同一トランザクション内で`SELECT ... FOR UPDATE`の行ロック付きで行う（`src/lib/actions/record-transaction.ts`参照）
3. **クレンジング規則**（AppSheet時代からの必須仕様）: 現場名=前後trim、作業者名=全空白（全角含む）除去。`src/lib/cleansing.ts`
4. **部署は多対多**（`operator_department`、兼任対応）。割当は物理削除せずisActiveで無効化。**現場も部署と多対多**（`site_department`、一現場を複数部署が共用するケースに対応）。`Site.name`は全体で一意（旧: 部署内一意）
5. 管理操作は`requireAdmin()`がJWTでなくDBの現在値で権限確認。最後の有効な管理者の降格・無効化は禁止
6. 日付は`toISOString()`を使わない（UTCズレで日本の深夜〜午前9時に前日になる）。ローカル日付で組み立てる

## 実装済み機能（2026-07-05時点）
- バージ階層表示：`Barge`マスタにタンクを所属させ、トップの「バージ残量一覧」でグループ集計表示。列は「受入可能・最大容量・積載率・内容物」（現在量列なし、内容物はバージ行では配下タンクの和集合）。ツリー表示の制御は、バージ単位の`showTotalOnly`（総量のみ表示＝ツリーを出さない）とタンク単位の`showIndividually`の2段階。バージには`status`があり、廃止すると配下タンクごと一覧・記録対象から除外（`record-transaction.ts`にサーバー側チェックあり）。受入可能量（最大容量-現在量）が主要指標。タンク名は「1」「2」等の番号推奨。各画面・CSVで「バージ名-タンク名」表記に統一（例: 0号-1）（旧`Barge.displayMode`・旧`Vessel.showInList`は廃止済み）
- バージ・タンクは統合マスタ`/admin/vessels`で管理（`/admin/barges`はリダイレクト）。バージごとに`<details>`アコーディオンで開閉し、名前・容量・表示設定は**バージ単位の一括保存**（`saveBargeSettings`、`vesselName_<id>`等のid付きフィールド名で全タンク分を1フォーム送信）。削除・廃止・内容物操作はフォーム入れ子回避のため`form`属性で外部ミニフォームに紐づけた即時実行ボタン。タンクの物理削除は台帳参照ゼロの場合のみ可（`deleteVessel`がガード）、履歴のあるタンクは廃止で運用から外す
- タンク別内容物：`vessel_item_type`でタンク⇄内容物(ItemType)を紐づけ。記録画面はタンク選択→そのタンクの登録内容物のみ選択可（サーバー側でも検証）。管理はタンクマスタ内のチップUI。**旧「品目」管理ページは廃止済みだがItemTypeテーブルは台帳が参照するため削除禁止**（内容物追加時に名前でfindFirst→なければ自動作成）
- 搬入/処理の記録（行ロック付き台帳INSERT、部署権限チェック、搬入は現場必須・**本船は任意**＝陸の施設からの受入に対応）。初期画面は登録画面（`/`は`/record`へリダイレクト、バージ残量一覧は`/barges`）
- 現場は記録画面で**自由入力＋既存候補のコンボボックス**（重複登録防止のため入力中に候補表示、他部署が既に登録した現場名も候補に出て共用できる）。未登録名は記録時に名前解決（**現場名は全体で一意**）して自動作成、既存現場を別部署で初めて使う場合は`SiteDepartment`リンクを自動追加（trimクレンジング適用、無効化済み現場は再有効化）。現場⇄本船の紐付けは台帳実績から`groupBy`で導出し、現場選択時に「この現場の実績」として本船を優先表示（自動選択はしない。誤記録防止のため）
- 現場マスタに**重複統合ツール**（`/admin/sites`）：統合先ラジオ＋統合元チェック＋理由必須で`mergeSites`が台帳のsiteIdを付け替え、所属部署は統合先・統合元の**和集合**を引き継ぎ、統合元を物理削除。実行内容は`site_merge_log`に恒久記録（誰が・いつ・どの現場を・どの部署が絡んだか・理由）。記録数0の現場は`deleteSite`で物理削除可、参照のある現場の削除は不可
- キャリブレーション `/admin/calibration`（管理者のみ、理由必須、差分ゼロも監査記録として許可。itemTypeId/departmentIdはCALIBRATION時null）
- 公的エクスポート `/admin/export` + `/api/export`（期間・タンク指定CSV、UTF-8 BOM付き、SHA-256ハッシュ、export_historyに証跡）
- Google Sheets連携 `src/lib/google-sheets.ts`（google-auth-library使用。env: GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY / GOOGLE_SHEET_ID。未設定時は管理画面にセットアップ手順を表示）
- 日次バックアップ `/api/cron/backup`（vercel.jsonのcron 18:00 UTC=3:00 JST、CRON_SECRET認証、Sheetsへ全件ミラー）
- パスワード変更 `/settings`（ヘッダーのユーザー名リンクから）
- ログインレート制限 `src/lib/rate-limit.ts`（同一ログインID5回失敗/15分でブロック、インメモリ方式＝サーバーレスではインスタンス単位、タイミング攻撃対策のダミーハッシュ比較あり）
- アカウントは**メールアドレスではなくログインID**（`User.loginId`、旧`email`列をリネーム）で認証。会社メールを持たない作業者にも管理者が任意のIDを発行できる（半角英数字・`._@-`、3〜32文字。既存の email 形式IDも`@`を許容文字に含めて編集可）。`/admin/accounts`でログインIDの変更・重複チェック（P2002ハンドリング）に対応
- 記録の訂正（逆仕訳）`/admin/corrections`：搬入・処理の記録を選んで打ち消し（`CORRECTION`行を追記、行ロック・二重訂正防止・理由必須）。CALIBRATION/CORRECTION行自体は訂正不可（再実行で対応）
- **本船は独立の管理画面を持たず、現場マスタ内で現場ごとに追加・割り振り**（`SiteShip`多対多、`/admin/sites`のチップUI：名前入力→`findFirst`で再利用/なければ`Ship`自動作成→`upsert`でリンク。解除してもShip自体は消さない）。記録画面の本船プルダウンは**選択された現場に登録されている本船のみ**表示（現場未確定時はプルダウン無効化）
- **トラック**（`Truck`：所属部署必須・容量/残量の管理対象外）を追加。管理は`/admin/vessels`最下部の「トラックマスタ」セクション。記録画面では**搬入(RECEIVE)時のみ**、選んだ部署に属するトラックが1台以上あれば選択肢を表示（`TankTransaction.truckId`に記録、CSV/履歴/訂正画面にも表示）
- **タンクに所属部署（任意）**を付与可能（`Vessel.departmentId`、`/admin/vessels`の各タンク行で選択）。null＝全部署共通。記録画面の「受入れタンク」は選択中の部署に一致するタンク＋全部署共通タンクのみに絞り込み表示
- **受入れタンクの表示形式**：バージの`showTotalOnly`がtrueなら「バージ名」のみ（例: 0号）、falseなら「バージ名-タンク名」（例: 0号-1）。ラベルが重複してもvalueはタンクidなので機能上問題なし
- **マイナス数量（出荷）対応**：搬入(RECEIVE)は入力値の符号をそのまま残高へ反映（正=搬入・負=出荷）。処理(PROCESS)は誤操作防止のため従来通り正の値のみ許容し内部で符号反転。残高の範囲チェック（0〜最大容量）は種別に関わらず共通ロジック
- タンク関連ラベルは「受入れタンク」に統一（旧「タンク」から変更）

## 未実装（次の候補）
- 産廃管理票・海防法の正式様式でのPDF/Excel出力（実物の様式入手待ち。「品目種類が追加できれば柔軟でよい」との合意）
- Vercel環境変数へのGoogle Sheets/CRON_SECRET設定と再デプロイ（コードは実装済み・未アクティベート）

## 環境の注意
- Windows。ポート3000に古い`next dev`が残りやすい（`.next/dev/lock`のPIDを確認して停止）
- プレビューのスクリーンショットは頻繁にタイムアウトする→`preview_snapshot`/`preview_eval`で検証する
- シード: `npx prisma db seed`（管理者ログインIDは `SEED_ADMIN_LOGIN_ID`、パスワードは `SEED_ADMIN_PASSWORD`＝8文字以上を必須で環境変数から渡す。既定パスワードは廃止済み。パスワードはログ出力しない）
