-- CreateTable
CREATE TABLE "CompanyTask" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'open',
    "priority" INTEGER NOT NULL DEFAULT 1,
    "area" TEXT NOT NULL DEFAULT 'company',
    "dueDate" DATE,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CompanyTask_status_sortOrder_idx" ON "CompanyTask"("status", "sortOrder");

-- CreateIndex
CREATE INDEX "CompanyTask_status_dueDate_idx" ON "CompanyTask"("status", "dueDate");

-- CreateIndex
CREATE INDEX "CompanyTask_updatedAt_idx" ON "CompanyTask"("updatedAt");
