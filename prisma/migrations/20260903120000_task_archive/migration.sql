-- Archived tasks stay in the table; they are only hidden from the active list.
ALTER TABLE "CompanyTask" ADD COLUMN "archivedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "CompanyTask_archivedAt_idx" ON "CompanyTask"("archivedAt");
