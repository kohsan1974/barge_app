-- アカウントのログイン識別子をメールアドレスから、会社メールを持たない作業者にも
-- 発行できる管理者発行の「ログインID」に変更する（値は既存データを保持したままリネームのみ）

-- RenameColumn
ALTER TABLE "users" RENAME COLUMN "email" TO "loginId";

-- RenameIndex
ALTER INDEX "users_email_key" RENAME TO "users_loginId_key";
