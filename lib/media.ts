import "server-only";

import { createHmac, randomUUID, timingSafeEqual } from "crypto";
import { mkdir, readFile, rm, writeFile } from "fs/promises";
import path from "path";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { MediaDriver, MediaVariantType, type MediaAsset } from "@prisma/client";
import type { NextRequest } from "next/server";
import sharp from "sharp";
import { prisma } from "@/lib/prisma";
import { isSafeExternalHttpsUrl } from "@/lib/security/urls";
import { getCurrentSiteId } from "@/lib/site";
import { slugify } from "@/lib/slug";

const allowedImageTypes = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/gif", "gif"]
]);
const allowedPrivateFileTypes = new Map([...allowedImageTypes, ["application/pdf", "pdf"]]);
const maxUploadBytes = 12 * 1024 * 1024;
const signedUrlTtlSeconds = 15 * 60;
const generatedVariantContentType = "image/webp";

export const privateMediaUploadMimeTypes = Array.from(allowedPrivateFileTypes.keys());

export const mediaVariantPresets = {
  [MediaVariantType.THUMBNAIL]: { width: 320, height: 240, fit: "cover" },
  [MediaVariantType.CARD]: { width: 720, height: 540, fit: "cover" },
  [MediaVariantType.HERO]: { width: 1800, height: 1000, fit: "cover" },
  [MediaVariantType.FULL]: { width: 2400, height: 1800, fit: "contain" },
  [MediaVariantType.SOCIAL]: { width: 1200, height: 630, fit: "cover" },
  [MediaVariantType.DOWNLOAD]: { width: 0, height: 0, fit: "original" }
} satisfies Record<MediaVariantType, { fit: string; height: number; width: number }>;

const mediaVariantTypes = Object.values(MediaVariantType);
const generatedImageVariantTypes = new Set<MediaVariantType>(mediaVariantTypes.filter((type) => type !== MediaVariantType.DOWNLOAD));
type ObjectStorageDriver = Extract<MediaDriver, "R2" | "S3">;

export type MediaUploadMetadata = {
  alt?: string;
  caption?: string;
  credit?: string;
  focalPointX?: number | string;
  focalPointY?: number | string;
  folder?: string;
  isDecorative?: boolean;
  isPrivate?: boolean;
  siteId?: string;
  tags?: string | string[];
  uploadedByStaffId?: string;
  usageContext?: string;
};

export type MediaUploadValidationOptions = {
  allowedMimeTypes?: readonly string[];
  maxBytes?: number;
  requireImage?: boolean;
};

type MediaStoredObject = {
  driver: MediaDriver;
  key: string;
  storageProviderId?: string;
  url: string;
};

type ObjectStorageConfig = {
  accessKeyId: string;
  bucket: string;
  driver: ObjectStorageDriver;
  endpoint: string;
  forcePathStyle: boolean;
  label: string;
  publicBaseUrl: string;
  region: string;
  secretAccessKey: string;
};

export type MediaAdapter = {
  driver: MediaDriver;
  canUpload(): boolean;
  delete?(asset: Pick<MediaAsset, "key" | "storageProviderId">): Promise<void>;
  generateVariantUrl(asset: Pick<MediaAsset, "id" | "isPrivate" | "key" | "storageProviderId" | "url">, type: MediaVariantType): string;
  signPrivateUrl(asset: Pick<MediaAsset, "id">, type?: MediaVariantType, ttlSeconds?: number): string;
  upload(file: File, metadata: MediaUploadMetadata): Promise<MediaStoredObject>;
};

function boundedUnit(value: number | string | undefined, fallback = 0.5) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(1, Math.max(0, numeric));
}

function firstEnv(...keys: string[]) {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return "";
}

