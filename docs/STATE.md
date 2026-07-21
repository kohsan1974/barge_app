# STATE.md — Fable optimization (guardrails kit)

## Goal
Build a portable CLAUDE.md + docs kit that makes Opus/Sonnet perform near Fable level (fewer logic errors/bugs, fewer tokens), plus MIGRATE.md to retrofit existing projects.

## Now
Kit v1.0 complete: authored, adversarially reviewed (13 reviewers, 193 findings), all blocker/major fixes applied, budgets verified, committed.

## Next
1. (optional) Field-test: install the kit into a real Opus project and observe TRIGGER:/V-line compliance in transcripts.
2. (optional) Tune wording based on observed misses; bump to v1.1 via _FORMAT.md F15 + README Upgrade notes.

## Constraints
- Kit files must never be paraphrased when carried/edited — verbatim discipline (kit's own rule).
- Never push without explicit confirmation (user global).

## Decisions
- Lean always-loaded core (~35 kit lines) + on-demand docs routed by event-phrased triggers — why: extensive + low-token simultaneously.
- Trap tables split into docs/guardrails/TRAPS.md (routed via CODE.md C7) — why: halves the every-session CODE.md read cost.
- Single-source with sanctioned compression: iron rules may compress doc rules; shared trigger lists byte-identical (_FORMAT.md F7 lists pairs).
- Canonical status vocabulary: VERIFIED / UNVERIFIED / EDITED-UNVERIFIED / NOT-DONE / CANNOT-REPRODUCE (owned by VERIFY.md).
- MIGRATE.md: transport-not-authorship, per-file copies, CONFLICT-PENDING disposition, UPGRADE mode U0-U4.

## Facts
- Kit root: C:\Users\Laptop\Documents\Fable optimization (git repo, branch main)
- Kit files (installable): CLAUDE.md, MIGRATE.md, docs/guardrails/{_FORMAT,PLAN,CODE,TRAPS,DEBUG,VERIFY,EFFICIENCY,SESSION}.md (8 docs)
- Budgets verified: 35 kit lines / 12 iron rules / 4 CAPS / 7 routing rows; docs ~830-1210 words each
- Research: docs/research-digest.md (155 findings); review: docs/review-digest.md (193 findings)
- Workflows: research wf_f57b6575, review wf_aeae1114

## Done
- Research workflow (8 lenses) — RESULT: 155 findings in docs/research-digest.md.
- Kit v1 draft — RESULT: commit 85d7fd5.
- Adversarial review (13 reviewers) — RESULT: 19 blockers / 94 majors / 80 minors; all blockers+majors and substantive minors applied in the v1.0 rewrite.
- Verification — RESULT: broken doc paths none; missing rule IDs none; paired trigger lists byte-identical in all owning files.

## Open items
(none)

## Failed attempts
(none)

## Failed attempts
- ATTEMPT 1 [L1] (barge_app 保存ボタン): position:fixed→stickyへ変更 -> タップ判定は復活したがiOS本番で保存されず（送信未発火）
- ATTEMPT 2 [L2]: 新仮説=iOS WebKitはform属性の外部submitterクリックで送信を発火しない -> クリック時にform.requestSubmit()を直接呼ぶ
- ATTEMPT 3 [L3] 解決: 保存ボタンを本物の<form>の内側に入れ、ネイティブtype=submitで送信。
  Playwrightで実証: JS有効=保存OK / **JS無効=保存OK**（iOSの怪しい送信経路もJSも非依存）/ iPhone幅390pxで5画面すべて横オーバーフロー0px。
  あわせて管理画面をスマホ縦積みレイアウト（メニューは上部横スクロールチップ、表はoverflow-x-auto）に変更。

## 都度保存（オートセーブ）移行
- 方針: 「変更を保存」ボタン廃止→各コントロール変更時に即保存。サーバーアクションを<form>送信でなく「bind済み関数の直接呼び出し」で起動（iOSのフォーム送信不具合を一切踏まない）。削除は確認ダイアログ、文字欄はblur保存。
- step1完了(vessels): src/components/admin-autosave.tsx(新規: AutoText/AutoCheckbox/AutoSelect/VesselDeptRow/ConfirmButton)、barges.ts updateBargeField、vessels.ts updateVesselField/setVesselDepartmentLink、vessels/page.tsx全面置換。Playwright 5/5 PASS。
- 全step完了: departments/accounts/sites/ships もオートセーブ化、StickySaveButton撤去。Playwright 全画面9/9 + vessels 5/5 PASS。

## 記録の連投防止（冪等キー）— 完了
- 原因: サーバー処理が遅く、pending無効化が反映される前に登録ボタンが連打され二重INSERT。
- 対策: RecordSubmissionテーブル（クライアント生成UUIDをPK）を追加。recordTransactionのトランザクション先頭でINSERTし、二重送信は一意制約で弾いて1件だけ記録（P2002は成功扱いで冪等）。
- クライアント: submissionIdをrefで管理、成功時はリセットせず「次のユーザー編集」で更新（直列化される連打でも重複しないため）。
- Playwright実測: 単発+1 / 二重送信+1のみ / 別記録は別伝票+1。

## 記録の取消（論理削除）— 完了（Step 2）
- admin限定・伝票(slip)単位。物理削除せず voidedAt/voidedById/voidReason をセット。
- DBトリガーv3: siteIdのみ許可に加え「取消3列のみのUPDATE」を許可（migration add_transaction_void）。
- void-record.ts: 残量を行ロックで巻き戻し（0..max ガード）、訂正済み・CALIBRATION/CORRECTIONは取消不可。
- 履歴(/history): admin判定、取消済みは横線＋「削除しました」＋監査情報、adminに取消ボタン(理由prompt必須)。
- 出力(ledger-export)・訂正一覧・createCorrection: voidedAt除外/ガード。
- vercel.json: regions=["sin1"]（Neon ap-southeast-1に合わせ）。
- Playwright 9/9 PASS（残量巻き戻し・横線・監査・CSV除外・論理削除で行残存）。

## パフォーマンス（コード側）— 完了（Step 4）
- /api/ping: keep-warm用の軽量エンドポイント（SELECT 1、認証不要、proxyのmatcherから除外）。外部cronで数分おきに叩きNeonの自動サスペンドを回避。
- record-transaction: 独立した初期3チェック（me/assignment/department）をPromise.allで1往復に集約（findUniqueOrThrow→findUnique+nullチェック）。
- vercel.json regions=sin1 は Step2 で設定済み。
- 回帰なし: 連投4項目・取消9項目 再実行OK。ping=200 {ok:true}。

## 訂正と取消の重複解消 — 完了
- 決定: 記録の「取消（論理削除）」に一本化し、「記録の訂正（逆仕訳）」を廃止（誤入力が出力に残る訂正より、出力から除外される取消が目的に合致）。
- admin navから「記録の訂正」除去、correction-form.tsx / actions/corrections.ts 削除、/admin/corrections は /history へリダイレクト。
- 過去のCORRECTIONデータの表示（history/labels/export/voidガード）は継続。
- 確認: nav除去・旧URLリダイレクト・取消健在 4/4 OK。

## 取消ボタンが実機で無反応 → 直接呼び出し方式へ修正
- 原因: VoidRecordButtonが window.prompt + ネイティブ<form action=サーバーアクション>送信方式。iOSでprompt/フォーム送信が不安定（保存ボタン問題と同クラス）。Chromiumでは通るが実機で無反応。
- 修正: voidTransactionSlip を (slipId, reason)→結果 に変更（redirect廃止）。VoidRecordButtonを画面内の理由入力欄＋useTransitionでの直接呼び出しに書き換え（prompt・form送信を排除）。history側は bind で渡し、redirect用の?error/?ok処理を削除。
- Playwright 9/9 OK（新方式で残量巻き戻し・横線・監査・CSV除外）。

## キャリブレーションも取消可能に — 完了
- void-record.ts: 特別扱いガードを「CORRECTIONのみ禁止」に変更（CALIBRATIONは取消可能に）。残量巻き戻しは既存式 currentBalance -= 数量 で正しく処理（キャリブレーションの数量=調整差分＝残量寄与）。
- history: canVoid に CALIBRATION を追加。
- Playwright実測 6/6: キャリブレーション実行→残量が実測値/取消ボタン表示/取消で残量が調整前に復元/削除しました表示/DBに論理削除で残存。通常の取消も9/9で回帰なし。

## シフトの「内容物未登録」エラー（誤解を招く表示）— メッセージ修正
- 調査: バグではなく仕様（AGENTS.md L46「シフトの内容物は移動元と移動先の両方に登録されたもののみ」）。record-form.tsxのavailableContents=移動先∩移動元が空だと表示。
- 旧メッセージ「このタンクには内容物が登録されていません」が誤解を招いていた（実際は「共通の内容物が無い」）。
- 修正: シフト時のメッセージを「移動元と移動先の両方に共通して登録された内容物がありません…移動先タンクにも登録すると選べます」に変更。
- Playwright実証: 共通ありで品目選択が出る/共通なしで新メッセージ、2/2 OK。
