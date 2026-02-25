-- AlterTable: User - invite flow (password optional until set; invite token for email link)
ALTER TABLE "User" ALTER COLUMN "password_hash" DROP NOT NULL;

ALTER TABLE "User" ADD COLUMN "invite_token" TEXT;
ALTER TABLE "User" ADD COLUMN "invite_token_expires_at" TIMESTAMP(3);

CREATE UNIQUE INDEX "User_invite_token_key" ON "User"("invite_token");