function booleanEnv(value: string | undefined, fallback = false) {
  if (!value) return fallback;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function publicBaseUrl(...keys: string[]) {
  return firstEnv(...keys).replace(/\/$/, "");
}

function r2Config(): ObjectStorageConfig {
  return {
    accessKeyId: firstEnv("R2_ACCESS_KEY_ID"),
    bucket: firstEnv("R2_BUCKET"),
    driver: MediaDriver.R2,
    endpoint: firstEnv("R2_ENDPOINT") || (process.env.R2_ACCOUNT_ID ? `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : ""),
    forcePathStyle: booleanEnv(process.env.R2_FORCE_PATH_STYLE),
    label: "R2",
    publicBaseUrl: publicBaseUrl("R2_PUBLIC_BASE_URL"),
    region: firstEnv("R2_REGION") || "auto",
    secretAccessKey: firstEnv("R2_SECRET_ACCESS_KEY")
  };
}

function s3Config(): ObjectStorageConfig {
  return {
    accessKeyId: firstEnv("S3_ACCESS_KEY_ID", "AWS_ACCESS_KEY_ID", "ACCESS_KEY_ID"),
    bucket: firstEnv("S3_BUCKET", "AWS_BUCKET", "BUCKET"),
    driver: MediaDriver.S3,
    endpoint: firstEnv("S3_ENDPOINT", "AWS_ENDPOINT_URL_S3", "AWS_ENDPOINT_URL", "ENDPOINT"),
    forcePathStyle: booleanEnv(process.env.S3_FORCE_PATH_STYLE ?? process.env.AWS_S3_FORCE_PATH_STYLE),
    label: "S3",
    publicBaseUrl: publicBaseUrl("S3_PUBLIC_BASE_URL", "AWS_PUBLIC_BASE_URL"),
    region: firstEnv("S3_REGION", "AWS_REGION", "REGION") || "auto",
    secretAccessKey: firstEnv("S3_SECRET_ACCESS_KEY", "AWS_SECRET_ACCESS_KEY", "SECRET_ACCESS_KEY")
  };
}

function isObjectStorageConfigured(config: ObjectStorageConfig) {
  return Boolean(config.bucket && config.endpoint && config.accessKeyId && config.secretAccessKey);
}

export function isR2Configured() {
  return isObjectStorageConfigured(r2Config());
}

export function isS3Configured() {
  return isObjectStorageConfigured(s3Config());
}

export function isCloudflareImagesConfigured() {
  return Boolean(process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_IMAGES_API_TOKEN && process.env.CLOUDFLARE_IMAGES_ACCOUNT_HASH);
}

export function serverAssetStorageRoot() {
  return path.resolve(process.env.MEDIA_ASSET_DIR || path.join(process.cwd(), ".media-assets"));
}

export function isServerAssetStorageConfigured() {
  return Boolean(serverAssetStorageRoot());
}

export function isMediaUploadDriverConfigured(driver: MediaDriver | string) {
  if (driver === MediaDriver.SERVER_ASSETS) return isServerAssetStorageConfigured();
  if (driver === MediaDriver.S3) return isS3Configured();
  if (driver === MediaDriver.R2) return isR2Configured();
  if (driver === MediaDriver.CLOUDFLARE_IMAGES) return isCloudflareImagesConfigured();
  return false;
}

export function supportsPrivateMediaDriver(driver: MediaDriver | string) {
  return driver === MediaDriver.SERVER_ASSETS || driver === MediaDriver.S3 || driver === MediaDriver.R2;
}

function getObjectStorageClient(config: ObjectStorageConfig) {
  return new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: config.forcePathStyle,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey
    }
  });
}

function getObjectStorageConfig(driver: ObjectStorageDriver) {
  return driver === MediaDriver.S3 ? s3Config() : r2Config();
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

export function normalizeMediaVariantType(value?: string | null) {
  const normalized = String(value || MediaVariantType.FULL).toUpperCase();
  return mediaVariantTypes.includes(normalized as MediaVariantType) ? (normalized as MediaVariantType) : MediaVariantType.FULL;
}

function assertAccessibleAlt(metadata: MediaUploadMetadata) {
  const safeAlt = metadata.alt?.trim() || "";

  if (!safeAlt && !metadata.isDecorative) {
    throw new Error("Add alt text or mark the image decorative before uploading.");
  }

  return safeAlt;
}

function mimeTypeExtension(mimeType: string) {
  return allowedPrivateFileTypes.get(mimeType) || "bin";
}

function isWeakProductionSecret(value: string) {
  const normalized = value.trim().toLowerCase();
  return normalized.length < 32 || normalized.includes("replace-with") || normalized.includes("local-dev") || normalized.includes("change-me");
}

async function runVirusScanHook(file: File) {
  if (process.env.MEDIA_VIRUS_SCAN_MODE === "required") {
    throw new Error("Media virus scanning is required but no scanner adapter is configured.");
  }

  return {
    scanned: false,
    sizeBytes: file.size
  };
}

async function detectUploadMimeType(file: File) {
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const ascii = String.fromCharCode(...bytes);

  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a) {
    return "image/png";
  }
  if (ascii.startsWith("GIF87a") || ascii.startsWith("GIF89a")) return "image/gif";
  if (ascii.startsWith("RIFF") && ascii.slice(8, 12) === "WEBP") return "image/webp";
  if (ascii.startsWith("%PDF-")) return "application/pdf";

  return "";
}

async function assertUploadFile(file: File, metadata: MediaUploadMetadata, validation: MediaUploadValidationOptions = {}) {
  const requireImage = validation.requireImage !== false;
  const allowedMimeTypes = new Set(
    (validation.allowedMimeTypes?.length ? validation.allowedMimeTypes : requireImage ? Array.from(allowedImageTypes.keys()) : privateMediaUploadMimeTypes)
      .map((type) => type.toLowerCase())
      .filter((type) => (requireImage ? allowedImageTypes.has(type) : allowedPrivateFileTypes.has(type)))
  );

  if (!allowedMimeTypes.has(file.type.toLowerCase())) {
    throw new Error(
      requireImage
        ? "Upload a JPG, PNG, WebP, or GIF image. SVG uploads need a sanitizer before they can be enabled."
        : "Upload a supported file type."
    );
  }

  const maxBytes = Math.min(Math.max(1, validation.maxBytes || maxUploadBytes), 25 * 1024 * 1024);
  if (file.size > maxBytes) {
    throw new Error(`Files must be smaller than ${Math.round(maxBytes / (1024 * 1024))} MB.`);
  }

  const detectedMimeType = await detectUploadMimeType(file);
  if (detectedMimeType !== file.type) {
    throw new Error("The uploaded file contents do not match the selected file type.");
  }

  return requireImage ? assertAccessibleAlt(metadata) : metadata.alt?.trim() || file.name;
}

function mediaSigningSecret() {
  const secret = process.env.MEDIA_URL_SIGNING_SECRET || process.env.AUTH_SECRET || "";
  if (process.env.NODE_ENV === "production" && (!secret || isWeakProductionSecret(secret))) {
    throw new Error("MEDIA_URL_SIGNING_SECRET must be set to a strong secret before private media URLs can be signed.");
  }

  return secret || "local-dev-media-url-secret";
}

function signaturePayload(assetId: string, type: MediaVariantType, expiresAt: number) {
  return `${assetId}.${type}.${expiresAt}`;
}

function signPayload(assetId: string, type: MediaVariantType, expiresAt: number) {
  return createHmac("sha256", mediaSigningSecret()).update(signaturePayload(assetId, type, expiresAt)).digest("base64url");
}

export function createSignedMediaUrl(assetId: string, type: MediaVariantType = MediaVariantType.FULL, ttlSeconds = signedUrlTtlSeconds) {
  const expires = Math.floor(Date.now() / 1000) + ttlSeconds;
  const signature = signPayload(assetId, type, expires);
  const params = new URLSearchParams({
    expires: String(expires),
    signature,
    variant: type
  });

  return `/api/media/assets/${encodeURIComponent(assetId)}?${params.toString()}`;
}

export function verifySignedMediaUrl(input: { assetId: string; expires?: string | null; signature?: string | null; type: MediaVariantType }) {
  const expires = Number(input.expires || 0);
  if (!Number.isFinite(expires) || expires < Math.floor(Date.now() / 1000)) return false;
  if (!input.signature) return false;

  const expected = Buffer.from(signPayload(input.assetId, input.type, expires));
  const actual = Buffer.from(input.signature);
  if (expected.length !== actual.length) return false;

  return timingSafeEqual(expected, actual);
}

function appMediaRoute(assetId: string, type: MediaVariantType) {
  const params = new URLSearchParams({ variant: type });
  return `/api/media/assets/${encodeURIComponent(assetId)}?${params.toString()}`;
}

function serverAssetRelativeKey(key: string) {
  return key.replace(/\\/g, "/").replace(/^\/+/, "");
}

function serverAssetPath(key: string) {
  const root = serverAssetStorageRoot();
  const target = path.resolve(root, serverAssetRelativeKey(key));
  const relative = path.relative(root, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Invalid media asset path.");
  }

  return target;
}

function cloudflareImagesDeliveryUrl(imageId: string, type: MediaVariantType) {
  const accountHash = process.env.CLOUDFLARE_IMAGES_ACCOUNT_HASH;
  if (!accountHash || !imageId) return "";

  const variant = type.toLowerCase();
  return `https://imagedelivery.net/${accountHash}/${imageId}/${variant}`;
}

const repoAdapter: MediaAdapter = {
  driver: MediaDriver.REPO,
  canUpload: () => false,
  generateVariantUrl: (asset, type) => (asset.isPrivate ? appMediaRoute(asset.id, type) : asset.url),
  signPrivateUrl: (asset, type = MediaVariantType.FULL, ttlSeconds = signedUrlTtlSeconds) => createSignedMediaUrl(asset.id, type, ttlSeconds),
  upload: async () => {
    throw new Error("Repo media assets are reference-only. Use an existing public asset path or switch media mode to Server asset folder, S3, R2, or Cloudflare Images.");
  }
};

const serverAssetsAdapter: MediaAdapter = {
  driver: MediaDriver.SERVER_ASSETS,
  canUpload: isServerAssetStorageConfigured,
  delete: async (asset) => {
    if (!asset.key) return;
    await rm(serverAssetPath(asset.key), { force: true }).catch(() => {});
  },
  generateVariantUrl: (asset, type) => appMediaRoute(asset.id, type),
  signPrivateUrl: (asset, type = MediaVariantType.FULL, ttlSeconds = signedUrlTtlSeconds) => createSignedMediaUrl(asset.id, type, ttlSeconds),
  upload: async (file, metadata) => {
    const extension = mimeTypeExtension(file.type);
    const sitePrefix = slugify(metadata.siteId || "site") || "site";
    const folder = normalizeMediaFolder(metadata.folder);
    const folderPrefix = folder ? `${folder}/` : "";
    const key = `sites/${sitePrefix}/uploads/${folderPrefix}${randomUUID()}.${extension}`;
    const target = serverAssetPath(key);

    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, Buffer.from(await file.arrayBuffer()));

    return {
      driver: MediaDriver.SERVER_ASSETS,
      key,
      url: ""
    };
  }
};

function objectStoragePublicObjectUrl(config: ObjectStorageConfig, key: string) {
  return config.publicBaseUrl ? `${config.publicBaseUrl}/${key}` : "";
}

function objectStorageAdapter(driver: ObjectStorageDriver): MediaAdapter {
  const configured = driver === MediaDriver.S3 ? isS3Configured : isR2Configured;

  return {
    driver,
    canUpload: configured,
    delete: async (asset) => {
      const config = getObjectStorageConfig(driver);
      if (!config.bucket || !asset.key) return;
      await getObjectStorageClient(config).send(
        new DeleteObjectCommand({
          Bucket: config.bucket,
          Key: asset.key
        })
      );
    },
    generateVariantUrl: (asset, type) => (asset.isPrivate ? appMediaRoute(asset.id, type) : asset.url || appMediaRoute(asset.id, type)),
    signPrivateUrl: (asset, type = MediaVariantType.FULL, ttlSeconds = signedUrlTtlSeconds) => createSignedMediaUrl(asset.id, type, ttlSeconds),
    upload: async (file, metadata) => {
      const config = getObjectStorageConfig(driver);
      if (!isObjectStorageConfigured(config)) {
        throw new Error(`${config.label} media uploads are not configured. Use repo assets or add ${config.label} env vars.`);
      }

      const extension = mimeTypeExtension(file.type);
      const folder = normalizeMediaFolder(metadata.folder);
      const folderPrefix = folder ? `${folder}/` : "";
      const sitePrefix = slugify(metadata.siteId || "site") || "site";
      const key = `sites/${sitePrefix}/uploads/${folderPrefix}${randomUUID()}.${extension}`;
      const bytes = Buffer.from(await file.arrayBuffer());

      await getObjectStorageClient(config).send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: key,
          Body: bytes,
          ContentType: file.type || "application/octet-stream",
          Metadata: {
            decorative: metadata.isDecorative ? "true" : "false",
            private: metadata.isPrivate ? "true" : "false"
          }
        })
      );

      return {
        driver,
        key,
        url: metadata.isPrivate ? "" : objectStoragePublicObjectUrl(config, key)
      };
    }
  };
}

