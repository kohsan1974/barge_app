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
4. **部署は多対多**（`operator_department`、兼任対応）。割当は物理削除せずisActiveで無効化。**現場も部署と多対多**（`site_department`、一現場を複数部署が共用するケースに対応）。`Site.name`は全体で一意（旧: 部署内一意）。**タンクも部署と多対多**（`vessel_department`、旧: 単一nullable FK。**リンク0件＝どの部署にも属さず、記録画面のどの部署からも選択不可**。旧仕様「リンク0件＝全部署共通」から変更済み）
5. 管理操作は`requireAdmin()`がJWTでなくDBの現在値で権限確認。最後の有効な管理者の降格・無効化・削除は禁止。**アカウントの物理削除は台帳・監査ログ・エクスポート履歴からの参照が0件の場合のみ**（`deleteAccount`が`recordedTransactions`/`approvedTransactions`/`exportRequests`/`siteMergeLogs`の合計で判定し、部署割当ごと削除。参照があるアカウントは記録者の証跡保護のため無効化のみ。削除ボタン自体を参照ありの行には表示しない）
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
- **本船は専用の管理画面**（`/admin/ships`「本船マスタ」）で登録・編集する。`Ship.imoNumber`（IMO番号・7桁数字・任意・`@unique`）を持ち、名前とIMOは重複禁止（P2002は`uniqueViolationTarget`で名前/IMOを判別してエラー出し分け）。名前・IMOの編集は右下一括保存（全or無トランザクション）。**現場との紐付け（`SiteShip`多対多）は「チップ＋プルダウンで選んで追加」方式で双方向に編集できる**：本船ページでは各本船に現場を、現場ページでは各現場に本船を追加・解除でき、どちらも同じ`addShipSite`/`removeShipSite`（即時保存・全該当ページをrevalidate）を使うため常に連動する。プルダウンには未割り当て分のみ表示（現場が増えても選択肢が溢れない）。1隻が複数現場に所属可能。台帳から未参照の本船のみ物理削除可、参照ありは無効化。記録画面の本船プルダウンは従来通り**選択された現場に登録されている本船のみ**表示（現場未確定時はプルダウン無効化）
- **トラック**（`Truck`：所属部署必須・容量/残量の管理対象外）を追加。管理は`/admin/vessels`最下部の「トラックマスタ」セクション。記録画面では**搬入(RECEIVE)時のみ**、選んだ部署に属するトラックが1台以上あれば選択肢を表示（`TankTransaction.truckId`に記録、CSV/履歴/訂正画面にも表示）
- **タンクに所属部署（複数選択可）**を付与可能（`vessel_department`多対多、`/admin/vessels`の各タンク行でチェックボックス選択、`saveBargeSettings`/`createVessel`がリンクを同期）。**リンク0件＝どの部署にも属さない＝記録画面のどの部署からも選択不可**（部署を割り当てるまで記録に使えない）。記録画面の「受入れタンク」は選択中の部署とのリンクがあるタンクのみに絞り込み表示
- **受入れタンクの表示形式**：バージの`showTotalOnly`がtrueなら**バージ配下の全タンクを記録画面上1エントリに統合**（id=`group:<bargeId>`、名前はバージ名のみ、内容物は配下タンクの登録内容物の和集合）。falseなら従来通りタンクごとに「バージ名-タンク名」（例: 0号-1）。グループ選択時の実際の数量は`record-transaction.ts`のdistribute()がタンク名の昇順で「該当タンクを満杯まで詰めて次のタンクへ繰り越す」形で自動分配し、分配が複数タンクにまたがった場合は各タンクごとに台帳行を作成しreasonに`<バージ名>内で複数タンクに分配`を記録
- **記録は「作業内容」（operation）ベース**。業務フロー: 運輸=外部→トラック→受入れタンク（搬入のみ）／船舶=外部→収集バージへ搬入→受入れタンクへシフト／恵比寿=各タンク→受入れタンクへのシフトと、最終処分の放流（水）・出荷（油）。記録画面は部署を選ぶと選べる作業が変わる: **運搬部署(TRANSPORT)=「搬入」＋（その部署で出せるタンクがあれば）「シフト」、処理部署(PROCESSING)=「シフト」＋「放流」＋「出荷」**（`record-form.tsx`が部署種別とタンク役割から導出、`record-transaction.ts`もサーバー側で同じ制限を再検証）。数量はどの作業でも**正の値のみ**（旧「搬入でマイナス=出荷」仕様は廃止。減算は台帳上のPROCESS行の負quantityで表現）
  - **搬入(RECEIVE)**: 外部→タンク。現場必須・本船/トラック任意。台帳はRECEIVE行(+)
  - **シフト(SHIFT)**: タンク→タンク。移動元・移動先とも必須（移動元=その部署でallowSourcing、移動先=allowReceivingのタンク）。現場は任意、本船・トラックは記録しない。同一slipIdでPROCESS（移動元・減算）+RECEIVE（移動先・加算）のペア記録、reasonに`シフト: 元ラベル → 先ラベル`。内容物は両方に登録されているもののみ、行ロックはデッドロック回避のため対象タンクを合わせてid昇順で取得、グループが絡む場合は元・先それぞれで複数タンクに分配され得る。新しい`TransactionType`は追加していない
  - **放流(DISCHARGE)／出荷(SHIPOUT)**: タンク→外部（処理部署のみ）。対象タンク=その部署でallowSourcingのタンク。現場任意。台帳はPROCESS行(-)でreasonに「放流」/「出荷」を記録（公的書類で処分方法を区別するため）
