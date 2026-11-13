import type { ServiceLibraryItem } from "@/lib/scheduling/service-library";
import { z } from "zod";
import { supportsPhotoCurrency } from "@/lib/portfolio/selection-policy";

export const clientGalleryUploadMaxBytes = 25 * 1024 * 1024;
export const clientGalleryUploadBatchMaxBytes = 250 * 1024 * 1024;
export const clientGalleryUploadBatchMaxFiles = 100;
export const clientGalleryUploadMaxPixels = 80_000_000;

// This is a bounded client queue; each server request still contains exactly one photo.
export function clientGalleryBatchError(files: readonly Pick<File, "size">[]) {
  if (files.length > clientGalleryUploadBatchMaxFiles) return "Choose at most 100 photos per batch.";
  if (files.reduce((total, file) => total + file.size, 0) > clientGalleryUploadBatchMaxBytes) return "A batch can contain at most 250 MiB. Choose fewer photos.";
  return "";
}
export const clientGalleryImageTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
export const clientGalleryPageSize = 24;

const id = z.string().trim().min(1).max(120);
const wholeNumber = z.string().trim().regex(/^\d+$/, "Enter a whole number.").transform(Number);

const packageGalleryCreateSchema = z.object({
  clientId: id,
  requestId: z.uuid(),
  title: z.string().trim().min(1, "Enter a shoot name.").max(160),
  description: z.string().trim().max(4000).default(""),
  sessionDate: z.iso.date().optional(),
  packageProductId: id,
  purchasedOrderId: id,
  selectionAllowance: wholeNumber.pipe(z.number().int().min(0).max(10000)),
  extraPhotoPrice: z.string().trim().regex(/^\d+(\.\d{1,2})?$/, "Enter the extra-photo price, including cents if needed.")
    .transform((value) => Math.round(Number(value) * 100)).pipe(z.number().int().min(0).max(2147483647)),
  selectionCurrency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "Enter a three-letter currency code.").refine(supportsPhotoCurrency, "Use a supported two-decimal currency, such as USD, EUR, or GBP.")
});

export const clientGalleryCreateSchema = z.union([
  packageGalleryCreateSchema.extend({ bookingId: id.optional() }),
  packageGalleryCreateSchema.pick({ clientId: true, requestId: true, title: true, description: true, sessionDate: true }).extend({ bookingId: id }).strict()
]);

export const clientGalleryTargetSchema = z.object({ clientId: id, galleryId: id });
export const clientGalleryAddSchema = clientGalleryTargetSchema.extend({ assetIds: z.array(id).min(1).max(100) });
export const clientGalleryBrowseSchema = clientGalleryTargetSchema.extend({
  query: z.string().trim().max(180).default(""),
  page: z.number().int().min(1).max(100000).default(1),
  folder: z.string().trim().max(200).default(""),
  mode: z.enum(["library", "gallery"]).default("library")
});

export type ClientGalleryPackage = {
  productId: string;
  orderId: string;
  name: string;
  orderNumber: string;
  allowance: number | null;
  extraPhotoPriceCents: number | null;
  currency: string;
};

export type ClientShootGallery = {
  id: string;
  bookingId: string | null;
  title: string;
  description: string;
  sessionDate: string;
  photoCount: number;
  imageStatus: ReturnType<typeof clientGalleryImageStatus>;
  selectionComplete?: boolean;
  photosSent?: boolean;
  packageName: string;
  extraPhotoAddOnId?: string | null;
  extraPhotoAddOnName?: string | null;
  extraPhotoAddOn?: ServiceLibraryItem | null;
  selectionAllowance: number | null;
  extraPhotoPriceCents: number | null;
  selectionCurrency: string | null;
  accessPath: string | null;
};

export type ClientGalleryPhoto = {
  id: string;
  filename: string;
  alt: string;
  folder: string;
  thumbnailUrl: string;
  previewUrl: string;
  downloadUrl: string;
  alreadyAdded: boolean;
};

