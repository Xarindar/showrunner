-- CreateEnum
CREATE TYPE "FormStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "FormFieldType" AS ENUM ('TEXT', 'TEXTAREA', 'EMAIL', 'PHONE', 'SELECT', 'CHECKBOX', 'RADIO', 'DATE', 'SIGNATURE', 'HIDDEN');

-- CreateEnum
CREATE TYPE "FormDestination" AS ENUM ('STANDALONE_LEAD', 'CLIENT', 'BOOKING', 'ORDER', 'GALLERY', 'INQUIRY');

-- CreateEnum
CREATE TYPE "TestimonialStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "Form" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "status" "FormStatus" NOT NULL DEFAULT 'DRAFT',
    "destination" "FormDestination" NOT NULL DEFAULT 'STANDALONE_LEAD',
    "submitButtonLabel" TEXT NOT NULL DEFAULT 'Submit',
    "successMessage" TEXT NOT NULL DEFAULT 'Thanks. Your form was submitted.',
    "notificationEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Form_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormField" (
    "id" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" "FormFieldType" NOT NULL,
    "placeholder" TEXT NOT NULL DEFAULT '',
    "helpText" TEXT NOT NULL DEFAULT '',
    "options" JSONB NOT NULL DEFAULT '[]',
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "isHidden" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FormField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormSubmission" (
    "id" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "clientId" TEXT,
    "submitterName" TEXT NOT NULL DEFAULT '',
    "submitterEmail" TEXT NOT NULL DEFAULT '',
    "data" JSONB NOT NULL DEFAULT '{}',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FormSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Testimonial" (
    "id" TEXT NOT NULL,
    "clientId" TEXT,
    "authorName" TEXT NOT NULL,
    "authorEmail" TEXT NOT NULL DEFAULT '',
    "authorRole" TEXT NOT NULL DEFAULT '',
    "quote" TEXT NOT NULL,
    "rating" INTEGER NOT NULL DEFAULT 5,
    "source" TEXT NOT NULL DEFAULT 'first-party',
    "sourceUrl" TEXT NOT NULL DEFAULT '',
    "serviceName" TEXT NOT NULL DEFAULT '',
    "productName" TEXT NOT NULL DEFAULT '',
    "permissionGranted" BOOLEAN NOT NULL DEFAULT false,
    "status" "TestimonialStatus" NOT NULL DEFAULT 'PENDING',
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Testimonial_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Form_slug_key" ON "Form"("slug");

-- CreateIndex
CREATE INDEX "Form_status_idx" ON "Form"("status");

-- CreateIndex
CREATE INDEX "Form_destination_idx" ON "Form"("destination");

-- CreateIndex
CREATE INDEX "FormField_formId_idx" ON "FormField"("formId");

-- CreateIndex
CREATE INDEX "FormField_type_idx" ON "FormField"("type");

-- CreateIndex
CREATE INDEX "FormSubmission_formId_idx" ON "FormSubmission"("formId");

-- CreateIndex
CREATE INDEX "FormSubmission_clientId_idx" ON "FormSubmission"("clientId");

-- CreateIndex
CREATE INDEX "FormSubmission_submitterEmail_idx" ON "FormSubmission"("submitterEmail");

-- CreateIndex
CREATE INDEX "Testimonial_clientId_idx" ON "Testimonial"("clientId");

-- CreateIndex
CREATE INDEX "Testimonial_status_idx" ON "Testimonial"("status");

-- CreateIndex
CREATE INDEX "Testimonial_featured_idx" ON "Testimonial"("featured");

-- AddForeignKey
ALTER TABLE "FormField" ADD CONSTRAINT "FormField_formId_fkey" FOREIGN KEY ("formId") REFERENCES "Form"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormSubmission" ADD CONSTRAINT "FormSubmission_formId_fkey" FOREIGN KEY ("formId") REFERENCES "Form"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormSubmission" ADD CONSTRAINT "FormSubmission_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Testimonial" ADD CONSTRAINT "Testimonial_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Enable the newly active Forms and Testimonials modules for existing single-site installs.
UPDATE "SiteSettings"
SET "enabledModules" = "enabledModules" || '["forms"]'::jsonb
WHERE NOT "enabledModules" @> '["forms"]'::jsonb;

UPDATE "SiteSettings"
SET "enabledModules" = "enabledModules" || '["testimonials"]'::jsonb
WHERE NOT "enabledModules" @> '["testimonials"]'::jsonb;