const r2Adapter = objectStorageAdapter(MediaDriver.R2);
const s3Adapter = objectStorageAdapter(MediaDriver.S3);

const cloudflareImagesAdapter: MediaAdapter = {
  driver: MediaDriver.CLOUDFLARE_IMAGES,
  canUpload: isCloudflareImagesConfigured,
  generateVariantUrl: (asset, type) => (asset.isPrivate ? appMediaRoute(asset.id, type) : cloudflareImagesDeliveryUrl(asset.storageProviderId || asset.key, type)),
  signPrivateUrl: (asset, type = MediaVariantType.FULL, ttlSeconds = signedUrlTtlSeconds) => createSignedMediaUrl(asset.id, type, ttlSeconds),
  upload: async (file, metadata) => {
    if (!isCloudflareImagesConfigured()) {
      throw new Error("Cloudflare Images uploads are not configured. Add Cloudflare Images env vars or switch media mode.");
    }
    if (metadata.isPrivate) {
      throw new Error("Private uploads currently require R2 storage. Cloudflare Images private delivery needs signed Cloudflare URL support before it can be enabled.");
    }

    const formData = new FormData();
    formData.set("file", file);
    formData.set("metadata", JSON.stringify({ decorative: Boolean(metadata.isDecorative), private: Boolean(metadata.isPrivate) }));
    formData.set("requireSignedURLs", "false");

    const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/images/v1`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.CLOUDFLARE_IMAGES_API_TOKEN}`
      },
      body: formData
    });
    const payload = (await response.json().catch(() => null)) as { result?: { id?: string; variants?: string[] }; success?: boolean } | null;

    if (!response.ok || !payload?.success || !payload.result?.id) {
      throw new Error("Cloudflare Images rejected the upload.");
    }

    const imageId = payload.result.id;
    return {
      driver: MediaDriver.CLOUDFLARE_IMAGES,
      key: imageId,
      storageProviderId: imageId,
      url: metadata.isPrivate ? "" : cloudflareImagesDeliveryUrl(imageId, MediaVariantType.FULL)
    };
  }
};

