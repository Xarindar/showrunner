import "server-only";

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/slug";

const allowedImageTypes = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/gif", "gif"]
]);
const maxUploadBytes = 7 * 1024 * 1024;

export type MediaUploadMetadata = {
  alt?: string;
  caption?: string;
  credit?: string;
  folder?: string;
  isDecorative?: boolean;
  isPrivate?: boolean;
  tags?: string | string[];
};

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

export function mediaTagsFromInput(value?: string | string[]) {
  const tags = Array.isArray(value) ? value : (value || "").split(",");

  return Array.from(
    new Set(
      tags
        .map((tag) => String(tag).trim())
        .filter(Boolean)
        .slice(0, 20)
    )
  );
}

export function normalizeMediaFolder(value?: string) {
  const folder = (value || "")
    .split("/")
    .map((part) => slugify(part))
    .filter(Boolean)
    .slice(0, 4)
    .join("/");

  return folder;
}

function assertAccessibleAlt(metadata: MediaUploadMetadata) {
  const safeAlt = metadata.alt?.trim() || "";

  if (!safeAlt && !metadata.isDecorative) {
    throw new Error("Add alt text or mark the image decorative before uploading.");
  }

  return safeAlt;
}

export async function uploadMedia(file: File, metadata: MediaUploadMetadata = {}) {
  if (!isR2Configured()) {
    throw new Error("R2 media uploads are not configured. Use repo assets or add R2 env vars.");
  }

  if (!allowedImageTypes.has(file.type)) {
    throw new Error("Upload a JPG, PNG, WebP, or GIF image. SVG uploads need a sanitizer before they can be enabled.");
  }

  if (file.size > maxUploadBytes) {
    throw new Error("Images must be smaller than 7 MB.");
  }

  const safeAlt = assertAccessibleAlt(metadata);
  const extension = allowedImageTypes.get(file.type) || "bin";
  const folder = normalizeMediaFolder(metadata.folder);
  const folderPrefix = folder ? `${folder}/` : "";
  const key = `uploads/${folderPrefix}${crypto.randomUUID()}.${extension}`;
  const bytes = Buffer.from(await file.arrayBuffer());

  await getR2Client().send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET,
      Key: key,
      Body: bytes,
      ContentType: file.type || "application/octet-stream",
      Metadata: {
        decorative: metadata.isDecorative ? "true" : "false",
        private: metadata.isPrivate ? "true" : "false"
      }
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
      mimeType: file.type || "application/octet-stream",
      sizeBytes: file.size,
      folder,
      tags: mediaTagsFromInput(metadata.tags),
      caption: metadata.caption?.trim() || "",
      credit: metadata.credit?.trim() || "",
      alt: metadata.isDecorative ? "" : safeAlt,
      isDecorative: Boolean(metadata.isDecorative),
      isPrivate: Boolean(metadata.isPrivate)
    }
  });
}
