import { createHash } from "node:crypto";
import sharp from "sharp";

// Increment when the rendering policy changes. Proofs never share the ordinary
// MediaAssetVariant cache, which can contain clean, full-resolution derivatives.
export const galleryProofVersion = "burned-proof-v1";
export const galleryProofMaxEdge = 1400;

// Embedded vector lettering keeps the watermark present on minimal server
// images too; no installed font or network font lookup is required.
const watermarkGlyphs: Record<string, string> = {
  C: "M5 0H1L0 1V6L1 7H5", L: "M0 0V7H5", I: "M0 0H4M2 0V7M0 7H4",
  E: "M5 0H0V7H5M0 3.5H4", N: "M0 7V0L5 7V0", T: "M0 0H6M3 0V7",
  P: "M0 7V0H4L5 1V3L4 4H0", R: "M0 7V0H4L5 1V3L4 4H0M2.5 4L5 7",
  O: "M1 0H4L5 1V6L4 7H1L0 6V1Z", F: "M0 7V0H5M0 3.5H4"
};
const watermarkPaths = [..."CLIENT PROOF"].map((letter, index) => letter === " " ? "" : `<path transform="translate(${index * 7} 0)" d="${watermarkGlyphs[letter]}"/>`).join("");

export function galleryProofObjectKey(asset: { id: string; key: string }, size: "thumbnail" | "preview") {
  const source = createHash("sha256").update(`${asset.id}\0${asset.key}`).digest("hex");
  return `private/proofs/${galleryProofVersion}/${source}/${size}.webp`;
}

/** Rasterizes a visible, repeated watermark and strips source metadata. */
export async function renderGalleryProof(source: Buffer, size: "thumbnail" | "preview" = "preview") {
  const image = sharp(source, { animated: false, limitInputPixels: 80_000_000 });
  const metadata = await image.metadata();
  if (!metadata.width || !metadata.height || !["jpeg", "png", "webp", "gif", "svg"].includes(metadata.format || "")) {
    throw new Error("This file cannot be rendered as a safe image proof.");
  }

  // Even a small original is reduced; EXIF orientation is applied before resize.
  const sourceEdge = Math.max(metadata.width, metadata.height);
  const edge = Math.max(1, Math.min(size === "thumbnail" ? 420 : galleryProofMaxEdge, Math.floor(sourceEdge * 0.75)));
  const resized = await image.rotate().resize({ width: edge, height: edge, fit: "inside", withoutEnlargement: true }).png().toBuffer({ resolveWithObject: true });
  const { width, height } = resized.info;
  const fontSize = Math.max(12, Math.round(Math.min(width, height) / 15));
  const scale = fontSize / 7;
  const tileWidth = fontSize * 14;
  const tileHeight = fontSize * 5;
  const overlay = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <defs><pattern id="proof" width="${tileWidth}" height="${tileHeight}" patternUnits="userSpaceOnUse" patternTransform="rotate(-24)">
      <g transform="translate(${fontSize} ${fontSize}) scale(${scale})" fill="none" stroke-linejoin="round" stroke-linecap="round">
        <g stroke="black" stroke-opacity="0.35" stroke-width="1.4">${watermarkPaths}</g>
        <g stroke="white" stroke-opacity="0.6" stroke-width="0.65">${watermarkPaths}</g>
      </g>
    </pattern></defs><rect width="100%" height="100%" fill="url(#proof)"/>
    <rect x="0" y="${Math.max(0, height - fontSize * 2.4)}" width="100%" height="${fontSize * 2.4}" fill="black" fill-opacity="0.42"/>
    <g transform="translate(${(width - 82 * scale) / 2} ${height - fontSize * 1.75}) scale(${scale})" fill="none" stroke="white" stroke-width="0.65" stroke-linecap="round" stroke-linejoin="round">${watermarkPaths}</g>
  </svg>`);

  return sharp(resized.data).composite([{ input: overlay }]).webp({ quality: 70, effort: 4 }).toBuffer({ resolveWithObject: true });
}
