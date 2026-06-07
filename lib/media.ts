import "server-only";

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { prisma } from "@/lib/prisma";

const allowedImageTypes = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/gif", "gif"],
  ["image/svg+xml", "svg"]
]);
const maxUploadBytes = 7 * 1024 * 1024;

export function isR2Configured() {
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      process.env.R2_BUCKET &&
      process.env.R2_PUBLIC_BASE_URL
  );
}

function getR2Client() {
  return new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || ""
    }
  });
}

export async function uploadMedia(file: File, alt?: string) {
  if (!isR2Configured()) {
    throw new Error("R2 media uploads are not configured. Use repo assets or add R2 env vars.");
  }

  if (!allowedImageTypes.has(file.type)) {
    throw new Error("Upload a JPG, PNG, WebP, GIF, or SVG image.");
  }

  if (file.size > maxUploadBytes) {
    throw new Error("Images must be smaller than 7 MB.");
  }

  const safeAlt = alt?.trim();
  if (!safeAlt) {
    throw new Error("Add alt text before uploading an image.");
  }

  const extension = allowedImageTypes.get(file.type) || "bin";
  const key = `uploads/${crypto.randomUUID()}.${extension}`;
  const bytes = Buffer.from(await file.arrayBuffer());

  await getR2Client().send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET,
      Key: key,
      Body: bytes,
      ContentType: file.type || "application/octet-stream"
    })
  );

  const baseUrl = process.env.R2_PUBLIC_BASE_URL?.replace(/\/$/, "");
  const url = `${baseUrl}/${key}`;

  return prisma.mediaAsset.create({
    data: {
      driver: "R2",
      key,
      url,
      filename: file.name,
      alt: safeAlt
    }
  });
}
