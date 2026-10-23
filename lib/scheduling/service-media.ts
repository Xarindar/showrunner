import { z } from "zod";
import { imageFramingSchema } from "../../modules/content/studio/image-framing";

const photoSchema = z.object({ assetId: z.string().min(1).max(200).nullable(), framing: imageFramingSchema });

export const serviceMediaSchema = z.object({
  square: photoSchema.nullable(),
  rectangular: photoSchema.nullable(),
  gallery: z.array(z.string().min(1).max(200)).max(50, "Keep up to 50 additional images per service.")
});

export type ServiceMediaInput = z.infer<typeof serviceMediaSchema>;

export function serviceMediaAssetIds(media: ServiceMediaInput) {
  return [...new Set([media.square?.assetId, media.rectangular?.assetId, ...media.gallery].filter((id): id is string => Boolean(id)))];
}