- タンク関連ラベルは「受入れタンク」に統一（旧「タンク」から変更）
- **タンク×部署ごとの役割フラグ**：`VesselDepartment.allowReceiving`＝その部署がこのタンクに**入れられる**か（搬入先・シフト先）、`allowSourcing`＝**出せる**か（シフト元・放流・出荷の対象）。両方デフォルト`true`（リンク新規作成時の初期値）。**バージ単位ではなく、タンクと所属部署の組ごとに個別設定**（例: 収集バージKT55は船舶にとって受入✓搬入✓＝外部から入れてシフトで出す、恵比寿にとって受入✗搬入✓＝シフト元専用）。所属部署のないタンクはそもそもどの部署からも選択できない（上記4番のリンク0件ルール）。`/admin/vessels`の各タンク行に、所属部署チェックボックスと「受入」「搬入」チェックボックスを並べた行を専用フィールドセットとして表示（`saveBargeSettings`が`vesselDeptReceiving_<vesselId>_<departmentId>`／`vesselDeptSourcing_<vesselId>_<departmentId>`から読み取り、`VesselDepartment`行にupsert）。`showTotalOnly`バージのグループ選択肢は、配下タンクのいずれかがその部署・役割で利用可能なら全体として選択肢に出す（実際の絞り込みはサーバー側`resolveTarget`がタンク単位で改めて行う）。クライアント側（`record-form.tsx`の`roleFor`）とサーバー側（`record-transaction.ts`の`resolveTarget`）の両方でチェックする二重防御
- **現場候補は選択中の部署と同じ種別（ステータス）のみ表示**：記録画面の現場コンボボックスは、以前は全現場を対象に「今の部署が使っている現場を優先」して並べ替えるだけだったが、今は選択中の部署の`type`（運搬/処理）と一致する部署にリンクされた現場だけに絞り込む（`record/page.tsx`が`Site`ごとに紐づく部署種別の一覧`types`を渡し、`record-form.tsx`の`orderedSites`でフィルタ）。運搬部署の作業者には処理専用現場（例:「恵比寿橋シフト」）を出さない、その逆も同様
- `Department.requiresTransfer`（部署単位でシフトを強制するフラグ）は**廃止**（作業内容が部署種別＋タンク役割から導出されるようになったため。migration: `drop_department_requires_transfer` ※**本番DBへの適用は新コードのデプロイ完了後に行うこと**。旧コードのPrismaクライアントがこの列をSELECTするため、先に列を落とすと本番が壊れる）
- **管理画面の一括保存UX**：`/admin/vessels`・`/admin/departments`・`/admin/accounts`・`/admin/sites`は、行ごとの個別「保存」ボタンをやめ、**ページ内で共通の1つの右下固定ボタン**（`src/components/sticky-save-button.tsx`の`StickySaveButton`）でページ全体をまとめて保存する方式に統一した。実装は「見えない`<form id="xxx-form" action={...} />`をページに1つだけ置き、各行の入力欄・チェックボックスはDOM上の位置に関係なく`form="xxx-form"`属性でそこに紐づける」というHTML標準の仕組みを使う（`<form>`で囲むと削除・無効化用の別ミニフォームがネストして壊れるため、あえて囲まない）。サーバー側の保存アクション（`saveBargeSettings`/`saveDepartments`/`saveAccounts`/`saveSites`）は、対象idの一覧（例: `bargeIds`/`departmentIds`/`userIds`/`siteIds`）と、id付きのフィールド名（例: `bargeName_<id>`）を受け取る。**4つの一括保存すべてが「先に全行を検証→1つの`prisma.$transaction`で書き込み」の全or無方式**（途中エラーで一部の行だけ保存された中途半端な状態を防ぐ）。行数×リンク数ぶんの往復が発生するため`timeout: 30000`を明示し、`saveBargeSettings`は所属部署の`deleteMany`を`OR`条件で1回にまとめて往復を削減している
- **共有UIコンポーネント**（`src/components/ui.tsx`）：フォーム入力・ボタンの見た目は`FieldLabel`/`TextInput`/`Select`/`Textarea`/`PrimaryButton`/`ActionButton`（下線リンク風、tone=blue/red/zinc）に一元化した。`className`は`tailwind-merge`で後勝ちマージされるため、呼び出し側は幅（`w-20`等）やパディング（`py-1`等）だけ上書きすればよい。フックを使わないのでServer Componentからも使える。**新しい画面・フォームを作るときは生のTailwindクラス文字列をコピーせず、必ずこれらを使うこと**
- **共有表示ヘルパー**（`src/lib/labels.ts`）：台帳種別の対訳`TRANSACTION_TYPE_LABELS`と「バージ名-タンク名」表記の`vesselLabel()`。CSVエクスポート(`ledger-export.ts`)のラベルは提出済みファイルとの互換のため独立（CALIBRATION=「残量調整」）で、統合禁止。業務日初期値は`todayLocalDate()`（クライアント・端末ローカル）と`todayJst()`（サーバー検証・JST固定）を使い分ける
- **管理者判定は`isActiveAdmin(userId)`**（`require-admin.ts`）に一元化：requireAdmin/getAdminUserId/両レイアウトすべてが同じ「DBの現在値でrole+isActive確認」を通る。`tsc`と`eslint --max-warnings 0`は常時クリーンを維持すること（lint失敗=本物の問題）
- **`isActiveAdmin`は判定がfalseの場合、短い間隔（0/300/800/1500ms）で最大4回読み直す**。Neonの接続プーリングの性質上、直前の書き込み（例: 別の管理操作や自分自身のログイン直後）が別接続からは反映前に一瞬見えることがあり、これにより有効な管理者が誤って「権限なし」(`Error: 管理者権限が必要です`)と判定されて保存操作全体が500エラーで失敗する事故が本番で実際に発生した（本番ブラウザでの実クリックとVercelログの`error POST /admin/vessels 500`で再現・特定）。`withDbRetry`（接続断P1001/P2028を再試行）とは別物で、こちらはクエリ自体は成功するが結果が古いケースに対応する。本当に管理者でない場合は結果が変わらずfalseのままなので、正当な拒否には数百ms〜数秒の遅延が乗るだけで安全側に倒れる。最初の1回で判定できれば遅延ゼロ（実運用のほぼ全てのケース）

## 未実装（次の候補）
- 産廃管理票・海防法の正式様式でのPDF/Excel出力（実物の様式入手待ち。「品目種類が追加できれば柔軟でよい」との合意）
- Vercel環境変数へのGoogle Sheets/CRON_SECRET設定と再デプロイ（コードは実装済み・未アクティベート）

## 環境の注意
- Windows。ポート3000に古い`next dev`が残りやすい（`.next/dev/lock`のPIDを確認して停止）
- プレビューのスクリーンショットは頻繁にタイムアウトする→`preview_snapshot`/`preview_eval`で検証する
- シード: `npx prisma db seed`（管理者ログインIDは `SEED_ADMIN_LOGIN_ID`、パスワードは `SEED_ADMIN_PASSWORD`＝8文字以上を必須で環境変数から渡す。既定パスワードは廃止済み。パスワードはログ出力しない）
