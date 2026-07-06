import NextImage from "next/image";
import { Archive, Folder, ImagePlus, RotateCcw, Star, Tag } from "lucide-react";
import { MediaDriver, MediaVariantType, type Prisma } from "@prisma/client";
import { getAccessibleMediaWhere, requireAdmin } from "@/lib/auth";
import { nonEmptyStringArrayFromUnknown, stringArrayCsv } from "@/lib/format";
import { isMediaUploadDriverConfigured, mediaAssetDisplayUrl } from "@/lib/media";
import { prisma } from "@/lib/prisma";
import { getSiteSettings } from "@/lib/site";
import {
  archiveMediaAssetAction,
  restoreMediaAssetAction,
  setHeroImageAction,
  updateMediaAssetAction,
  uploadMediaAction } from "./actions";
import { Button, Card, EqualGrid, Pagination, Switch, Table } from "@/components/ui";
import { ModuleActionModals } from "@/components/ui/module-action-modals";

export const dynamic = "force-dynamic";

const repoAssets = [
{
  filename: "hero.svg",
  url: "/hero.svg",
  alt: "Neutral admin template hero"
}];

const pageSize = 24;

type MediaPageProps = {
  searchParams: Promise<{saved?: string;error?: string;page?: string;}>;
};

function fileSizeLabel(bytes: number) {
  if (!bytes) return "Unknown size";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function canUploadWithDriver(driver: MediaDriver) {
  return isMediaUploadDriverConfigured(driver);
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
  })]
  );
  const pageCount = Math.max(1, Math.ceil(assetCount / pageSize));
  const errorMessage = params.error === "missing-file" ? "Choose a file before uploading." : params.error;

  const canUpload = canUploadWithDriver(settings.mediaDriver);
  const uploadForm = (
    <form action={uploadMediaAction} className="form-grid">
      <p className="lead lead-compact">
        Current media mode: <strong>{settings.mediaDriver}</strong>. Server asset folders work on a mounted volume; cloud modes require matching storage env vars.
      </p>
      <div className="ui-field">
        <label htmlFor="media-file">Image file</label>
        <input id="media-file" name="file" type="file" accept="image/*" disabled={!canUpload} />
      </div>
      <div className="ui-field">
        <label htmlFor="media-alt">Alt text</label>
        <input id="media-alt" name="alt" disabled={!canUpload} />
      </div>
      <Switch disabled={!canUpload} label="Decorative image" name="isDecorative" variant="inline" />
      <EqualGrid>
        <div className="ui-field">
          <label htmlFor="media-folder">Folder</label>
          <input id="media-folder" name="folder" placeholder="portraits/spring" disabled={!canUpload} />
        </div>
        <div className="ui-field">
          <label htmlFor="media-tags">Tags</label>
          <input id="media-tags" name="tags" placeholder="hero, portrait, proofing" disabled={!canUpload} />
        </div>
      </EqualGrid>
      <EqualGrid>
        <div className="ui-field">
          <label htmlFor="media-caption">Caption</label>
          <input id="media-caption" name="caption" disabled={!canUpload} />
        </div>
        <div className="ui-field">
          <label htmlFor="media-credit">Credit</label>
          <input id="media-credit" name="credit" disabled={!canUpload} />
        </div>
      </EqualGrid>
      <div className="ui-field">
        <label htmlFor="media-usageContext">Usage context</label>
        <input id="media-usageContext" name="usageContext" placeholder="homepage, proofing, product" disabled={!canUpload} />
      </div>
      <EqualGrid>
        <div className="ui-field">
          <label htmlFor="media-focalPointX">Focal X</label>
          <input id="media-focalPointX" name="focalPointX" defaultValue="0.5" inputMode="decimal" disabled={!canUpload} />
        </div>
        <div className="ui-field">
          <label htmlFor="media-focalPointY">Focal Y</label>
          <input id="media-focalPointY" name="focalPointY" defaultValue="0.5" inputMode="decimal" disabled={!canUpload} />
        </div>
      </EqualGrid>
      <Switch disabled={!canUpload} label="Private delivery asset" name="isPrivate" variant="inline" />
      <div className="module-modal-actions">
        <Button type="submit" disabled={!canUpload}>
          <ImagePlus size={18} />
          Upload image
        </Button>
      </div>
      {!canUpload ? (
        <p className="lead lead-compact">
          Switch media mode to Server asset folder, Railway/S3 bucket, R2, or Cloudflare Images in Settings to enable uploads.
        </p>
      ) : null}
    </form>
  );
  const repoAssetsPanel = (
    <div className="stack">
      {repoAssets.map((asset) => (
        <div key={asset.url} className="asset-tile">
          <NextImage src={asset.url} alt={asset.alt} width={500} height={375} unoptimized />
          <div className="page-header ui-zero">
            <span>{asset.filename}</span>
            <form action={setHeroImageAction}>
              <input type="hidden" name="url" value={asset.url} />
              <Button type="submit" variant="secondary">
                <Star size={16} />
                Use hero
              </Button>
            </form>
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">Media</p>
          <h1>Images and assets</h1>
          <p>Use repo references for static assets, or upload into a server folder, Railway/S3 bucket, R2, or Cloudflare Images for editable media.</p>
        </div>
      </header>

      {params.saved ? <div className="success-message">Media changes saved.</div> : null}
      {errorMessage ? <div className="error">{decodeURIComponent(errorMessage)}</div> : null}

      <Card as="section">
        <div className="page-header compact-header">
          <div>
            <h2 className="section-title">Uploaded assets</h2>
            <p className="ui-zero">
              {assetCount} active assets {archivedCount ? `- ${archivedCount} archived` : ""}
            </p>
          </div>
          <ModuleActionModals
            items={[
              {
                content: uploadForm,
                icon: "upload",
                id: "upload",
                label: "Upload",
                title: "Upload image",
                variant: "primary"
              },
              {
                content: repoAssetsPanel,
                icon: "image",
                id: "repo",
                label: "Repo assets",
                title: "Repo assets"
              }
            ]}
            toolbarLabel="Media tools"
          />
        </div>
        {folderGroups.length ?
        <div className="ui-zero">
            {folderGroups.map((folder) =>
          <span className="ui-badge" key={folder.folder || "root"}>
                <Folder size={14} />
                {folder.folder || "root"} ({folder._count._all})
              </span>
          )}
          </div> :
        null}
        <EqualGrid min="220px">
          {mediaAssets.map((asset) =>
          <div key={asset.id} className="asset-tile">
              <NextImage
              src={mediaAssetDisplayUrl(asset, MediaVariantType.CARD)}
              alt={asset.isDecorative ? "" : asset.alt || asset.filename}
              width={500}
              height={375}
              unoptimized />
            
              <div className="ui-zero">
                <strong>{asset.filename}</strong>
                <span className="muted-text">
                  {asset.mimeType || "image"} - {fileSizeLabel(asset.sizeBytes)} - {asset.driver}
                </span>
                <div className="ui-zero">
                  {asset.folder ?
                <span className="ui-badge">
                      <Folder size={14} />
                      {asset.folder}
                    </span> :
                null}
                  {asset.isPrivate ? <span className="ui-badge ui-badge-danger">private</span> : null}
                  {asset.isDecorative ? <span className="ui-badge">decorative</span> : null}
                  {asset.usageContext ? <span className="ui-badge">{asset.usageContext}</span> : null}
                  {nonEmptyStringArrayFromUnknown(asset.tags).map((tag) =>
                <span className="ui-badge" key={tag}>
                      <Tag size={14} />
                      {tag}
                    </span>
                )}
                </div>
                {asset.caption || asset.credit ?
              <p className="ui-zero">
                    {asset.caption}
                    {asset.caption && asset.credit ? " - " : ""}
                    {asset.credit}
                  </p> :
              null}
                <span className="muted-text">
                  Focal point {asset.focalPointX.toFixed(2)}, {asset.focalPointY.toFixed(2)} - {asset.variants.length} variants
                </span>
              </div>
              {!asset.isPrivate ?
            <div className="page-header ui-zero">
                <form action={setHeroImageAction}>
                  <input type="hidden" name="url" value={mediaAssetDisplayUrl(asset, MediaVariantType.HERO)} />
                  <Button type="submit" variant="secondary">
                    <Star size={16} />
                    Use hero
                  </Button>
                </form>
                </div> :
            null}
              <details className="subpanel">
                <summary>Edit metadata</summary>
                <form action={updateMediaAssetAction} className="form-grid ui-zero">
                  <input type="hidden" name="id" value={asset.id} />
                  <div className="ui-field">
                    <label htmlFor={`asset-${asset.id}-alt`}>Alt text</label>
                    <input id={`asset-${asset.id}-alt`} name="alt" defaultValue={asset.alt || ""} />
                  </div>
                  <EqualGrid>
                    <div className="ui-field">
                      <label htmlFor={`asset-${asset.id}-folder`}>Folder</label>
                      <input id={`asset-${asset.id}-folder`} name="folder" defaultValue={asset.folder} />
                    </div>
                    <div className="ui-field">
                      <label htmlFor={`asset-${asset.id}-tags`}>Tags</label>
                      <input id={`asset-${asset.id}-tags`} name="tags" defaultValue={stringArrayCsv(asset.tags)} />
                    </div>
                  </EqualGrid>
                  <div className="ui-field">
                    <label htmlFor={`asset-${asset.id}-caption`}>Caption</label>
                    <input id={`asset-${asset.id}-caption`} name="caption" defaultValue={asset.caption} />
                  </div>
                  <div className="ui-field">
                    <label htmlFor={`asset-${asset.id}-credit`}>Credit</label>
                    <input id={`asset-${asset.id}-credit`} name="credit" defaultValue={asset.credit} />
                  </div>
                  <div className="ui-field">
                    <label htmlFor={`asset-${asset.id}-usageContext`}>Usage context</label>
                    <input id={`asset-${asset.id}-usageContext`} name="usageContext" defaultValue={asset.usageContext} />
                  </div>
                  <EqualGrid>
                    <div className="ui-field">
                      <label htmlFor={`asset-${asset.id}-focalPointX`}>Focal X</label>
                      <input id={`asset-${asset.id}-focalPointX`} name="focalPointX" defaultValue={asset.focalPointX} inputMode="decimal" />
                    </div>
                    <div className="ui-field">
                      <label htmlFor={`asset-${asset.id}-focalPointY`}>Focal Y</label>
                      <input id={`asset-${asset.id}-focalPointY`} name="focalPointY" defaultValue={asset.focalPointY} inputMode="decimal" />
                    </div>
                  </EqualGrid>
                  <EqualGrid>
                    <Switch defaultChecked={asset.isDecorative} label="Decorative" name="isDecorative" variant="inline" />
                    <Switch defaultChecked={asset.isPrivate} label="Private" name="isPrivate" variant="inline" />
                  </EqualGrid>
                  <Button type="submit" variant="secondary">
                    Save metadata
                  </Button>
                </form>
                <form action={archiveMediaAssetAction} className="form-grid ui-zero">
                  <input type="hidden" name="id" value={asset.id} />
                  <Switch label="Archive this asset." name="confirmArchive" required variant="inline" />
                  <Button type="submit" variant="danger">
                    <Archive size={16} />
                    Archive asset
                  </Button>
                </form>
              </details>
            </div>
          )}
          {!mediaAssets.length ? <p>No uploaded media yet.</p> : null}
        </EqualGrid>
        <Pagination
          label="Media pages"
          nextHref={`/admin/modules/media?page=${Math.min(pageCount, page + 1)}`}
          page={page}
          pageCount={pageCount}
          previousHref={`/admin/modules/media?page=${Math.max(1, page - 1)}`}
        />
      </Card>

      {archivedAssets.length ?
      <Card as="section" bodyClassName="ui-stack">
          <h2 className="section-title">Archived assets</h2>
          <Table>
            <thead>
              <tr>
                <th>Asset</th>
                <th>Folder</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {archivedAssets.map((asset) =>
            <tr key={asset.id}>
                  <td>
                    <strong>{asset.filename}</strong>
                    <br />
                    <span className="muted-text">{asset.caption || asset.url}</span>
                  </td>
                  <td>{asset.folder || "root"}</td>
                  <td>
                    <form action={restoreMediaAssetAction}>
                      <input type="hidden" name="id" value={asset.id} />
                      <Button type="submit" variant="secondary">
                        <RotateCcw size={16} />
                        Restore
                      </Button>
                    </form>
                  </td>
                </tr>
            )}
            </tbody>
          </Table>
        </Card> :
      null}
    </div>);

}
