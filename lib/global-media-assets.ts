export type GlobalMediaAsset = {
  alt: string;
  caption: string;
  credit: string;
  filename: string;
  height: number;
  id: string;
  mimeType: string;
  tags: string[];
  thumbnailUrl: string;
  url: string;
  width: number;
};

/** App-owned media that can be reused without a storage provider or database record. */
export const globalMediaAssets: GlobalMediaAsset[] = [
  {
    alt: "Neutral admin template hero",
    caption: "A reusable neutral hero illustration included with Showrunner.",
    credit: "Showrunner",
    filename: "hero.svg",
    height: 1000,
    id: "global:hero-svg",
    mimeType: "image/svg+xml",
    tags: ["built-in", "hero"],
    thumbnailUrl: "/hero.svg",
    url: "/hero.svg",
    width: 1400
  }
];