export function getMediaAdapter(driver: MediaDriver | string): MediaAdapter {
  if (driver === MediaDriver.SERVER_ASSETS) return serverAssetsAdapter;
  if (driver === MediaDriver.S3) return s3Adapter;
  if (driver === MediaDriver.R2) return r2Adapter;
  if (driver === MediaDriver.CLOUDFLARE_IMAGES) return cloudflareImagesAdapter;
  return repoAdapter;
}

function variantRowsForAsset(asset: Pick<MediaAsset, "id" | "isPrivate" | "key" | "storageProviderId" | "url"> & { driver: MediaDriver }) {
  const adapter = getMediaAdapter(asset.driver);

  return mediaVariantTypes.map((type) => {
    const preset = mediaVariantPresets[type];
    return {
      assetId: asset.id,
      format: type === MediaVariantType.DOWNLOAD ? "original" : "web-optimized",
      height: preset.height,
      metadata: {
        fit: preset.fit,
        generatedBy: adapter.driver
      },
      sizeBytes: 0,
      type,
      url: adapter.generateVariantUrl(asset, type),
      width: preset.width
    };
  });
}

export async function ensureMediaAssetVariants(asset: Pick<MediaAsset, "driver" | "id" | "isPrivate" | "key" | "storageProviderId" | "url">) {
  const rows = variantRowsForAsset(asset);

  await prisma.$transaction(
    rows.map((row) =>
      prisma.mediaAssetVariant.upsert({
        where: {
          assetId_type: {
            assetId: row.assetId,
            type: row.type
          }
        },
        create: row,
        update: {
          format: row.format,
          height: row.height,
          metadata: row.metadata,
          url: row.url,
          width: row.width
        }
      })
    )
  );
}

