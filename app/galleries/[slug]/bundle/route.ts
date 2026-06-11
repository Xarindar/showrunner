import { createReadStream } from "node:fs";
import { mkdtemp, open, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MediaVariantType, PortfolioGalleryStatus, PortfolioGalleryVisibility } from "@prisma/client";
import { NextRequest } from "next/server";
import { mediaDeliveryResponse } from "@/lib/media";
import { findActiveGalleryAccess } from "@/lib/portfolio/access";
import { prisma } from "@/lib/prisma";
import { publicRateLimitMessage } from "@/lib/public-rate-limit";
import { getSiteSettings } from "@/lib/site";

type GalleryBundleRouteProps = {
  params: Promise<{ slug: string }>;
};

const maxBundleItems = 60;
const maxBundleBytes = 220 * 1024 * 1024;
const crcTable = new Uint32Array(256).map((_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function notFound() {
  return new Response("Not found", { status: 404 });
}

function safeZipName(value: string, fallback: string) {
  const normalized = value
    .normalize("NFKD")
    .replace(/[^\w .-]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  return normalized || fallback;
}

function extensionFromContentType(contentType: string) {
  if (contentType.includes("jpeg") || contentType.includes("jpg")) return ".jpg";
  if (contentType.includes("png")) return ".png";
  if (contentType.includes("webp")) return ".webp";
  if (contentType.includes("gif")) return ".gif";
  if (contentType.includes("pdf")) return ".pdf";
  return "";
}

function crc32(buffer: Buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function crc32Update(crc: number, chunk: Uint8Array) {
  let next = crc;
  for (const byte of chunk) {
    next = crcTable[(next ^ byte) & 0xff] ^ (next >>> 8);
  }
  return next >>> 0;
}

function dosDateTime(date = new Date()) {
  const year = Math.max(1980, date.getFullYear());
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { dosDate, dosTime };
}

function localFileHeader(input: { crc: number; dataSize: number; name: Buffer }) {
  const { dosDate, dosTime } = dosDateTime();
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0, 6);
  header.writeUInt16LE(0, 8);
  header.writeUInt16LE(dosTime, 10);
  header.writeUInt16LE(dosDate, 12);
  header.writeUInt32LE(input.crc, 14);
  header.writeUInt32LE(input.dataSize, 18);
  header.writeUInt32LE(input.dataSize, 22);
  header.writeUInt16LE(input.name.length, 26);
  header.writeUInt16LE(0, 28);
  return Buffer.concat([header, input.name]);
}

function centralDirectoryHeader(input: { crc: number; dataSize: number; name: Buffer; offset: number }) {
  const { dosDate, dosTime } = dosDateTime();
  const header = Buffer.alloc(46);
  header.writeUInt32LE(0x02014b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(20, 6);
  header.writeUInt16LE(0, 8);
  header.writeUInt16LE(0, 10);
  header.writeUInt16LE(dosTime, 12);
  header.writeUInt16LE(dosDate, 14);
  header.writeUInt32LE(input.crc, 16);
  header.writeUInt32LE(input.dataSize, 20);
  header.writeUInt32LE(input.dataSize, 24);
  header.writeUInt16LE(input.name.length, 28);
  header.writeUInt16LE(0, 30);
  header.writeUInt16LE(0, 32);
  header.writeUInt16LE(0, 34);
  header.writeUInt16LE(0, 36);
  header.writeUInt32LE(0, 38);
  header.writeUInt32LE(input.offset, 42);
  return Buffer.concat([header, input.name]);
}

function endOfCentralDirectory(input: { centralSize: number; centralOffset: number; fileCount: number }) {
  const footer = Buffer.alloc(22);
  footer.writeUInt32LE(0x06054b50, 0);
  footer.writeUInt16LE(0, 4);
  footer.writeUInt16LE(0, 6);
  footer.writeUInt16LE(input.fileCount, 8);
  footer.writeUInt16LE(input.fileCount, 10);
  footer.writeUInt32LE(input.centralSize, 12);
  footer.writeUInt32LE(input.centralOffset, 16);
  footer.writeUInt16LE(0, 20);
  return footer;
}

type PreparedBundleFile = {
  caption: string;
  crc: number;
  licenseNotes: string;
  name: string;
  size: number;
  stagedPath?: string;
  title: string;
  data?: Buffer;
};

async function stageResponseToFile(response: Response, filePath: string) {
  if (!response.body) return null;

  const fileHandle = await open(filePath, "w");
  const reader = response.body.getReader();
  let size = 0;
  let crc = 0xffffffff;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value?.byteLength) continue;
      size += value.byteLength;
      crc = crc32Update(crc, value);
      await fileHandle.write(value);
    }
  } finally {
    reader.releaseLock();
    await fileHandle.close();
  }

  return {
    crc: (crc ^ 0xffffffff) >>> 0,
    size
  };
}

function createZipStream(files: PreparedBundleFile[], cleanup: () => Promise<void>) {
  let cleanedUp = false;
  const cleanupOnce = async () => {
    if (cleanedUp) return;
    cleanedUp = true;
    await cleanup();
  };

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const centralParts: Buffer[] = [];
      let offset = 0;

      try {
        for (const file of files) {
          const name = Buffer.from(file.name, "utf8");
          const local = localFileHeader({ crc: file.crc, dataSize: file.size, name });
          controller.enqueue(local);

          if (file.data) {
            controller.enqueue(file.data);
          } else if (file.stagedPath) {
            for await (const chunk of createReadStream(file.stagedPath)) {
              controller.enqueue(chunk instanceof Buffer ? chunk : Buffer.from(chunk));
            }
          }

          centralParts.push(centralDirectoryHeader({ crc: file.crc, dataSize: file.size, name, offset }));
          offset += local.length + file.size;
        }

        const centralOffset = offset;
        const central = Buffer.concat(centralParts);
        controller.enqueue(central);
        controller.enqueue(endOfCentralDirectory({ centralOffset, centralSize: central.length, fileCount: files.length }));
        controller.close();
      } catch (error) {
        controller.error(error);
      } finally {
        await cleanupOnce();
      }
    },
    async cancel() {
      await cleanupOnce();
    }
  });
}

