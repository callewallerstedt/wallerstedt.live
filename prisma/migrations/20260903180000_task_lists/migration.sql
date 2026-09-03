-- Video ideas live in the same table as to-dos, separated by "list", so they
-- inherit ordering, archiving and the whole task API.
ALTER TABLE "CompanyTask" ADD COLUMN "list" TEXT NOT NULL DEFAULT 'task';
ALTER TABLE "CompanyTask" ADD COLUMN "song" TEXT NOT NULL DEFAULT '';

-- CreateIndex
CREATE INDEX "CompanyTask_list_status_sortOrder_idx" ON "CompanyTask"("list", "status", "sortOrder");
