ALTER TABLE "TestRun" ADD COLUMN "shareToken" TEXT;
CREATE UNIQUE INDEX "TestRun_shareToken_key" ON "TestRun"("shareToken");
