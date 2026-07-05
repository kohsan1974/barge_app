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
1. **`tank_transactions` は追記専用台帳**。UPDATE/DELETEはDBトリガーで物理的に禁止済み（migration: add_ledger_immutability_trigger）。訂正は`CORRECTION`行の追加＋`referenceTransactionId`参照で表現する（法的証拠性の要件）
2. **`Vessel.currentBalance` はキャッシュ**。直接編集するUIを作らない。更新は台帳INSERTと同一トランザクション内で`SELECT ... FOR UPDATE`の行ロック付きで行う（`src/lib/actions/record-transaction.ts`参照）
3. **クレンジング規則**（AppSheet時代からの必須仕様）: 現場名=前後trim、作業者名=全空白（全角含む）除去。`src/lib/cleansing.ts`
4. **部署は多対多**（`operator_department`、兼任対応）。割当は物理削除せずisActiveで無効化
5. 管理操作は`requireAdmin()`がJWTでなくDBの現在値で権限確認。最後の有効な管理者の降格・無効化は禁止
6. 日付は`toISOString()`を使わない（UTCズレで日本の深夜〜午前9時に前日になる）。ローカル日付で組み立てる

## 実装済み機能（2026-07-05時点）
- バージ階層表示：`Barge`マスタ（displayMode: INDIVIDUAL=タンクごとツリー表示 / TOTAL=合計のみ）にタンクを所属させ、トップの「バージ残量一覧」でグループ集計表示。受入可能量（最大容量-現在量）が主要指標。タンク名は「1」「2」等の番号推奨（一覧では数字バッジ表示）。各画面・CSV・Sheetsで「バージ名／タンク名」表記に統一
- タンクの`showInList`（一覧に表示チェックボックス）：falseのタンクは一覧とバージ合計から除外される（記録には影響しない）
- タンク別内容物：`vessel_item_type`でタンク⇄内容物(ItemType)を紐づけ。記録画面はタンク選択→そのタンクの登録内容物のみ選択可（サーバー側でも検証）。管理はタンクマスタ内のチップUI。**旧「品目」管理ページは廃止済みだがItemTypeテーブルは台帳が参照するため削除禁止**（内容物追加時に名前でfindFirst→なければ自動作成）
- 搬入/処理の記録（行ロック付き台帳INSERT、部署権限チェック、搬入は現場・本船必須）
- キャリブレーション `/admin/calibration`（管理者のみ、理由必須、差分ゼロも監査記録として許可。itemTypeId/departmentIdはCALIBRATION時null）
- 公的エクスポート `/admin/export` + `/api/export`（期間・タンク指定CSV、UTF-8 BOM付き、SHA-256ハッシュ、export_historyに証跡）
- Google Sheets連携 `src/lib/google-sheets.ts`（google-auth-library使用。env: GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY / GOOGLE_SHEET_ID。未設定時は管理画面にセットアップ手順を表示）
- 日次バックアップ `/api/cron/backup`（vercel.jsonのcron 18:00 UTC=3:00 JST、CRON_SECRET認証、Sheetsへ全件ミラー）
- パスワード変更 `/settings`（ヘッダーのユーザー名リンクから）
- ログインレート制限 `src/lib/rate-limit.ts`（同一メール5回失敗/15分でブロック、インメモリ方式＝サーバーレスではインスタンス単位、タイミング攻撃対策のダミーハッシュ比較あり）

## 未実装（次の候補）
- CORRECTION（訂正・逆仕訳）の入力UI（型・台帳設計は対応済み）
- 産廃管理票・海防法の正式様式でのPDF/Excel出力（実物の様式入手待ち。「品目種類が追加できれば柔軟でよい」との合意）
- Vercel環境変数へのGoogle Sheets/CRON_SECRET設定と再デプロイ（コードは実装済み・未アクティベート）

## 環境の注意
- Windows。ポート3000に古い`next dev`が残りやすい（`.next/dev/lock`のPIDを確認して停止）
- プレビューのスクリーンショットは頻繁にタイムアウトする→`preview_snapshot`/`preview_eval`で検証する
- シード: `npx prisma db seed`（admin@example.com / ChangeMe123! — 本番運用前に要変更）