export function mediaAssetDisplayUrl(
  asset: Pick<MediaAsset, "driver" | "id" | "isPrivate" | "key" | "storageProviderId" | "url">,
  type: MediaVariantType = MediaVariantType.CARD
) {
  if (asset.isPrivate) return createSignedMediaUrl(asset.id, type);
  return getMediaAdapter(asset.driver).generateVariantUrl(asset, type);
}

export async function uploadMedia(
  file: File,
  metadata: MediaUploadMetadata = {},
  driver: MediaDriver = MediaDriver.R2,
  siteId?: string,
  validation: MediaUploadValidationOptions = {}
) {
  const currentSiteId = siteId || (await getCurrentSiteId());

  if (metadata.isPrivate && driver !== MediaDriver.S3 && driver !== MediaDriver.R2 && driver !== MediaDriver.SERVER_ASSETS) {
    throw new Error("Private media delivery is currently supported only for server assets, S3, or R2 assets.");
  }

  const safeAlt = await assertUploadFile(file, metadata, validation);
  const scanResult = await runVirusScanHook(file);
  const adapter = getMediaAdapter(driver);
  const stored = await adapter.upload(file, { ...metadata, siteId: currentSiteId });
  const folder = normalizeMediaFolder(metadata.folder);
  const assetId = randomUUID();
  const isPrivate = Boolean(metadata.isPrivate);
  const assetRoute = appMediaRoute(assetId, MediaVariantType.FULL);

  try {
    const asset = await prisma.mediaAsset.create({
      data: {
        id: assetId,
        siteId: currentSiteId,
        driver: stored.driver,
        key: stored.key,
        storageProviderId: stored.storageProviderId || "",
        url: isPrivate ? assetRoute : stored.url || assetRoute,
        filename: file.name,
        mimeType: file.type || "application/octet-stream",
        sizeBytes: file.size,
        folder,
        tags: mediaTagsFromInput(metadata.tags),
        caption: metadata.caption?.trim() || "",
        credit: metadata.credit?.trim() || "",
        usageContext: metadata.usageContext?.trim() || "",
        focalPointX: boundedUnit(metadata.focalPointX),
        focalPointY: boundedUnit(metadata.focalPointY),
        alt: metadata.isDecorative ? "" : safeAlt,
        isDecorative: Boolean(metadata.isDecorative),
        isPrivate,
        uploadedByStaffId: metadata.uploadedByStaffId || undefined,
        variants: {
          create: variantRowsForAsset({
            driver: stored.driver,
            id: assetId,
            isPrivate,
            key: stored.key,
            storageProviderId: stored.storageProviderId || "",
            url: isPrivate ? assetRoute : stored.url || assetRoute
          }).map((row) => ({
            format: row.format,
            height: row.height,
            metadata: {
              ...(row.metadata as Record<string, unknown>),
              virusScan: scanResult
            },
            sizeBytes: row.sizeBytes,
            type: row.type,
            url: row.url,
            width: row.width
          }))
        }
      }
    });

    return asset;
  } catch (error) {
    if (adapter.delete) {
      await adapter.delete({ key: stored.key, storageProviderId: stored.storageProviderId || "" }).catch(() => {});
    }
    throw error;
  }
}

/**
 * Permanently removes a media asset — its stored object (via the driver's delete
 * hook) and its DB row (variants cascade). Use this to clean up orphaned uploads
 * that were never linked to a record (e.g. a form submission that failed
 * validation after files were already uploaded). Scoped by siteId when provided
 * so a caller can't delete another tenant's asset. Best-effort and never throws:
 * cleanup must not mask the original failure that triggered it.
 */
export async function deleteMediaAsset(assetId: string, siteId?: string) {
  try {
    const asset = await prisma.mediaAsset.findFirst({
      where: siteId ? { id: assetId, siteId } : { id: assetId },
      select: { id: true, driver: true, key: true, storageProviderId: true }
    });
    if (!asset) return;

    const adapter = getMediaAdapter(asset.driver);
    if (adapter.delete) {
      await adapter.delete({ key: asset.key, storageProviderId: asset.storageProviderId }).catch(() => {});
    }
    await prisma.mediaAsset.delete({ where: { id: asset.id } });
  } catch {
    // Swallow — orphan cleanup is best-effort and must not throw over the
    // original control flow (e.g. a validation redirect being re-raised).
  }
}

