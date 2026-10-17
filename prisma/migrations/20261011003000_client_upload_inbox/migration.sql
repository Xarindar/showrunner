CREATE TABLE "UploadRequest" (
  "id" TEXT NOT NULL,
  "siteId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "closedAt" TIMESTAMP(3),
  "reservedBytes" BIGINT NOT NULL DEFAULT 0,
  "fileCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UploadRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "UploadRequest_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "UploadRequest_limits" CHECK ("reservedBytes" BETWEEN 0 AND 10737418240 AND "fileCount" BETWEEN 0 AND 200)
);
CREATE UNIQUE INDEX "UploadRequest_token_key" ON "UploadRequest"("token");
CREATE INDEX "UploadRequest_siteId_createdAt_idx" ON "UploadRequest"("siteId", "createdAt");

CREATE TABLE "ClientUpload" (
  "id" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "objectKey" TEXT NOT NULL,
  "filename" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "senderName" TEXT NOT NULL,
  "senderEmail" TEXT NOT NULL,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ClientUpload_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ClientUpload_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "UploadRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ClientUpload_size" CHECK ("sizeBytes" BETWEEN 1 AND 262144000)
);
CREATE UNIQUE INDEX "ClientUpload_objectKey_key" ON "ClientUpload"("objectKey");
CREATE INDEX "ClientUpload_requestId_createdAt_idx" ON "ClientUpload"("requestId", "createdAt");
