CREATE TYPE "FormAttachmentTargetType" AS ENUM ('BOOKING', 'ORDER', 'GALLERY');

CREATE TABLE "FormAttachment" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "targetType" "FormAttachmentTargetType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FormAttachment_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "FormSubmission" ADD COLUMN "formAttachmentId" TEXT;

CREATE UNIQUE INDEX "FormAttachment_formId_targetType_targetId_key" ON "FormAttachment"("formId", "targetType", "targetId");
CREATE INDEX "FormAttachment_siteId_targetType_targetId_idx" ON "FormAttachment"("siteId", "targetType", "targetId");
CREATE INDEX "FormAttachment_formId_idx" ON "FormAttachment"("formId");
CREATE INDEX "FormAttachment_isRequired_idx" ON "FormAttachment"("isRequired");
CREATE INDEX "FormSubmission_formAttachmentId_idx" ON "FormSubmission"("formAttachmentId");

ALTER TABLE "FormAttachment" ADD CONSTRAINT "FormAttachment_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FormAttachment" ADD CONSTRAINT "FormAttachment_formId_fkey" FOREIGN KEY ("formId") REFERENCES "Form"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FormSubmission" ADD CONSTRAINT "FormSubmission_formAttachmentId_fkey" FOREIGN KEY ("formAttachmentId") REFERENCES "FormAttachment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
