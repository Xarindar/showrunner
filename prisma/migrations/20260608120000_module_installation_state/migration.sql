-- Create module installation and per-module setting state tables.
CREATE TABLE "ModuleInstallation" (
    "id" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "installed" BOOLEAN NOT NULL DEFAULT true,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "visibleToPublic" BOOLEAN NOT NULL DEFAULT false,
    "beta" BOOLEAN NOT NULL DEFAULT false,
    "configuredAt" TIMESTAMP(3),
    "settings" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModuleInstallation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ModuleSetting" (
    "id" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModuleSetting_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ModuleInstallation_moduleId_key" ON "ModuleInstallation"("moduleId");
CREATE INDEX "ModuleInstallation_enabled_idx" ON "ModuleInstallation"("enabled");
CREATE UNIQUE INDEX "ModuleSetting_moduleId_key_key" ON "ModuleSetting"("moduleId", "key");
CREATE INDEX "ModuleSetting_moduleId_idx" ON "ModuleSetting"("moduleId");

ALTER TABLE "ModuleSetting" ADD CONSTRAINT "ModuleSetting_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "ModuleInstallation"("moduleId") ON DELETE CASCADE ON UPDATE CASCADE;