function absoluteUrl(pathOrUrl: string, request: NextRequest) {
  if (!pathOrUrl) return null;
  if (pathOrUrl.startsWith("/")) return new URL(pathOrUrl, request.nextUrl.origin);
  try {
    return new URL(pathOrUrl);
  } catch {
    return null;
  }
}

function configuredUrlHostname(value?: string) {
  if (!value) return "";
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function isAllowedMediaSourceUrl(url: URL, request: NextRequest) {
  if (url.origin === request.nextUrl.origin && !url.pathname.startsWith("/api/media/assets/")) return true;
  if (!isSafeExternalHttpsUrl(url.toString())) return false;

  const hostname = url.hostname.toLowerCase();
  const allowedHosts = new Set(
    [
      configuredUrlHostname(process.env.R2_PUBLIC_BASE_URL),
      configuredUrlHostname(process.env.S3_PUBLIC_BASE_URL),
      configuredUrlHostname(process.env.AWS_PUBLIC_BASE_URL),
      process.env.CLOUDFLARE_IMAGES_ACCOUNT_HASH ? "imagedelivery.net" : ""
    ].filter(Boolean)
  );

  return allowedHosts.has(hostname) || hostname.endsWith(".r2.cloudflarestorage.com") || hostname.endsWith(".cloudflarestorage.com");
}

async function objectStorageObjectResponse(driver: ObjectStorageDriver, asset: Pick<MediaAsset, "key" | "mimeType">) {
  const config = getObjectStorageConfig(driver);
  if (!isObjectStorageConfigured(config)) return null;

  const object = await getObjectStorageClient(config).send(
    new GetObjectCommand({
      Bucket: config.bucket,
      Key: asset.key
    })
  );

  if (!object.Body) return null;
  const body = "transformToWebStream" in object.Body ? object.Body.transformToWebStream() : (object.Body as BodyInit);

  return new Response(body, {
    headers: {
      "content-type": object.ContentType || asset.mimeType || "application/octet-stream"
    }
  });
}

async function serverAssetObjectResponse(asset: Pick<MediaAsset, "key" | "mimeType">) {
  try {
    const bytes = await readFile(serverAssetPath(asset.key));
    return new Response(new Uint8Array(bytes), {
      headers: {
        "content-type": asset.mimeType || "application/octet-stream"
      }
    });
  } catch {
    return null;
  }
}

async function safeObjectStorageObjectResponse(driver: ObjectStorageDriver, asset: Pick<MediaAsset, "key" | "mimeType">) {
  try {
    return await objectStorageObjectResponse(driver, asset);
  } catch {
    return null;
  }
}

function mediaVariantMetadata(value: unknown) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

function isTransformableImage(asset: Pick<MediaAsset, "mimeType">) {
  return allowedImageTypes.has(asset.mimeType) && asset.mimeType !== "image/gif";
}

function objectStorageVariantObjectKey(asset: Pick<MediaAsset, "key">, type: MediaVariantType) {
  const sourceKey = asset.key.replace(/\\/g, "/").replace(/[^A-Za-z0-9._/-]/g, "_").replace(/\.[^./]+$/, "");
  return `variants/${sourceKey}/${type.toLowerCase()}.webp`;
}

function serverAssetVariantObjectKey(asset: Pick<MediaAsset, "key">, type: MediaVariantType) {
  const sourceKey = asset.key.replace(/\\/g, "/").replace(/[^A-Za-z0-9._/-]/g, "_").replace(/\.[^./]+$/, "");
  return `variants/${sourceKey}/${type.toLowerCase()}.webp`;
}

function objectStorageVariantMetadataKey(driver: ObjectStorageDriver) {
  return driver === MediaDriver.S3 ? "s3Key" : "r2Key";
}

function objectStorageVariantGeneratedBy(driver: ObjectStorageDriver) {
  return driver === MediaDriver.S3 ? "sharp-s3" : "sharp-r2";
}

async function responseToBuffer(response: Response) {
  return Buffer.from(await response.arrayBuffer());
}

function transformFit(type: MediaVariantType) {
  const preset = mediaVariantPresets[type];
  if (preset.fit === "cover") {
    return {
      fit: "cover" as const,
      height: preset.height,
      position: "attention" as const,
      width: preset.width
    };
  }

  return {
    fit: "inside" as const,
    height: preset.height,
    withoutEnlargement: true,
    width: preset.width
  };
}

async function transformedObjectStorageVariantResponse(
  driver: ObjectStorageDriver,
  asset: Pick<MediaAsset, "id" | "isPrivate" | "key" | "mimeType">,
  type: MediaVariantType
) {
  if (!generatedImageVariantTypes.has(type) || !isTransformableImage(asset)) {
    return objectStorageObjectResponse(driver, asset);
  }

  const config = getObjectStorageConfig(driver);
  if (!isObjectStorageConfigured(config)) return null;
  const metadataKey = objectStorageVariantMetadataKey(driver);
  const generatedBy = objectStorageVariantGeneratedBy(driver);

  const existingVariant = await prisma.mediaAssetVariant.findUnique({
    where: {
      assetId_type: {
        assetId: asset.id,
        type
      }
    },
    select: { metadata: true }
  });
  const metadata = mediaVariantMetadata(existingVariant?.metadata);
  const existingKey = typeof metadata[metadataKey] === "string" ? metadata[metadataKey] : "";
  if (existingKey) {
    const existingResponse = await safeObjectStorageObjectResponse(driver, { key: existingKey, mimeType: generatedVariantContentType });
    if (existingResponse) return existingResponse;
  }

  const original = await objectStorageObjectResponse(driver, asset);
  if (!original?.ok || !original.body) return null;

  const sourceBytes = await responseToBuffer(original);
  const resized = await sharp(sourceBytes, { limitInputPixels: 80_000_000 })
    .rotate()
    .resize(transformFit(type))
    .webp({ effort: 4, quality: type === MediaVariantType.THUMBNAIL ? 72 : 82 })
    .toBuffer({ resolveWithObject: true });

  const variantKey = objectStorageVariantObjectKey(asset, type);
  await getObjectStorageClient(config).send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: variantKey,
      Body: resized.data,
      CacheControl: "public, max-age=31536000, immutable",
      ContentType: generatedVariantContentType,
      Metadata: {
        generatedBy,
        sourceKey: asset.key,
        variant: type
      }
    })
  );

  await prisma.mediaAssetVariant.upsert({
    where: {
      assetId_type: {
        assetId: asset.id,
        type
      }
    },
    create: {
      assetId: asset.id,
      format: "webp",
      height: resized.info.height || mediaVariantPresets[type].height,
      metadata: {
        contentType: generatedVariantContentType,
        fit: mediaVariantPresets[type].fit,
        generatedBy,
        [metadataKey]: variantKey,
        sourceKey: asset.key
      },
      sizeBytes: resized.data.byteLength,
      type,
      url: asset.isPrivate ? appMediaRoute(asset.id, type) : objectStoragePublicObjectUrl(config, variantKey) || appMediaRoute(asset.id, type),
      width: resized.info.width || mediaVariantPresets[type].width
    },
    update: {
      format: "webp",
      height: resized.info.height || mediaVariantPresets[type].height,
      metadata: {
        contentType: generatedVariantContentType,
        fit: mediaVariantPresets[type].fit,
        generatedBy,
        [metadataKey]: variantKey,
        sourceKey: asset.key
      },
      sizeBytes: resized.data.byteLength,
      url: asset.isPrivate ? appMediaRoute(asset.id, type) : objectStoragePublicObjectUrl(config, variantKey) || appMediaRoute(asset.id, type),
      width: resized.info.width || mediaVariantPresets[type].width
    }
  });

  return new Response(new Uint8Array(resized.data), {
    headers: {
      "content-type": generatedVariantContentType
    },
    status: 200
  });
}

