CREATE TYPE "FormSignatureCaptureType" AS ENUM ('TYPED', 'DRAWN');

CREATE TABLE "FormSignature" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "formFieldId" TEXT NOT NULL,
    "formSubmissionId" TEXT NOT NULL,
    "captureType" "FormSignatureCaptureType" NOT NULL,
    "capturedSignature" TEXT NOT NULL,
    "signerName" TEXT NOT NULL,
    "signerEmail" TEXT NOT NULL DEFAULT '',
    "consentStatement" TEXT NOT NULL,
    "ipAddress" TEXT NOT NULL DEFAULT '',
    "userAgent" TEXT NOT NULL DEFAULT '',
    "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FormSignature_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FormSignature_formSubmissionId_formFieldId_key" ON "FormSignature"("formSubmissionId", "formFieldId");
CREATE INDEX "FormSignature_siteId_formId_idx" ON "FormSignature"("siteId", "formId");
CREATE INDEX "FormSignature_formFieldId_idx" ON "FormSignature"("formFieldId");
CREATE INDEX "FormSignature_signerEmail_idx" ON "FormSignature"("signerEmail");
CREATE INDEX "FormSignature_signedAt_idx" ON "FormSignature"("signedAt");

ALTER TABLE "FormSignature" ADD CONSTRAINT "FormSignature_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FormSignature" ADD CONSTRAINT "FormSignature_formId_fkey" FOREIGN KEY ("formId") REFERENCES "Form"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FormSignature" ADD CONSTRAINT "FormSignature_formFieldId_fkey" FOREIGN KEY ("formFieldId") REFERENCES "FormField"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FormSignature" ADD CONSTRAINT "FormSignature_formSubmissionId_fkey" FOREIGN KEY ("formSubmissionId") REFERENCES "FormSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
