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

export const clientGalleryCreateSchema = z.object({
  clientId: id,
  requestId: z.uuid(),
  title: z.string().trim().min(1, "Enter a shoot name.").max(160),
  packageProductId: id,
  purchasedOrderId: id,
  selectionAllowance: wholeNumber.pipe(z.number().int().min(0).max(10000)),
  extraPhotoPrice: z.string().trim().regex(/^\d+(\.\d{1,2})?$/, "Enter the extra-photo price, including cents if needed.")
    .transform((value) => Math.round(Number(value) * 100)).pipe(z.number().int().min(0).max(2147483647)),
  selectionCurrency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "Enter a three-letter currency code.").refine(supportsPhotoCurrency, "Use a supported two-decimal currency, such as USD, EUR, or GBP.")
});

export const clientGalleryTargetSchema = z.object({ clientId: id, galleryId: id });
export const clientGalleryAddSchema = clientGalleryTargetSchema.extend({ assetIds: z.array(id).min(1).max(100) });
export const clientGalleryBrowseSchema = clientGalleryTargetSchema.extend({
  query: z.string().trim().max(180).default(""),
  page: z.number().int().min(1).max(100000).default(1),
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
  title: string;
  photoCount: number;
  packageName: string;
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
  alreadyAdded: boolean;
};

export type ClientGalleryPhotoPage = {
  assets: ClientGalleryPhoto[];
  page: number;
  pageCount: number;
  total: number;
};

export type ClientGalleryWorkspace = {
  galleries: ClientShootGallery[];
  packages: ClientGalleryPackage[];
  canUpload: boolean;
  canManageMedia: boolean;
};

export type ClientGalleryResult<T> = { ok: true; data: T } | { ok: false; error: string };