async function transformedR2VariantResponse(
  asset: Pick<MediaAsset, "id" | "isPrivate" | "key" | "mimeType">,
  type: MediaVariantType
) {
  return transformedObjectStorageVariantResponse(MediaDriver.R2, asset, type);
}

async function transformedS3VariantResponse(
  asset: Pick<MediaAsset, "id" | "isPrivate" | "key" | "mimeType">,
  type: MediaVariantType
) {
  return transformedObjectStorageVariantResponse(MediaDriver.S3, asset, type);
}

async function transformedServerAssetVariantResponse(
  asset: Pick<MediaAsset, "id" | "isPrivate" | "key" | "mimeType">,
  type: MediaVariantType
) {
  if (!generatedImageVariantTypes.has(type) || !isTransformableImage(asset)) {
    return serverAssetObjectResponse(asset);
  }

  const existingVariant = await prisma.mediaAssetVariant.findUnique({
    where: {
      assetId_type: {
        assetId: asset.id,
        type
      }
    },
    select: { metadata: true }
  });
  const metadata = mediaVariantMetadata(existingVariant?.metadata);
  const existingKey = typeof metadata.serverAssetKey === "string" ? metadata.serverAssetKey : "";
  if (existingKey) {
    const existingResponse = await serverAssetObjectResponse({ key: existingKey, mimeType: generatedVariantContentType });
    if (existingResponse) return existingResponse;
  }

  let sourceBytes: Buffer;
  try {
    sourceBytes = await readFile(serverAssetPath(asset.key));
  } catch {
    return null;
  }

  const resized = await sharp(sourceBytes, { limitInputPixels: 80_000_000 })
    .rotate()
    .resize(transformFit(type))
    .webp({ effort: 4, quality: type === MediaVariantType.THUMBNAIL ? 72 : 82 })
    .toBuffer({ resolveWithObject: true });

  const variantKey = serverAssetVariantObjectKey(asset, type);
  const variantPath = serverAssetPath(variantKey);
  await mkdir(path.dirname(variantPath), { recursive: true });
  await writeFile(variantPath, resized.data);

  await prisma.mediaAssetVariant.upsert({
    where: {
      assetId_type: {
        assetId: asset.id,
        type
      }
    },
    create: {
      assetId: asset.id,
      format: "webp",
      height: resized.info.height || mediaVariantPresets[type].height,
      metadata: {
        contentType: generatedVariantContentType,
        fit: mediaVariantPresets[type].fit,
        generatedBy: "sharp-server-assets",
        serverAssetKey: variantKey,
        sourceKey: asset.key
      },
      sizeBytes: resized.data.byteLength,
      type,
      url: appMediaRoute(asset.id, type),
      width: resized.info.width || mediaVariantPresets[type].width
    },
    update: {
      format: "webp",
      height: resized.info.height || mediaVariantPresets[type].height,
      metadata: {
        contentType: generatedVariantContentType,
        fit: mediaVariantPresets[type].fit,
        generatedBy: "sharp-server-assets",
        serverAssetKey: variantKey,
        sourceKey: asset.key
      },
      sizeBytes: resized.data.byteLength,
      url: appMediaRoute(asset.id, type),
      width: resized.info.width || mediaVariantPresets[type].width
    }
  });

  return new Response(new Uint8Array(resized.data), {
    headers: {
      "content-type": generatedVariantContentType
    },
    status: 200
  });
}

