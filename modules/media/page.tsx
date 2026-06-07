import NextImage from "next/image";
import { ImagePlus, Star } from "lucide-react";
import { isR2Configured } from "@/lib/media";
import { prisma } from "@/lib/prisma";
import { getSiteSettings } from "@/lib/site";
import { setHeroImageAction, uploadMediaAction } from "./actions";

export const dynamic = "force-dynamic";

const repoAssets = [
  {
    filename: "hero.svg",
    url: "/hero.svg",
    alt: "Neutral admin template hero"
  }
];
const pageSize = 24;

type MediaPageProps = {
  searchParams: Promise<{ saved?: string; error?: string; page?: string }>;
};

export default async function MediaPage({ searchParams }: MediaPageProps) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page || 1) || 1);
  const [settings, mediaAssets, assetCount] = await Promise.all([
    getSiteSettings(),
    prisma.mediaAsset.findMany({
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize
    }),
    prisma.mediaAsset.count()
  ]);
  const pageCount = Math.max(1, Math.ceil(assetCount / pageSize));
  const errorMessage = params.error === "missing-file" ? "Choose a file before uploading." : params.error;

  const canUpload = settings.mediaDriver === "R2" && isR2Configured();

  return (
    <div className="stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">Media</p>
          <h1 style={{ fontSize: "2.4rem" }}>Images and assets</h1>
          <p>Repo assets stay simple; R2 uploads turn on when this client needs editable media.</p>
        </div>
      </header>

      {params.saved ? <div className="success-message">Media changes saved.</div> : null}
      {errorMessage ? <div className="error">{decodeURIComponent(errorMessage)}</div> : null}

      <section className="grid-2">
        <form action={uploadMediaAction} className="card form-grid">
          <h2 style={{ fontSize: "1.35rem" }}>Upload to R2</h2>
          <p className="lead" style={{ fontSize: "0.95rem" }}>
            Current media mode: <strong>{settings.mediaDriver}</strong>. Uploads require the R2 env vars in `.env`.
          </p>
          <div className="field">
            <label htmlFor="file">Image file</label>
            <input id="file" name="file" type="file" accept="image/*" disabled={!canUpload} />
          </div>
          <div className="field">
            <label htmlFor="alt">Alt text</label>
            <input id="alt" name="alt" disabled={!canUpload} required />
          </div>
          <button className="button" type="submit" disabled={!canUpload}>
            <ImagePlus size={18} />
            Upload image
          </button>
          {!canUpload ? (
            <p className="lead" style={{ fontSize: "0.9rem" }}>
              Switch media mode to R2 in Settings and add R2 credentials to enable uploads.
            </p>
          ) : null}
        </form>

        <div className="card">
          <h2 style={{ fontSize: "1.35rem" }}>Repo assets</h2>
          <div className="stack">
            {repoAssets.map((asset) => (
              <div key={asset.url} className="asset-tile">
                <NextImage src={asset.url} alt={asset.alt} width={500} height={375} unoptimized />
                <div className="page-header" style={{ marginBottom: 0, marginTop: 12 }}>
                  <span>{asset.filename}</span>
                  <form action={setHeroImageAction}>
                    <input type="hidden" name="url" value={asset.url} />
                    <button className="button secondary" type="submit">
                      <Star size={16} />
                      Use hero
                    </button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="card">
        <div className="page-header" style={{ marginBottom: 16 }}>
          <div>
            <h2 style={{ fontSize: "1.35rem" }}>Uploaded assets</h2>
            <p style={{ color: "var(--muted)", margin: 0 }}>{assetCount} uploaded assets</p>
          </div>
        </div>
        <div className="grid-3">
          {mediaAssets.map((asset) => (
            <div key={asset.id} className="asset-tile">
              <NextImage src={asset.url} alt={asset.alt || asset.filename} width={500} height={375} unoptimized />
              <div className="page-header" style={{ marginBottom: 0, marginTop: 12 }}>
                <span>{asset.filename}</span>
                <form action={setHeroImageAction}>
                  <input type="hidden" name="url" value={asset.url} />
                  <button className="button secondary" type="submit">
                    <Star size={16} />
                    Use hero
                  </button>
                </form>
              </div>
            </div>
          ))}
          {!mediaAssets.length ? <p>No uploaded media yet.</p> : null}
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
          <a className="button secondary" href={`/admin/modules/media?page=${Math.max(1, page - 1)}`} aria-disabled={page <= 1}>
            Previous
          </a>
          <span className="pill">
            Page {Math.min(page, pageCount)} of {pageCount}
          </span>
          <a className="button secondary" href={`/admin/modules/media?page=${Math.min(pageCount, page + 1)}`} aria-disabled={page >= pageCount}>
            Next
          </a>
        </div>
      </section>
    </div>
  );
}
