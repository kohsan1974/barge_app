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
