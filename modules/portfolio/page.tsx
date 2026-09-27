import Link from "next/link";
import { ArrowLeft, BookOpen, Image as ImageIcon, RotateCcw } from "lucide-react";
import {
  MediaVariantType,
  PortfolioAccessStatus,
  PortfolioGalleryLayout,
  PortfolioGalleryStatus,
  PortfolioGalleryVisibility,
  PortfolioItemType,
  PortfolioProofItemStatus,
  PortfolioProofRoundStatus,
  type Prisma } from "@prisma/client";
import { getAccessibleClientWhere, getAccessibleGalleryWhere, getAccessibleMediaWhere, requireAdmin } from "@/lib/auth";
import { enumLabel, formatDateTime } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { getSiteSettings } from "@/lib/site";
import {
  renamePortfolioAlbumAction,
  addPortfolioGalleryItemAction,
  createPortfolioAccessAction,
  createPortfolioGalleryAction,
  createPortfolioProofRoundAction,
  updatePortfolioAccessStatusAction,
  updatePortfolioGalleryLayoutAction,
  updatePortfolioGalleryStatusAction,
  updatePortfolioProofRoundStatusAction } from "./actions";
import { Button, Card, EqualGrid, Switch, Table } from "@/components/ui";
import { ModuleActionModals } from "@/components/ui/module-action-modals";

import { mediaAssetDisplayUrl, mediaAssetIdFromUrl } from "@/lib/media";
import { AlbumPhotos } from "./album-photos";
import styles from "./albums.module.css";

export const dynamic = "force-dynamic";

type PortfolioPageProps = {
  searchParams: Promise<{saved?: string;error?: string;gallery?: string;}>;
};

function galleryStatusClass(status: PortfolioGalleryStatus) {
  if (status === PortfolioGalleryStatus.PUBLISHED) return "ui-badge ui-badge-success";
  if (status === PortfolioGalleryStatus.ARCHIVED) return "ui-badge ui-badge-danger";
  return "ui-badge";
}

function accessStatusClass(status: PortfolioAccessStatus) {
  if (status === PortfolioAccessStatus.ACTIVE) return "ui-badge ui-badge-success";
  if (status === PortfolioAccessStatus.REVOKED) return "ui-badge ui-badge-danger";
  return "ui-badge";
}

