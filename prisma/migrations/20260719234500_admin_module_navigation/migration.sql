-- CreateEnum
CREATE TYPE "AdminModuleNavigationCategory" AS ENUM ('PRIMARY', 'WEBSITE', 'MARKETING', 'FINANCE', 'MORE');

-- CreateTable
CREATE TABLE "AdminModuleNavigationItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "category" "AdminModuleNavigationCategory" NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminModuleNavigationItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdminModuleNavigationItem_userId_moduleId_key" ON "AdminModuleNavigationItem"("userId", "moduleId");

-- CreateIndex
CREATE INDEX "AdminModuleNavigationItem_userId_category_sortOrder_idx" ON "AdminModuleNavigationItem"("userId", "category", "sortOrder");

-- AddForeignKey
ALTER TABLE "AdminModuleNavigationItem" ADD CONSTRAINT "AdminModuleNavigationItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
