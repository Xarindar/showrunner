import { z } from "zod";

export type ImageFraming = { imagePositionX: number; imagePositionY: number; imageZoom: number };
export const centeredFraming: ImageFraming = { imagePositionX: 50, imagePositionY: 50, imageZoom: 1 };

export function cropFrame(imageRatio: number, viewportRatio: number, framing: ImageFraming) {
  const width = Math.min(1, viewportRatio / imageRatio) / framing.imageZoom;
  const height = Math.min(1, imageRatio / viewportRatio) / framing.imageZoom;
  return { width, height, left: (1 - width) * framing.imagePositionX / 100, top: (1 - height) * framing.imagePositionY / 100 };
}

export function moveFrame(framing: ImageFraming, frame: ReturnType<typeof cropFrame>, dx: number, dy: number): ImageFraming {
  const clamp = (value: number) => Math.max(0, Math.min(100, value));
  return { ...framing,
    imagePositionX: frame.width < 1 ? clamp(framing.imagePositionX + dx / (1 - frame.width) * 100) : framing.imagePositionX,
    imagePositionY: frame.height < 1 ? clamp(framing.imagePositionY + dy / (1 - frame.height) * 100) : framing.imagePositionY,
  };
}

export const imageFramingSchema = z.object({ imagePositionX: z.number().min(0).max(100), imagePositionY: z.number().min(0).max(100), imageZoom: z.number().min(1).max(3) });
export function readImageFraming(value: unknown): ImageFraming {
  const parsed = imageFramingSchema.safeParse(value);
  return parsed.success ? parsed.data : { ...centeredFraming };
}

export function framingImageSource(source: string) {
  if (!source) return source;
  const url = new URL(source, "https://image.invalid");
  if (!/^\/api\/media\/assets\/[^/]+$/.test(url.pathname) || url.searchParams.has("signature")) return source;
  url.searchParams.set("variant", "FULL");
  return url.origin === "https://image.invalid" ? `${url.pathname}${url.search}` : url.href;
}