export async function fetchMediaAssetSource(
  asset: Pick<MediaAsset, "driver" | "id" | "isPrivate" | "key" | "mimeType" | "storageProviderId" | "url">,
  request: NextRequest,
  type: MediaVariantType
) {
  if (asset.isPrivate && asset.driver !== MediaDriver.S3 && asset.driver !== MediaDriver.R2 && asset.driver !== MediaDriver.SERVER_ASSETS) {
    return null;
  }

  if (asset.driver === MediaDriver.SERVER_ASSETS && type !== MediaVariantType.DOWNLOAD) {
    return transformedServerAssetVariantResponse(asset, type);
  }

  if (asset.driver === MediaDriver.SERVER_ASSETS) {
    return serverAssetObjectResponse(asset);
  }

  if (asset.driver === MediaDriver.R2 && type !== MediaVariantType.DOWNLOAD) {
    return transformedR2VariantResponse(asset, type);
  }

  if (asset.driver === MediaDriver.S3 && type !== MediaVariantType.DOWNLOAD) {
    return transformedS3VariantResponse(asset, type);
  }

  if (asset.driver === MediaDriver.R2 && (asset.isPrivate || !asset.url || asset.url.startsWith("/api/media/assets/"))) {
    return objectStorageObjectResponse(MediaDriver.R2, asset);
  }

  if (asset.driver === MediaDriver.S3 && (asset.isPrivate || !asset.url || asset.url.startsWith("/api/media/assets/"))) {
    return objectStorageObjectResponse(MediaDriver.S3, asset);
  }

  const adapter = getMediaAdapter(asset.driver);
  const url = absoluteUrl(adapter.generateVariantUrl(asset, type) || asset.url, request);
  if (!url) return null;
  if (!isAllowedMediaSourceUrl(url, request)) return null;

  return fetch(url, { cache: "no-store" });
}

function safeFilename(value: string) {
  const filename = value.replace(/[^\w .-]/g, "_").trim().slice(0, 140);
  return filename || "media-asset";
}

function downloadFilename(filename: string, contentType: string, type: MediaVariantType) {
  const safe = safeFilename(filename);
  if (type === MediaVariantType.DOWNLOAD || !contentType.includes("webp")) return safe;

  const withoutExtension = safe.replace(/\.[^.]+$/, "");
  return `${withoutExtension || "media-asset"}.webp`;
}

export async function mediaDeliveryResponse({
  asset,
  download,
  privateAccess,
  request,
  type
}: {
  asset: Pick<MediaAsset, "deletedAt" | "driver" | "filename" | "id" | "isPrivate" | "key" | "mimeType" | "storageProviderId" | "url">;
  download?: boolean;
  privateAccess?: boolean;
  request: NextRequest;
  type: MediaVariantType;
}) {
  if (asset.deletedAt) return null;
  if (asset.isPrivate && !privateAccess) return null;

  const upstream = await fetchMediaAssetSource(asset, request, type);
  if (!upstream?.ok || !upstream.body) return null;

  const headers = new Headers();
  headers.set("cache-control", privateAccess || asset.isPrivate ? "private, no-store" : "public, max-age=300");
  const contentType = upstream.headers.get("content-type") || asset.mimeType || "application/octet-stream";
  headers.set("content-type", contentType);
  headers.set("x-media-variant", type);

  if (download) {
    headers.set("content-disposition", `attachment; filename="${downloadFilename(asset.filename, contentType, type)}"`);
  }

  return new Response(upstream.body, {
    headers,
    status: 200
  });
}