export default async function PortfolioPage({ searchParams }: PortfolioPageProps) {
  const user = await requireAdmin("portfolio:manage");
  const [params, settings] = await Promise.all([searchParams, getSiteSettings()]);
  const galleryWhere: Prisma.PortfolioGalleryWhereInput = await getAccessibleGalleryWhere(user, settings.siteId);
  const activeMediaWhere: Prisma.MediaAssetWhereInput = await getAccessibleMediaWhere(user, settings.siteId, { deletedAt: null });
  const clientWhere: Prisma.ClientWhereInput = await getAccessibleClientWhere(user, settings.siteId);
  const [galleries, mediaAssets, clients] = await Promise.all([
  prisma.portfolioGallery.findMany({
    where: galleryWhere,
    include: { _count: { select: { items: true } }, items: { orderBy: [{ isCover: "desc" }, { sortOrder: "asc" }], take: 1 } },
    orderBy: [{ status: "asc" }, { sortOrder: "asc" }, { updatedAt: "desc" }],
    take: 30
  }),
  prisma.mediaAsset.findMany({
    where: activeMediaWhere,
    orderBy: { createdAt: "desc" },
    take: 60
  }),
  prisma.client.findMany({
    where: clientWhere,
    orderBy: { updatedAt: "desc" },
    take: 50
  })]

  );

  const selectedGalleryId = params.gallery;
  const selectedGallery = selectedGalleryId ?
  await prisma.portfolioGallery.findFirst({
    where: await getAccessibleGalleryWhere(user, settings.siteId, { id: selectedGalleryId }),
    include: {
      items: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
      accesses: { orderBy: { createdAt: "desc" }, take: 20 },
      favorites: {
        include: { item: { select: { id: true, imageUrl: true, title: true } } },
        orderBy: { createdAt: "desc" },
        take: 20
      },
      proofRounds: {
        include: {
          approvals: { orderBy: { createdAt: "desc" }, take: 20 },
          comments: {
            include: { item: { select: { id: true, imageUrl: true, title: true } } },
            orderBy: { createdAt: "desc" },
            take: 50
          },
          decisions: {
            include: { item: { select: { id: true, imageUrl: true, title: true } } },
            orderBy: { updatedAt: "desc" },
            take: 100
          }
        },
        orderBy: { roundNumber: "desc" },
        take: 5
      }
    }
  }) :
  null;
  const albumMediaIds = [...new Set([...galleries.flatMap(gallery => [mediaAssetIdFromUrl(gallery.coverImageUrl), ...gallery.items.map(item => item.mediaAssetId)]), ...(selectedGallery?.items.map(item => item.mediaAssetId) || [])].filter((id): id is string => Boolean(id)))];
  const albumMedia = albumMediaIds.length ? await prisma.mediaAsset.findMany({ where: await getAccessibleMediaWhere(user, settings.siteId, { id: { in: albumMediaIds }, deletedAt: null }) }) : [];
  const mediaById = new Map(albumMedia.map(asset => [asset.id, asset]));
  function itemUrl(item: { mediaAssetId: string | null; imageUrl: string }, type: MediaVariantType) {
    const asset = item.mediaAssetId ? mediaById.get(item.mediaAssetId) : null;
    return asset ? mediaAssetDisplayUrl(asset, type) : item.mediaAssetId ? "" : item.imageUrl;
  }
  function coverUrl(gallery: typeof galleries[number]) {
    const coverId = mediaAssetIdFromUrl(gallery.coverImageUrl);
    const asset = coverId ? mediaById.get(coverId) : null;
    return asset ? mediaAssetDisplayUrl(asset, MediaVariantType.CARD) : gallery.items[0] ? itemUrl(gallery.items[0], MediaVariantType.CARD) : coverId ? "" : gallery.coverImageUrl;
  }
  const photos = (selectedGallery?.items || []).filter(item => item.type === PortfolioItemType.IMAGE).map(item => ({ id: item.id, title: item.title, alt: item.altText || item.title || selectedGallery!.title, thumbnail: itemUrl(item, MediaVariantType.CARD), url: itemUrl(item, MediaVariantType.FULL) })).filter(item => item.url);
  const latestProofRound = selectedGallery?.proofRounds[0] || null;
  const selectedImageExport = selectedGallery ?
  [
  ...selectedGallery.favorites.map((favorite) => ({
    item: favorite.item?.title || favorite.item?.imageUrl || favorite.itemId,
    source: "favorite",
    viewer: favorite.viewerEmail || favorite.clientId || "anonymous"
  })),
  ...(latestProofRound?.decisions || []).
  filter((decision) => decision.status === PortfolioProofItemStatus.APPROVED).
  map((decision) => ({
    item: decision.item?.title || decision.item?.imageUrl || decision.itemId,
    source: "approved",
    viewer: decision.viewerEmail || decision.clientId || "anonymous"
  }))] :

  [];
  const selectedDownloadableCount = selectedGallery?.items.filter((item) => item.isDownloadable && item.mediaAssetId).length || 0;
  const savedMessage = params.saved ? "Album changes saved." : null;
  const errorMessage = params.error || null;
  const createGalleryForm = (
    <form action={createPortfolioGalleryAction} className="form-grid">
      <div className="ui-field"><label htmlFor="gallery-title">Album title</label><input id="gallery-title" name="title" required maxLength={180} placeholder="A name for these moments" /></div>
      <p>Start with a title, then add your photos. New albums are saved as drafts.</p>
      <details className={styles.options}><summary>Album options</summary><div className="form-grid">
      <div className="ui-field"><label htmlFor="gallery-slug">Web address name</label><input id="gallery-slug" name="slug" placeholder="Created from the title" /></div>
      <EqualGrid min="220px">
        <div className="ui-field">
          <label htmlFor="gallery-status">Status</label>
          <select id="gallery-status" name="status" defaultValue={PortfolioGalleryStatus.DRAFT}>
            {Object.values(PortfolioGalleryStatus).map((status) =>
            <option key={status} value={status}>
                {enumLabel(status)}
              </option>
            )}
          </select>
        </div>
        <div className="ui-field">
          <label htmlFor="gallery-visibility">Visibility</label>
          <select id="gallery-visibility" name="visibility" defaultValue={PortfolioGalleryVisibility.PUBLIC}>
            {Object.values(PortfolioGalleryVisibility).map((visibility) =>
            <option key={visibility} value={visibility}>
                {enumLabel(visibility)}
              </option>
            )}
          </select>
        </div>
        <div className="ui-field">
          <label htmlFor="gallery-sort">Sort order</label>
          <input id="gallery-sort" name="sortOrder" type="number" defaultValue="0" />
        </div>
      </EqualGrid>
      <div className="ui-field">
        <label htmlFor="gallery-layout">Layout</label>
        <select id="gallery-layout" name="layout" defaultValue={PortfolioGalleryLayout.GRID}>
          {Object.values(PortfolioGalleryLayout).map((layout) =>
          <option key={layout} value={layout}>
              {enumLabel(layout)}
            </option>
          )}
        </select>
      </div>
      <EqualGrid min="220px">
        <div className="ui-field">
          <label htmlFor="gallery-category">Category</label>
          <input id="gallery-category" name="category" placeholder="Portraits" />
        </div>
        <div className="ui-field">
          <label htmlFor="gallery-location">Location</label>
          <input id="gallery-location" name="location" />
        </div>
        <div className="ui-field">
          <label htmlFor="gallery-shot-at">Shoot date</label>
          <input id="gallery-shot-at" name="shotAt" type="date" />
        </div>
      </EqualGrid>
      <div className="ui-field">
        <label htmlFor="gallery-description">Description</label>
        <textarea id="gallery-description" name="description" />
      </div>
      <div className="ui-field">
        <label htmlFor="gallery-cover">Cover image URL</label>
        <input id="gallery-cover" name="coverImageUrl" placeholder="/hero.svg" />
      </div>
      <EqualGrid>
        <Switch defaultChecked label="Proofing enabled" name="proofingEnabled" variant="inline" />
        <Switch label="Downloads enabled" name="downloadEnabled" variant="inline" />
      </EqualGrid>
      <div className="ui-field">
        <label htmlFor="gallery-access-code">Password access code</label>
        <input id="gallery-access-code" name="accessCode" type="password" />
      </div>
      <div className="ui-field">
        <label htmlFor="gallery-rights">Rights notes</label>
        <textarea id="gallery-rights" name="rightsNotes" />
      </div>
      <EqualGrid>
        <div className="ui-field">
          <label htmlFor="gallery-seo-title">SEO title</label>
          <input id="gallery-seo-title" name="seoTitle" />
        </div>
        <div className="ui-field">
          <label htmlFor="gallery-seo-description">SEO description</label>
          <input id="gallery-seo-description" name="seoDescription" />
        </div>
      </EqualGrid>
      </div></details>
      <div className="module-modal-actions">
        <Button type="submit">
          <ImageIcon size={18} />
          Create album
        </Button>
      </div>
    </form>
  );

  return (
    <div className={styles.workspace}>
      <header className={styles.heading}>
        <div>{selectedGallery && <Link className={styles.back} href="/admin/modules/portfolio"><ArrowLeft size={16} />All albums</Link>}
          <h1>{selectedGallery ? selectedGallery.title : "Photo albums"}</h1>
          <p>{selectedGallery ? selectedGallery.items.length + " photos · " + enumLabel(selectedGallery.status) + " · " + enumLabel(selectedGallery.visibility) : "Give your photographs a home. Open an album to browse or add photos."}</p>
        </div>
        <ModuleActionModals toolbarLabel="Album tools" items={selectedGallery ? [{ id: "rename", label: "Rename album", title: "Rename album", content: <form action={renamePortfolioAlbumAction} className="form-grid"><input type="hidden" name="id" value={selectedGallery.id} /><div className="ui-field"><label htmlFor="album-title">Album title</label><input id="album-title" name="title" defaultValue={selectedGallery.title} required maxLength={180} /></div><Button type="submit">Save title</Button></form> }] : [{ id: "album", label: "New album", title: "New photo album", icon: "plus", variant: "primary", content: createGalleryForm }]} />
      </header>
      {savedMessage && <p role="status" className="success-message">{savedMessage}</p>}
      {errorMessage && <p role="alert" className="error">{errorMessage}</p>}
      {params.gallery && !selectedGallery && <p role="alert">That album is not available. Choose another album below.</p>}
      {!selectedGallery && <section className={styles.shelf} aria-label="Photo albums">
        {galleries.map(gallery => <Link key={gallery.id} className={styles.album} href={"/admin/modules/portfolio?gallery=" + gallery.id} aria-label={"Open " + gallery.title}>
          <div className={styles.book}>
            {coverUrl(gallery) ? <img src={coverUrl(gallery)} alt="" loading="lazy" /> : <div className={styles.blankCover}><BookOpen size={36} aria-hidden="true" /><span>Your next story</span></div>}
            <span className={styles.binding} aria-hidden="true" />
            <div className={styles.bookTitle}><span>{gallery.title}</span></div>
          </div>
          <div className={styles.albumMeta}><span>{gallery._count.items} photo{gallery._count.items === 1 ? "" : "s"}</span><span>{enumLabel(gallery.status)}</span></div>
        </Link>)}
        {!galleries.length && <div className={styles.empty}><BookOpen size={40} aria-hidden="true" /><h2>A place for every story</h2><p>Create your first album, give it a title, and fill it with photographs.</p></div>}
      </section>}
      {selectedGallery && <AlbumPhotos key={selectedGallery.id} galleryId={selectedGallery.id} photos={photos} />}
      {selectedGallery && <details className={styles.options}><summary>Album settings, sharing &amp; proofing</summary><div className="stack">
      {selectedGallery ?
      <EqualGrid as="section">
          <Card bodyClassName="ui-stack">
            <div className="page-header compact-header">
              <div>
                <h2 className="section-title">{selectedGallery.title}</h2>
                <p>
                  {enumLabel(selectedGallery.visibility)} gallery with {selectedGallery.items.length} photos
                </p>
              </div>
              <span className={galleryStatusClass(selectedGallery.status)}>{enumLabel(selectedGallery.status)}</span>
            </div>
            <div className="ui-zero"
          aria-label={selectedGallery.title}
          role="img" />

          
            <Table>
              <tbody>
                <tr>
                  <td>Slug</td>
                  <td>
                    {selectedGallery.slug}
                  </td>
                </tr>
                <tr>
                  <td>Layout</td>
                  <td>{enumLabel(selectedGallery.layout)}</td>
                </tr>
                <tr>
                  <td>Proofing</td>
                  <td>
                    {selectedGallery.proofingEnabled ? "Enabled" : "Disabled"}
                    {latestProofRound ?
                  <>
                        <br />
                        <span className="muted-text">
                          Round {latestProofRound.roundNumber} - {enumLabel(latestProofRound.status)}
                        </span>
                      </> :
                  null}
                  </td>
                </tr>
                <tr>
                  <td>Downloads</td>
                  <td>{selectedGallery.downloadEnabled ? "Enabled" : "Disabled"}</td>
                </tr>
                <tr>
                  <td>Access code</td>
                  <td>{selectedGallery.accessCodeHash ? "Configured" : "Not configured"}</td>
                </tr>
                <tr>
                  <td>Updated</td>
                  <td>{formatDateTime(selectedGallery.updatedAt, settings.timezone)}</td>
                </tr>
              </tbody>
            </Table>
            <form action={updatePortfolioGalleryLayoutAction} className="form-grid">
              <input type="hidden" name="id" value={selectedGallery.id} />
              <div className="ui-field">
                <label htmlFor={`gallery-${selectedGallery.id}-layout`}>Gallery layout</label>
                <select id={`gallery-${selectedGallery.id}-layout`} name="layout" defaultValue={selectedGallery.layout}>
                  {Object.values(PortfolioGalleryLayout).map((layout) =>
                <option key={layout} value={layout}>
                      {enumLabel(layout)}
                    </option>
                )}
                </select>
              </div>
              <Button type="submit" variant="secondary">
                Save layout
              </Button>
            </form>
            <div className="ui-zero">
              {[PortfolioGalleryStatus.PUBLISHED, PortfolioGalleryStatus.DRAFT, PortfolioGalleryStatus.ARCHIVED].map((status) =>
            <form action={updatePortfolioGalleryStatusAction} className="stack ui-zero" key={status}>
                  <input type="hidden" name="id" value={selectedGallery.id} />
                  <input type="hidden" name="status" value={status} />
                  {status === PortfolioGalleryStatus.ARCHIVED ?
              <Switch label="Confirm archive" name="confirmArchive" variant="inline" /> :
              null}
                  <Button type="submit" variant="secondary">
                    Mark {enumLabel(status)}
                  </Button>
                </form>
            )}
            </div>
          </Card>

          <Card action={addPortfolioGalleryItemAction} as="form" minHeight="none" bodyClassName="form-grid">
            <input type="hidden" name="galleryId" value={selectedGallery.id} />
            <h2 className="section-title">Add image or delivery item</h2>
            <EqualGrid>
              <div className="ui-field">
                <label htmlFor="item-media">Uploaded media</label>
                <select id="item-media" name="mediaAssetId" defaultValue="">
                  <option value="">Use a URL instead</option>
                  {mediaAssets.map((asset) =>
                <option key={asset.id} value={asset.id}>
                      {asset.filename}
                    </option>
                )}
                </select>
              </div>
              <div className="ui-field">
                <label htmlFor="item-type">Type</label>
                <select id="item-type" name="type" defaultValue={PortfolioItemType.IMAGE}>
                  {Object.values(PortfolioItemType).map((type) =>
                <option key={type} value={type}>
                      {enumLabel(type)}
                    </option>
                )}
                </select>
              </div>
            </EqualGrid>
            <div className="ui-field">
              <label htmlFor="item-url">Image or file URL</label>
              <input id="item-url" name="imageUrl" placeholder="/hero.svg" />
            </div>
            <EqualGrid>
              <div className="ui-field">
                <label htmlFor="item-title">Title</label>
                <input id="item-title" name="title" />
              </div>
              <div className="ui-field">
                <label htmlFor="item-sort">Sort order</label>
                <input id="item-sort" name="sortOrder" type="number" defaultValue={selectedGallery.items.length * 10 + 10} />
              </div>
            </EqualGrid>
            <div className="ui-field">
              <label htmlFor="item-alt">Alt text</label>
              <input id="item-alt" name="altText" />
            </div>
            <div className="ui-field">
              <label htmlFor="item-caption">Caption</label>
              <textarea id="item-caption" name="caption" />
            </div>
            <EqualGrid min="220px">
              <Switch label="Use as cover" name="isCover" variant="inline" />
              <Switch label="Downloadable" name="isDownloadable" variant="inline" />
              <Switch defaultChecked label="Watermarked" name="isWatermarked" variant="inline" />
            </EqualGrid>
            <div className="ui-field">
              <label htmlFor="item-license">License notes</label>
              <input id="item-license" name="licenseNotes" />
            </div>
            <Button type="submit" variant="secondary">
              Add item
            </Button>
          </Card>
        </EqualGrid> :
      null}

      {selectedGallery ?
      <EqualGrid as="section">
          <Card action={createPortfolioProofRoundAction} as="form" minHeight="none" bodyClassName="form-grid">
            <input type="hidden" name="galleryId" value={selectedGallery.id} />
            <h2 className="section-title">Start revision round</h2>
            <EqualGrid>
              <div className="ui-field">
                <label htmlFor="round-title">Title</label>
                <input id="round-title" name="title" placeholder={`Round ${(latestProofRound?.roundNumber || 0) + 1}`} />
              </div>
              <div className="ui-field">
                <label htmlFor="round-due">Due date</label>
                <input id="round-due" name="dueAt" type="date" />
              </div>
            </EqualGrid>
            <div className="ui-field">
              <label htmlFor="round-instructions">Instructions</label>
              <textarea id="round-instructions" name="instructions" />
            </div>
            <Button type="submit" variant="secondary">
              <RotateCcw size={16} />
              Start round
            </Button>
          </Card>

          <Card bodyClassName="ui-stack">
            <h2 className="section-title">Proofing rounds</h2>
            <Table>
              <thead>
                <tr>
                  <th>Round</th>
                  <th>Activity</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {selectedGallery.proofRounds.map((round) =>
              <tr key={round.id}>
                    <td>
                      <strong>{round.title || `Round ${round.roundNumber}`}</strong>
                      <br />
                      <span className="muted-text">
                        Opened {formatDateTime(round.openedAt, settings.timezone)}
                      </span>
                    </td>
                    <td>
                      {round.decisions.length} decisions
                      <br />
                      <span className="muted-text">
                        {round.comments.length} comments - {round.approvals.length} responses
                      </span>
                    </td>
                    <td>
                      <span className={round.status === PortfolioProofRoundStatus.OPEN ? "ui-badge ui-badge-success" : "ui-badge"}>
                        {enumLabel(round.status)}
                      </span>
                    </td>
                    <td>
                      <div className="ui-zero">
                        {[PortfolioProofRoundStatus.LOCKED, PortfolioProofRoundStatus.CHANGES_REQUESTED, PortfolioProofRoundStatus.APPROVED].map(
                      (status) =>
                      <form action={updatePortfolioProofRoundStatusAction} className="stack ui-zero" key={status}>
                              <input type="hidden" name="id" value={round.id} />
                              <input type="hidden" name="status" value={status} />
                              <Switch label={`Confirm ${enumLabel(status).toLowerCase()}`} name="confirmTransition" variant="inline" />
                              <Button type="submit" variant="secondary">
                                Mark {enumLabel(status)}
                              </Button>
                            </form>

                    )}
                      </div>
                    </td>
                  </tr>
              )}
                {!selectedGallery.proofRounds.length ?
              <tr>
                    <td colSpan={4}>No proofing rounds yet.</td>
                  </tr> :
              null}
              </tbody>
            </Table>
          </Card>
        </EqualGrid> :
      null}

      {selectedGallery ?
      <EqualGrid as="section">
          <Card bodyClassName="ui-stack">
            <h2 className="section-title">Gallery items</h2>
            <EqualGrid min="220px">
              {selectedGallery.items.map((item) =>
            <div className="asset-tile" key={item.id}>
                  <div className="ui-zero"
              aria-label={item.altText || item.title || "Portfolio item"}
              role="img" />

              
                  <div>
                    <strong>{item.title || item.imageUrl}</strong>
                    <p className="ui-zero">
                      {item.caption || enumLabel(item.type)}
                      {item.isCover ? " - cover" : ""}
                    </p>
                  </div>
                </div>
            )}
              {!selectedGallery.items.length ? <p className="empty-state">No gallery items yet.</p> : null}
            </EqualGrid>
          </Card>

          <Card bodyClassName="ui-stack">
            <h2 className="section-title">Recent favorites</h2>
            <Table>
              <thead>
                <tr>
                  <th>Viewer</th>
                  <th>Notes</th>
                  <th>Saved</th>
                </tr>
              </thead>
              <tbody>
                {selectedGallery.favorites.map((favorite) =>
              <tr key={favorite.id}>
                    <td>{favorite.viewerEmail || favorite.clientId || "Anonymous"}</td>
                    <td>{favorite.notes || favorite.itemId}</td>
                    <td>{formatDateTime(favorite.createdAt, settings.timezone)}</td>
                  </tr>
              )}
                {!selectedGallery.favorites.length ?
              <tr>
                    <td colSpan={3}>No favorites yet.</td>
                  </tr> :
              null}
              </tbody>
            </Table>
          </Card>
        </EqualGrid> :
      null}

      {selectedGallery ?
      <EqualGrid as="section">
          <Card bodyClassName="ui-stack">
            <h2 className="section-title">Proof decisions and comments</h2>
            {!latestProofRound ? <p className="empty-state">No proofing round selected.</p> : null}
            {latestProofRound ?
          <Table>
                <thead>
                  <tr>
                    <th>Image</th>
                    <th>Viewer</th>
                    <th>Decision</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {latestProofRound.decisions.map((decision) =>
              <tr key={decision.id}>
                      <td>{decision.item?.title || decision.item?.imageUrl || decision.itemId}</td>
                      <td>{decision.viewerEmail || decision.clientId || "Anonymous"}</td>
                      <td>{enumLabel(decision.status)}</td>
                      <td>{decision.notes || "-"}</td>
                    </tr>
              )}
                  {!latestProofRound.decisions.length ?
              <tr>
                      <td colSpan={4}>No image decisions yet.</td>
                    </tr> :
              null}
                </tbody>
              </Table> :
          null}
            {latestProofRound?.comments.length ?
          <div className="stack">
                <h3>Recent proof comments</h3>
                {latestProofRound.comments.slice(0, 8).map((comment) =>
            <div className="subpanel" key={comment.id}>
                    <strong>{comment.item?.title || comment.item?.imageUrl || "Round comment"}</strong>
                    <p className="ui-zero">{comment.body}</p>
                    <small className="muted-text">
                      {comment.authorName || comment.viewerEmail || "Viewer"} - {formatDateTime(comment.createdAt, settings.timezone)}
                    </small>
                  </div>
            )}
              </div> :
          null}
          </Card>

          <Card bodyClassName="ui-stack">
            <h2 className="section-title">Selected image export</h2>
            <textarea
            readOnly
            rows={Math.max(6, Math.min(14, selectedImageExport.length + 1))}
            value={selectedImageExport.map((entry) => `${entry.source},${entry.viewer},${entry.item}`).join("\n")} />
          
            <div className="subpanel stack">
              <h3>Delivery bundle</h3>
              <p className="ui-zero">
                {selectedDownloadableCount} media-backed downloadable item{selectedDownloadableCount === 1 ? "" : "s"} ready for a ZIP delivery bundle.
              </p>
              {selectedGallery.downloadEnabled && selectedDownloadableCount ?
            <p className="ui-zero">Delivery bundle data is ready for the rebuilt client gallery surface.</p> :
            <p className="ui-zero">Enable gallery downloads and mark media-backed items downloadable to prepare a bundle.</p>}
            </div>
            <div className="stack">
              <h3>Round responses</h3>
              {latestProofRound?.approvals.map((approval) =>
            <div className="subpanel" key={approval.id}>
                  <strong>{enumLabel(approval.status)}</strong>
                  <p className="ui-zero">{approval.notes || "-"}</p>
                  <small className="muted-text">
                    {approval.approverName || approval.viewerEmail || "Viewer"} - {formatDateTime(approval.createdAt, settings.timezone)}
                  </small>
                </div>
            )}
              {!latestProofRound?.approvals.length ? <p className="empty-state">No round responses yet.</p> : null}
            </div>
          </Card>
        </EqualGrid> :
      null}

      {selectedGallery ?
      <EqualGrid as="section">
          <Card action={createPortfolioAccessAction} as="form" minHeight="none" bodyClassName="form-grid">
            <input type="hidden" name="galleryId" value={selectedGallery.id} />
            <h2 className="section-title">Create private access</h2>
            <EqualGrid>
              <div className="ui-field">
                <label htmlFor="access-client">Client</label>
                <select id="access-client" name="clientId" defaultValue="">
                  <option value="">No linked client</option>
                  {clients.map((client) =>
                <option key={client.id} value={client.id}>
                      {client.name} ({client.email})
                    </option>
                )}
                </select>
              </div>
              <div className="ui-field">
                <label htmlFor="access-email">Recipient email</label>
                <input id="access-email" name="recipientEmail" type="email" required />
              </div>
            </EqualGrid>
            <EqualGrid>
              <div className="ui-field">
                <label htmlFor="access-token">Access token</label>
                <input id="access-token" name="accessToken" placeholder="Generated if blank" />
              </div>
              <div className="ui-field">
                <label htmlFor="access-expires">Expires</label>
                <input id="access-expires" name="expiresAt" type="date" />
              </div>
            </EqualGrid>
            <Button type="submit" variant="secondary">
              Create access
            </Button>
          </Card>

          <Card bodyClassName="ui-stack">
            <h2 className="section-title">Access links</h2>
            <Table>
              <thead>
                <tr>
                  <th>Recipient</th>
                  <th>Token</th>
                  <th>State</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {selectedGallery.accesses.map((access) =>
              <tr key={access.id}>
                    <td>
                      {access.recipientEmail}
                      <br />
                      <span className="muted-text">
                        {access.expiresAt ? `Expires ${formatDateTime(access.expiresAt, settings.timezone)}` : "No expiry"}
                      </span>
                    </td>
                    <td>
                      <span className="muted-text">{access.accessToken}</span>
                    </td>
                    <td>
                      <span className={accessStatusClass(access.status)}>{enumLabel(access.status)}</span>
                    </td>
                    <td>
                      <form action={updatePortfolioAccessStatusAction}>
                        <input type="hidden" name="id" value={access.id} />
                        <input
                      type="hidden"
                      name="status"
                      value={access.status === PortfolioAccessStatus.ACTIVE ? PortfolioAccessStatus.REVOKED : PortfolioAccessStatus.ACTIVE} />
                    
                        <Button type="submit" variant="secondary">
                          {access.status === PortfolioAccessStatus.ACTIVE ? "Revoke" : "Reactivate"}
                        </Button>
                      </form>
                    </td>
                  </tr>
              )}
                {!selectedGallery.accesses.length ?
              <tr>
                    <td colSpan={4}>No private access links yet.</td>
                  </tr> :
              null}
              </tbody>
            </Table>
          </Card>
        </EqualGrid> :
      null}
      </div></details>}
    </div>);

}
