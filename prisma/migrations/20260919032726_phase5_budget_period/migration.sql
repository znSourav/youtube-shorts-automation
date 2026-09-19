-- CreateTable
CREATE TABLE "BudgetPeriod" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "month" TEXT NOT NULL,
    "allocatedUsd" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "BudgetPeriod_month_key" ON "BudgetPeriod"("month");