export async function GET(request: NextRequest, { params }: GalleryBundleRouteProps) {
  const settings = await getSiteSettings();
  if (!settings.enabledModuleIds.includes("portfolio")) return notFound();

  const { slug } = await params;
  const gallery = await prisma.portfolioGallery.findFirst({
    where: {
      siteId: settings.siteId,
      slug,
      status: PortfolioGalleryStatus.PUBLISHED,
      downloadEnabled: true
    },
    include: {
      items: {
        where: {
          isDownloadable: true,
          mediaAssetId: { not: null }
        },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        take: maxBundleItems
      }
    }
  });

  if (!gallery) return notFound();

  const accessToken = request.nextUrl.searchParams.get("access") || request.nextUrl.searchParams.get("token") || "";
  const access = accessToken ? await findActiveGalleryAccess(accessToken, gallery.id, settings.siteId) : null;
  if (gallery.visibility !== PortfolioGalleryVisibility.PUBLIC && !access) return notFound();
  if (!gallery.items.length) return new Response("No downloadable media-backed items.", { status: 404 });

  if (gallery.visibility === PortfolioGalleryVisibility.PUBLIC) {
    const rateLimitMessage = await publicRateLimitMessage(`gallery_bundle:${gallery.id}`, {
      limit: 4,
      windowMinutes: 10
    });
    if (rateLimitMessage) {
      return new Response(rateLimitMessage, { status: 429 });
    }
  }

  const mediaIds = gallery.items.map((item) => item.mediaAssetId).filter((id): id is string => Boolean(id));
  const assets = await prisma.mediaAsset.findMany({
    where: { id: { in: mediaIds }, siteId: settings.siteId },
    select: {
      deletedAt: true,
      driver: true,
      filename: true,
      id: true,
      isPrivate: true,
      key: true,
      mimeType: true,
      storageProviderId: true,
      url: true
    }
  });
  const assetById = new Map(assets.map((asset) => [asset.id, asset]));
  const usedNames = new Set<string>();
  const files: PreparedBundleFile[] = [];
  let totalBytes = 0;
  let bundleTempDir: string | null = null;
  const cleanupBundleTempDir = async () => {
    if (!bundleTempDir) return;
    const tempDir = bundleTempDir;
    bundleTempDir = null;
    await rm(tempDir, { force: true, recursive: true });
  };

  try {
    for (const [index, item] of gallery.items.entries()) {
      const asset = item.mediaAssetId ? assetById.get(item.mediaAssetId) : null;
      if (!asset || asset.deletedAt) continue;
      if (asset.isPrivate && !access) continue;

      const response = await mediaDeliveryResponse({
        asset,
        download: true,
        privateAccess: Boolean(access),
        request,
        type: MediaVariantType.DOWNLOAD
      });
      if (!response?.ok) continue;

      if (!bundleTempDir) {
        bundleTempDir = await mkdtemp(join(tmpdir(), "gallery-bundle-"));
      }
      const stagedPath = join(bundleTempDir, `${String(index + 1).padStart(2, "0")}-${asset.id}.bin`);
      const stagedFile = await stageResponseToFile(response, stagedPath);
      if (!stagedFile) continue;
      totalBytes += stagedFile.size;
      if (totalBytes > maxBundleBytes) {
        await cleanupBundleTempDir();
        return new Response("Gallery bundle is too large. Download individual files instead.", { status: 413 });
      }

      const extension = extensionFromContentType(response.headers.get("content-type") || asset.mimeType);
      const baseName = safeZipName(item.title || asset.filename || `image-${index + 1}`, `image-${index + 1}`);
      let fileName = `${String(index + 1).padStart(2, "0")}-${baseName}${baseName.toLowerCase().endsWith(extension) ? "" : extension}`;
      let dedupe = 2;
      while (usedNames.has(fileName)) {
        fileName = `${String(index + 1).padStart(2, "0")}-${baseName}-${dedupe}${extension}`;
        dedupe += 1;
      }
      usedNames.add(fileName);
      files.push({
        caption: item.caption,
        crc: stagedFile.crc,
        licenseNotes: item.licenseNotes,
        name: fileName,
        size: stagedFile.size,
        stagedPath,
        title: item.title
      });
    }

    if (!files.length) {
      await cleanupBundleTempDir();
      return new Response("No downloadable files are available.", { status: 404 });
    }

    const manifest = Buffer.from(
      [
        "filename,title,caption,licenseNotes",
        ...files.map((file) => [file.name, file.title, file.caption, file.licenseNotes].map((value) => `"${String(value || "").replaceAll('"', '""')}"`).join(","))
      ].join("\n")
    );
    files.push({
      caption: "",
      crc: crc32(manifest),
      data: manifest,
      licenseNotes: "",
      name: "manifest.csv",
      size: manifest.length,
      title: "Delivery manifest"
    });

    const headers = new Headers({
      "cache-control": access || gallery.visibility !== PortfolioGalleryVisibility.PUBLIC ? "private, no-store" : "public, max-age=120",
      "content-disposition": `attachment; filename="${safeZipName(gallery.slug, "gallery")}-delivery.zip"`,
      "content-type": "application/zip",
      "x-gallery-bundle-items": String(files.length - 1)
    });

    return new Response(createZipStream(files, cleanupBundleTempDir), { headers });
  } catch (error) {
    await cleanupBundleTempDir();
    throw error;
  }
}