export type ClientGalleryPhotoPage = {
  assets: ClientGalleryPhoto[];
  folders: string[];
  page: number;
  pageCount: number;
  total: number;
};

export type ClientGalleryWorkspace = {
  clientName: string;
  clientEmail: string;
  canSendEmail: boolean;
  galleries: ClientShootGallery[];
  sessions: Array<{ id: string; name: string; date: string; includedPhotos?: number }>;
  today: string;
  packages: ClientGalleryPackage[];
  canUpload: boolean;
  canManageMedia: boolean;
};

export type ClientGalleryResult<T> = { ok: true; data: T } | { ok: false; error: string };

export function clientSessionFolderName(title: string, sessionDate: string) {
  const [year, month, day] = sessionDate.split("-");
  return `${mediaFolderSegment(title)} ${month}-${day}-${year}`;
}

export function mediaFolderSegment(value: string) {
  return value.replace(/[\\/\u0000-\u001f\u007f]/g, "-").trim().slice(0, 60).trim().replace(/^\.+$/, "Session") || "Session";
}

export const clientPhotoProcessingTimeoutMs = 15 * 60 * 1000;

export function clientGalleryImageStatus(gallery: { processingUploads?: number; processingStartedAt?: Date | null; processingError?: string; photoCount: number }, now = Date.now()) {
  if (gallery.processingUploads) return gallery.processingStartedAt && now - gallery.processingStartedAt.getTime() > clientPhotoProcessingTimeoutMs ? "Needs attention" : "Images processing";
  if (gallery.processingError) return "Needs attention";
  return gallery.photoCount ? "Ready" : "Awaiting photos";
}

export function clientSessionPath(clientId: string, sessionId: string) {
  return `/admin/clients/${encodeURIComponent(clientId)}/sessions/${encodeURIComponent(sessionId)}`;
}

export function clientSessionRows(workspace: Pick<ClientGalleryWorkspace, "sessions" | "galleries">) {
  const sessions = workspace.sessions.map(session => {
    const galleries = workspace.galleries.filter(gallery => gallery.bookingId === session.id);
    const photoCount = galleries.reduce((count, gallery) => count + gallery.photoCount, 0);
    const imageStatus = galleries.some(gallery => gallery.imageStatus === "Images processing") ? "Images processing" : galleries.some(gallery => gallery.imageStatus === "Needs attention") ? "Needs attention" : galleries.length && galleries.every(gallery => gallery.selectionComplete && gallery.imageStatus === "Ready") ? "Complete" : galleries.some(gallery => gallery.photosSent && !gallery.selectionComplete && gallery.imageStatus === "Ready") ? "Awaiting Client" : photoCount ? "Ready" : "Awaiting photos";
    return { id: session.id, title: session.name, date: session.date, photoCount, imageStatus };
  });
  return [...sessions, ...workspace.galleries.filter(gallery => !workspace.sessions.some(session => session.id === gallery.bookingId)).map(gallery => ({
    id: gallery.id, title: gallery.title, date: gallery.sessionDate, photoCount: gallery.photoCount, imageStatus: gallery.imageStatus === "Ready" ? gallery.selectionComplete ? "Complete" : gallery.photosSent ? "Awaiting Client" : "Ready" : gallery.imageStatus
  }))];
}

export function clientSessionPhotoFilename(clientName: string, date: string, originalName: string, uniqueId: string) {
  const name = mediaFolderSegment(clientName).replace(/[<>:"|?*]/g, "-");
  const extension = originalName.match(/\.[a-z0-9]+$/i)?.[0].toLowerCase() || "";
  return `${name}-${date}-${uniqueId.replaceAll("-", "").slice(0, 12)}${extension}`;
}

export function clientGalleryLocalImageStatus(serverStatus: string | undefined, uploading: boolean, rows: readonly { status: string }[]) {
  if (uploading) return "Images processing";
  if (rows.some(row => row.status !== "done")) return "Needs attention";
  return serverStatus || "Awaiting photos";
}
