import NextImage from "next/image";
import { Archive, Folder, ImagePlus, RotateCcw, Star, Tag } from "lucide-react";
import { MediaDriver, MediaVariantType, type Prisma } from "@prisma/client";
import { getAccessibleMediaWhere, requireAdmin } from "@/lib/auth";
import { nonEmptyStringArrayFromUnknown, stringArrayCsv } from "@/lib/format";
import { isCloudflareImagesConfigured, isR2Configured, mediaAssetDisplayUrl } from "@/lib/media";
import { prisma } from "@/lib/prisma";
import { getSiteSettings } from "@/lib/site";
import {
  archiveMediaAssetAction,
  restoreMediaAssetAction,
  setHeroImageAction,
  updateMediaAssetAction,
  uploadMediaAction
} from "./actions";

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

function fileSizeLabel(bytes: number) {
  if (!bytes) return "Unknown size";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function canUploadWithDriver(driver: MediaDriver) {
  if (driver === MediaDriver.R2) return isR2Configured();
  if (driver === MediaDriver.CLOUDFLARE_IMAGES) return isCloudflareImagesConfigured();
  return false;
}

export default async function MediaPage({ searchParams }: MediaPageProps) {
  const user = await requireAdmin("media:manage");
  const params = await searchParams;
  const settings = await getSiteSettings();
  const page = Math.max(1, Number(params.page || 1) || 1);
  const activeMediaWhere: Prisma.MediaAssetWhereInput = await getAccessibleMediaWhere(user, settings.siteId, { deletedAt: null });
  const archivedMediaWhere: Prisma.MediaAssetWhereInput = await getAccessibleMediaWhere(user, settings.siteId, { deletedAt: { not: null } });
  const [mediaAssets, assetCount, archivedAssets, archivedCount, folderGroups] = await Promise.all([
    prisma.mediaAsset.findMany({
      where: activeMediaWhere,
      include: { variants: { orderBy: { type: "asc" } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize
    }),
    prisma.mediaAsset.count({ where: activeMediaWhere }),
    prisma.mediaAsset.findMany({
      where: archivedMediaWhere,
      orderBy: { deletedAt: "desc" },
      take: 8
    }),
    prisma.mediaAsset.count({ where: archivedMediaWhere }),
    prisma.mediaAsset.groupBy({
      by: ["folder"],
      where: activeMediaWhere,
      _count: { _all: true },
      orderBy: { folder: "asc" },
      take: 8
    })
  ]);
  const pageCount = Math.max(1, Math.ceil(assetCount / pageSize));
  const errorMessage = params.error === "missing-file" ? "Choose a file before uploading." : params.error;

  const canUpload = canUploadWithDriver(settings.mediaDriver);

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
            Current media mode: <strong>{settings.mediaDriver}</strong>. Uploads require the matching storage env vars in `.env`.
          </p>
          <div className="field">
            <label htmlFor="file">Image file</label>
            <input id="file" name="file" type="file" accept="image/*" disabled={!canUpload} />
          </div>
          <div className="field">
            <label htmlFor="alt">Alt text</label>
            <input id="alt" name="alt" disabled={!canUpload} />
          </div>
          <label style={{ alignItems: "center", display: "flex", gap: 8 }}>
            <input name="isDecorative" type="checkbox" disabled={!canUpload} />
            Decorative image
          </label>
          <div className="grid-2">
            <div className="field">
              <label htmlFor="folder">Folder</label>
              <input id="folder" name="folder" placeholder="portraits/spring" disabled={!canUpload} />
            </div>
            <div className="field">
              <label htmlFor="tags">Tags</label>
              <input id="tags" name="tags" placeholder="hero, portrait, proofing" disabled={!canUpload} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="caption">Caption</label>
            <input id="caption" name="caption" disabled={!canUpload} />
          </div>
          <div className="field">
            <label htmlFor="credit">Credit</label>
            <input id="credit" name="credit" disabled={!canUpload} />
          </div>
          <div className="field">
            <label htmlFor="usageContext">Usage context</label>
            <input id="usageContext" name="usageContext" placeholder="homepage, proofing, product" disabled={!canUpload} />
          </div>
          <div className="grid-2">
            <div className="field">
              <label htmlFor="focalPointX">Focal X</label>
              <input id="focalPointX" name="focalPointX" defaultValue="0.5" inputMode="decimal" disabled={!canUpload} />
            </div>
            <div className="field">
              <label htmlFor="focalPointY">Focal Y</label>
              <input id="focalPointY" name="focalPointY" defaultValue="0.5" inputMode="decimal" disabled={!canUpload} />
            </div>
          </div>
          <label style={{ alignItems: "center", display: "flex", gap: 8 }}>
            <input name="isPrivate" type="checkbox" disabled={!canUpload} />
            Private delivery asset
          </label>
          <button className="button" type="submit" disabled={!canUpload}>
            <ImagePlus size={18} />
            Upload image
          </button>
          {!canUpload ? (
            <p className="lead" style={{ fontSize: "0.9rem" }}>
              Switch media mode to R2 or Cloudflare Images in Settings and add credentials to enable uploads.
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
            <p style={{ color: "var(--muted)", margin: 0 }}>
              {assetCount} active assets {archivedCount ? `- ${archivedCount} archived` : ""}
            </p>
          </div>
        </div>
        {folderGroups.length ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
            {folderGroups.map((folder) => (
              <span className="pill" key={folder.folder || "root"}>
                <Folder size={14} />
                {folder.folder || "root"} ({folder._count._all})
              </span>
            ))}
          </div>
        ) : null}
        <div className="grid-3">
          {mediaAssets.map((asset) => (
            <div key={asset.id} className="asset-tile">
              <NextImage
                src={mediaAssetDisplayUrl(asset, MediaVariantType.CARD)}
                alt={asset.isDecorative ? "" : asset.alt || asset.filename}
                width={500}
                height={375}
                unoptimized
              />
              <div style={{ display: "grid", gap: 8 }}>
                <strong>{asset.filename}</strong>
                <span style={{ color: "var(--muted)" }}>
                  {asset.mimeType || "image"} - {fileSizeLabel(asset.sizeBytes)} - {asset.driver}
                </span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {asset.folder ? (
                    <span className="pill">
                      <Folder size={14} />
                      {asset.folder}
                    </span>
                  ) : null}
                  {asset.isPrivate ? <span className="pill danger">private</span> : null}
                  {asset.isDecorative ? <span className="pill">decorative</span> : null}
                  {asset.usageContext ? <span className="pill">{asset.usageContext}</span> : null}
                  {nonEmptyStringArrayFromUnknown(asset.tags).map((tag) => (
                    <span className="pill" key={tag}>
                      <Tag size={14} />
                      {tag}
                    </span>
                  ))}
                </div>
                {asset.caption || asset.credit ? (
                  <p style={{ color: "var(--muted)", margin: 0 }}>
                    {asset.caption}
                    {asset.caption && asset.credit ? " - " : ""}
                    {asset.credit}
                  </p>
                ) : null}
                <span style={{ color: "var(--muted)" }}>
                  Focal point {asset.focalPointX.toFixed(2)}, {asset.focalPointY.toFixed(2)} - {asset.variants.length} variants
                </span>
              </div>
              {!asset.isPrivate ? (
                <div className="page-header" style={{ marginBottom: 0, marginTop: 0, minHeight: 0 }}>
                <form action={setHeroImageAction}>
                  <input type="hidden" name="url" value={mediaAssetDisplayUrl(asset, MediaVariantType.HERO)} />
                  <button className="button secondary" type="submit">
                    <Star size={16} />
                    Use hero
                  </button>
                </form>
                </div>
              ) : null}
              <details className="subpanel">
                <summary>Edit metadata</summary>
                <form action={updateMediaAssetAction} className="form-grid" style={{ marginTop: 12 }}>
                  <input type="hidden" name="id" value={asset.id} />
                  <div className="field">
                    <label htmlFor={`asset-${asset.id}-alt`}>Alt text</label>
                    <input id={`asset-${asset.id}-alt`} name="alt" defaultValue={asset.alt || ""} />
                  </div>
                  <div className="grid-2">
                    <div className="field">
                      <label htmlFor={`asset-${asset.id}-folder`}>Folder</label>
                      <input id={`asset-${asset.id}-folder`} name="folder" defaultValue={asset.folder} />
                    </div>
                    <div className="field">
                      <label htmlFor={`asset-${asset.id}-tags`}>Tags</label>
                      <input id={`asset-${asset.id}-tags`} name="tags" defaultValue={stringArrayCsv(asset.tags)} />
                    </div>
                  </div>
                  <div className="field">
                    <label htmlFor={`asset-${asset.id}-caption`}>Caption</label>
                    <input id={`asset-${asset.id}-caption`} name="caption" defaultValue={asset.caption} />
                  </div>
                  <div className="field">
                    <label htmlFor={`asset-${asset.id}-credit`}>Credit</label>
                    <input id={`asset-${asset.id}-credit`} name="credit" defaultValue={asset.credit} />
                  </div>
                  <div className="field">
                    <label htmlFor={`asset-${asset.id}-usageContext`}>Usage context</label>
                    <input id={`asset-${asset.id}-usageContext`} name="usageContext" defaultValue={asset.usageContext} />
                  </div>
                  <div className="grid-2">
                    <div className="field">
                      <label htmlFor={`asset-${asset.id}-focalPointX`}>Focal X</label>
                      <input id={`asset-${asset.id}-focalPointX`} name="focalPointX" defaultValue={asset.focalPointX} inputMode="decimal" />
                    </div>
                    <div className="field">
                      <label htmlFor={`asset-${asset.id}-focalPointY`}>Focal Y</label>
                      <input id={`asset-${asset.id}-focalPointY`} name="focalPointY" defaultValue={asset.focalPointY} inputMode="decimal" />
                    </div>
                  </div>
                  <div className="grid-2">
                    <label style={{ alignItems: "center", display: "flex", gap: 8 }}>
                      <input name="isDecorative" type="checkbox" defaultChecked={asset.isDecorative} />
                      Decorative
                    </label>
                    <label style={{ alignItems: "center", display: "flex", gap: 8 }}>
                      <input name="isPrivate" type="checkbox" defaultChecked={asset.isPrivate} />
                      Private
                    </label>
                  </div>
                  <button className="button secondary" type="submit">
                    Save metadata
                  </button>
                </form>
                <form action={archiveMediaAssetAction} className="form-grid" style={{ marginTop: 12 }}>
                  <input type="hidden" name="id" value={asset.id} />
                  <label style={{ alignItems: "center", display: "flex", gap: 8 }}>
                    <input name="confirmArchive" type="checkbox" required />
                    Archive this asset.
                  </label>
                  <button className="button danger" type="submit">
                    <Archive size={16} />
                    Archive asset
                  </button>
                </form>
              </details>
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

      {archivedAssets.length ? (
        <section className="card stack">
          <h2 style={{ fontSize: "1.35rem" }}>Archived assets</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Asset</th>
                <th>Folder</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {archivedAssets.map((asset) => (
                <tr key={asset.id}>
                  <td>
                    <strong>{asset.filename}</strong>
                    <br />
                    <span style={{ color: "var(--muted)" }}>{asset.caption || asset.url}</span>
                  </td>
                  <td>{asset.folder || "root"}</td>
                  <td>
                    <form action={restoreMediaAssetAction}>
                      <input type="hidden" name="id" value={asset.id} />
                      <button className="button secondary" type="submit">
                        <RotateCcw size={16} />
                        Restore
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </div>
  );
}
