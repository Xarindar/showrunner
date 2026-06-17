import { Camera, Download, Image as ImageIcon, KeyRound, RotateCcw, Star } from "lucide-react";
import {
  PortfolioAccessStatus,
  PortfolioGalleryLayout,
  PortfolioGalleryStatus,
  PortfolioGalleryVisibility,
  PortfolioItemType,
  PortfolioProofItemStatus,
  PortfolioProofRoundStatus,
  type Prisma
} from "@prisma/client";
import { cssBackgroundImage } from "@/lib/css";
import { getAccessibleClientWhere, getAccessibleGalleryWhere, getAccessibleMediaWhere, requireAdmin } from "@/lib/auth";
import { enumLabel, formatDateTime } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { getSiteSettings } from "@/lib/site";
import {
  addPortfolioGalleryItemAction,
  createPortfolioAccessAction,
  createPortfolioGalleryAction,
  createPortfolioProofRoundAction,
  updatePortfolioAccessStatusAction,
  updatePortfolioGalleryLayoutAction,
  updatePortfolioGalleryStatusAction,
  updatePortfolioProofRoundStatusAction
} from "./actions";

export const dynamic = "force-dynamic";

type PortfolioPageProps = {
  searchParams: Promise<{ saved?: string; error?: string; gallery?: string }>;
};

function galleryStatusClass(status: PortfolioGalleryStatus) {
  if (status === PortfolioGalleryStatus.PUBLISHED) return "pill success";
  if (status === PortfolioGalleryStatus.ARCHIVED) return "pill danger";
  return "pill";
}

function accessStatusClass(status: PortfolioAccessStatus) {
  if (status === PortfolioAccessStatus.ACTIVE) return "pill success";
  if (status === PortfolioAccessStatus.REVOKED) return "pill danger";
  return "pill";
}

export default async function PortfolioPage({ searchParams }: PortfolioPageProps) {
  const user = await requireAdmin("portfolio:manage");
  const [params, settings] = await Promise.all([searchParams, getSiteSettings()]);
  const galleryWhere: Prisma.PortfolioGalleryWhereInput = await getAccessibleGalleryWhere(user, settings.siteId);
  const activeMediaWhere: Prisma.MediaAssetWhereInput = await getAccessibleMediaWhere(user, settings.siteId, { deletedAt: null });
  const clientWhere: Prisma.ClientWhereInput = await getAccessibleClientWhere(user, settings.siteId);
  const [galleries, mediaAssets, clients, publishedCount, privateCount, itemCount, favoriteCount] = await Promise.all([
    prisma.portfolioGallery.findMany({
      where: galleryWhere,
      include: { _count: { select: { items: true, accesses: true, favorites: true } } },
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
    }),
    prisma.portfolioGallery.count({ where: await getAccessibleGalleryWhere(user, settings.siteId, { status: PortfolioGalleryStatus.PUBLISHED }) }),
    prisma.portfolioGallery.count({
      where: await getAccessibleGalleryWhere(user, settings.siteId, {
        visibility: { in: [PortfolioGalleryVisibility.PRIVATE, PortfolioGalleryVisibility.PASSWORD] }
      })
    }),
    prisma.portfolioGalleryItem.count({ where: { gallery: galleryWhere } }),
    prisma.portfolioGalleryFavorite.count({ where: { gallery: galleryWhere } })
  ]);

  const selectedGalleryId = params.gallery || galleries[0]?.id;
  const selectedGallery = selectedGalleryId
    ? await prisma.portfolioGallery.findFirst({
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
      })
    : null;
  const latestProofRound = selectedGallery?.proofRounds[0] || null;
  const selectedImageExport = selectedGallery
    ? [
        ...selectedGallery.favorites.map((favorite) => ({
          item: favorite.item?.title || favorite.item?.imageUrl || favorite.itemId,
          source: "favorite",
          viewer: favorite.viewerEmail || favorite.clientId || "anonymous"
        })),
        ...(latestProofRound?.decisions || [])
          .filter((decision) => decision.status === PortfolioProofItemStatus.APPROVED)
          .map((decision) => ({
            item: decision.item?.title || decision.item?.imageUrl || decision.itemId,
            source: "approved",
            viewer: decision.viewerEmail || decision.clientId || "anonymous"
          }))
      ]
    : [];
  const selectedDownloadableCount = selectedGallery?.items.filter((item) => item.isDownloadable && item.mediaAssetId).length || 0;
  const savedMessage = params.saved ? "Portfolio changes saved." : null;
  const errorMessage = params.error || null;

  return (
    <div className="stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">Portfolio</p>
          <h1>Photography galleries and proofing</h1>
          <p>Create public or private galleries, organize image records, issue access links, and prepare proofing workflows.</p>
        </div>
      </header>

      {savedMessage ? <div className="success-message">{savedMessage}</div> : null}
      {errorMessage ? <div className="error">{errorMessage}</div> : null}

      <section className="grid-3">
        <div className="card">
          <Camera size={22} />
          <h3>{publishedCount} published galleries</h3>
          <p className="lead lead-compact">
            Portfolio collections ready for public gallery and campaign surfaces.
          </p>
        </div>
        <div className="card">
          <KeyRound size={22} />
          <h3>{privateCount} private galleries</h3>
          <p className="lead lead-compact">
            Password or private-link collections for proofing and client delivery.
          </p>
        </div>
        <div className="card">
          <Star size={22} />
          <h3>{favoriteCount} favorites</h3>
          <p className="lead lead-compact">
            Client selections captured for approval, delivery, and future print workflows.
          </p>
        </div>
      </section>

      <section className="grid-2">
        <form action={createPortfolioGalleryAction} className="card form-grid">
          <h2 className="section-title">Create gallery</h2>
          <div className="grid-2">
            <div className="field">
              <label htmlFor="gallery-title">Title</label>
              <input id="gallery-title" name="title" required />
            </div>
            <div className="field">
              <label htmlFor="gallery-slug">Slug</label>
              <input id="gallery-slug" name="slug" placeholder="spring-portraits" />
            </div>
          </div>
          <div className="grid-3">
            <div className="field">
              <label htmlFor="gallery-status">Status</label>
              <select id="gallery-status" name="status" defaultValue={PortfolioGalleryStatus.DRAFT}>
                {Object.values(PortfolioGalleryStatus).map((status) => (
                  <option key={status} value={status}>
                    {enumLabel(status)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="gallery-visibility">Visibility</label>
              <select id="gallery-visibility" name="visibility" defaultValue={PortfolioGalleryVisibility.PUBLIC}>
                {Object.values(PortfolioGalleryVisibility).map((visibility) => (
                  <option key={visibility} value={visibility}>
                    {enumLabel(visibility)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="gallery-sort">Sort order</label>
              <input id="gallery-sort" name="sortOrder" type="number" defaultValue="0" />
            </div>
          </div>
          <div className="field">
            <label htmlFor="gallery-layout">Layout</label>
            <select id="gallery-layout" name="layout" defaultValue={PortfolioGalleryLayout.GRID}>
              {Object.values(PortfolioGalleryLayout).map((layout) => (
                <option key={layout} value={layout}>
                  {enumLabel(layout)}
                </option>
              ))}
            </select>
          </div>
          <div className="grid-3">
            <div className="field">
              <label htmlFor="gallery-category">Category</label>
              <input id="gallery-category" name="category" placeholder="Portraits" />
            </div>
            <div className="field">
              <label htmlFor="gallery-location">Location</label>
              <input id="gallery-location" name="location" />
            </div>
            <div className="field">
              <label htmlFor="gallery-shot-at">Shoot date</label>
              <input id="gallery-shot-at" name="shotAt" type="date" />
            </div>
          </div>
          <div className="field">
            <label htmlFor="gallery-description">Description</label>
            <textarea id="gallery-description" name="description" />
          </div>
          <div className="field">
            <label htmlFor="gallery-cover">Cover image URL</label>
            <input id="gallery-cover" name="coverImageUrl" placeholder="/hero.svg" />
          </div>
          <div className="grid-2">
            <label style={{ alignItems: "center", display: "flex", gap: 8 }}>
              <input name="proofingEnabled" type="checkbox" defaultChecked />
              Proofing enabled
            </label>
            <label style={{ alignItems: "center", display: "flex", gap: 8 }}>
              <input name="downloadEnabled" type="checkbox" />
              Downloads enabled
            </label>
          </div>
          <div className="field">
            <label htmlFor="gallery-access-code">Password access code</label>
            <input id="gallery-access-code" name="accessCode" type="password" />
          </div>
          <div className="field">
            <label htmlFor="gallery-rights">Rights notes</label>
            <textarea id="gallery-rights" name="rightsNotes" />
          </div>
          <div className="grid-2">
            <div className="field">
              <label htmlFor="gallery-seo-title">SEO title</label>
              <input id="gallery-seo-title" name="seoTitle" />
            </div>
            <div className="field">
              <label htmlFor="gallery-seo-description">SEO description</label>
              <input id="gallery-seo-description" name="seoDescription" />
            </div>
          </div>
          <button className="button" type="submit">
            <ImageIcon size={18} />
            Create gallery
          </button>
        </form>

        <div className="card stack">
          <h2 className="section-title">Gallery queue</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Gallery</th>
                <th>Assets</th>
                <th>State</th>
              </tr>
            </thead>
            <tbody>
              {galleries.map((gallery) => (
                <tr key={gallery.id}>
                  <td>
                    <a href={`/admin/modules/portfolio?gallery=${gallery.id}`}>{gallery.title}</a>
                    <br />
                    <span className="muted-text">
                      {gallery.slug} {gallery.category ? `- ${gallery.category}` : ""}
                    </span>
                  </td>
                  <td>
                    {gallery._count.items} items
                    <br />
                    <span className="muted-text">{gallery._count.accesses} access links</span>
                  </td>
                  <td>
                    <span className={galleryStatusClass(gallery.status)}>{enumLabel(gallery.status)}</span>
                  </td>
                </tr>
              ))}
              {!galleries.length ? (
                <tr>
                  <td colSpan={3}>No galleries yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {selectedGallery ? (
        <section className="grid-2">
          <div className="card stack">
            <div className="page-header compact-header">
              <div>
                <h2 className="section-title">{selectedGallery.title}</h2>
                <p>
                  {enumLabel(selectedGallery.visibility)} gallery with {selectedGallery.items.length} of {itemCount} portfolio items
                </p>
              </div>
              <span className={galleryStatusClass(selectedGallery.status)}>{enumLabel(selectedGallery.status)}</span>
            </div>
            <div
              aria-label={selectedGallery.title}
              role="img"
              style={{
                aspectRatio: "16 / 9",
                backgroundColor: "var(--panel)",
                backgroundImage: cssBackgroundImage(selectedGallery.coverImageUrl || selectedGallery.items[0]?.imageUrl || ""),
                backgroundPosition: "center",
                backgroundSize: "cover",
                border: "1px solid var(--line)",
                borderRadius: "var(--radius)"
              }}
            />
            <table className="table">
              <tbody>
                <tr>
                  <td>Slug</td>
                  <td>
                    {selectedGallery.slug}
                    {selectedGallery.status === PortfolioGalleryStatus.PUBLISHED ? (
                      <>
                        <br />
                        <a href={`/galleries/${selectedGallery.slug}`} style={{ color: "var(--primary-dark)" }}>
                          Open public gallery
                        </a>
                      </>
                    ) : null}
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
                    {latestProofRound ? (
                      <>
                        <br />
                        <span className="muted-text">
                          Round {latestProofRound.roundNumber} - {enumLabel(latestProofRound.status)}
                        </span>
                      </>
                    ) : null}
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
            </table>
            <form action={updatePortfolioGalleryLayoutAction} className="form-grid">
              <input type="hidden" name="id" value={selectedGallery.id} />
              <div className="field">
                <label htmlFor={`gallery-${selectedGallery.id}-layout`}>Gallery layout</label>
                <select id={`gallery-${selectedGallery.id}-layout`} name="layout" defaultValue={selectedGallery.layout}>
                  {Object.values(PortfolioGalleryLayout).map((layout) => (
                    <option key={layout} value={layout}>
                      {enumLabel(layout)}
                    </option>
                  ))}
                </select>
              </div>
              <button className="button secondary" type="submit">
                Save layout
              </button>
            </form>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {[PortfolioGalleryStatus.PUBLISHED, PortfolioGalleryStatus.DRAFT, PortfolioGalleryStatus.ARCHIVED].map((status) => (
                <form action={updatePortfolioGalleryStatusAction} className="stack" key={status} style={{ gap: 6 }}>
                  <input type="hidden" name="id" value={selectedGallery.id} />
                  <input type="hidden" name="status" value={status} />
                  {status === PortfolioGalleryStatus.ARCHIVED ? (
                    <label style={{ alignItems: "center", display: "flex", gap: 6 }}>
                      <input name="confirmArchive" type="checkbox" />
                      Confirm archive
                    </label>
                  ) : null}
                  <button className="button secondary" type="submit">
                    Mark {enumLabel(status)}
                  </button>
                </form>
              ))}
            </div>
          </div>

          <form action={addPortfolioGalleryItemAction} className="card form-grid">
            <input type="hidden" name="galleryId" value={selectedGallery.id} />
            <h2 className="section-title">Add image or delivery item</h2>
            <div className="grid-2">
              <div className="field">
                <label htmlFor="item-media">Uploaded media</label>
                <select id="item-media" name="mediaAssetId" defaultValue="">
                  <option value="">Use a URL instead</option>
                  {mediaAssets.map((asset) => (
                    <option key={asset.id} value={asset.id}>
                      {asset.filename}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="item-type">Type</label>
                <select id="item-type" name="type" defaultValue={PortfolioItemType.IMAGE}>
                  {Object.values(PortfolioItemType).map((type) => (
                    <option key={type} value={type}>
                      {enumLabel(type)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="field">
              <label htmlFor="item-url">Image or file URL</label>
              <input id="item-url" name="imageUrl" placeholder="/hero.svg" />
            </div>
            <div className="grid-2">
              <div className="field">
                <label htmlFor="item-title">Title</label>
                <input id="item-title" name="title" />
              </div>
              <div className="field">
                <label htmlFor="item-sort">Sort order</label>
                <input id="item-sort" name="sortOrder" type="number" defaultValue={selectedGallery.items.length * 10 + 10} />
              </div>
            </div>
            <div className="field">
              <label htmlFor="item-alt">Alt text</label>
              <input id="item-alt" name="altText" />
            </div>
            <div className="field">
              <label htmlFor="item-caption">Caption</label>
              <textarea id="item-caption" name="caption" />
            </div>
            <div className="grid-3">
              <label style={{ alignItems: "center", display: "flex", gap: 8 }}>
                <input name="isCover" type="checkbox" />
                Use as cover
              </label>
              <label style={{ alignItems: "center", display: "flex", gap: 8 }}>
                <input name="isDownloadable" type="checkbox" />
                Downloadable
              </label>
              <label style={{ alignItems: "center", display: "flex", gap: 8 }}>
                <input name="isWatermarked" type="checkbox" defaultChecked />
                Watermarked
              </label>
            </div>
            <div className="field">
              <label htmlFor="item-license">License notes</label>
              <input id="item-license" name="licenseNotes" />
            </div>
            <button className="button secondary" type="submit">
              Add item
            </button>
          </form>
        </section>
      ) : null}

      {selectedGallery ? (
        <section className="grid-2">
          <form action={createPortfolioProofRoundAction} className="card form-grid">
            <input type="hidden" name="galleryId" value={selectedGallery.id} />
            <h2 className="section-title">Start revision round</h2>
            <div className="grid-2">
              <div className="field">
                <label htmlFor="round-title">Title</label>
                <input id="round-title" name="title" placeholder={`Round ${(latestProofRound?.roundNumber || 0) + 1}`} />
              </div>
              <div className="field">
                <label htmlFor="round-due">Due date</label>
                <input id="round-due" name="dueAt" type="date" />
              </div>
            </div>
            <div className="field">
              <label htmlFor="round-instructions">Instructions</label>
              <textarea id="round-instructions" name="instructions" />
            </div>
            <button className="button secondary" type="submit">
              <RotateCcw size={16} />
              Start round
            </button>
          </form>

          <div className="card stack">
            <h2 className="section-title">Proofing rounds</h2>
            <table className="table">
              <thead>
                <tr>
                  <th>Round</th>
                  <th>Activity</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {selectedGallery.proofRounds.map((round) => (
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
                      <span className={round.status === PortfolioProofRoundStatus.OPEN ? "pill success" : "pill"}>
                        {enumLabel(round.status)}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {[PortfolioProofRoundStatus.LOCKED, PortfolioProofRoundStatus.CHANGES_REQUESTED, PortfolioProofRoundStatus.APPROVED].map(
                          (status) => (
                            <form action={updatePortfolioProofRoundStatusAction} className="stack" key={status} style={{ gap: 6 }}>
                              <input type="hidden" name="id" value={round.id} />
                              <input type="hidden" name="status" value={status} />
                              <label style={{ alignItems: "center", display: "flex", gap: 6 }}>
                                <input name="confirmTransition" type="checkbox" />
                                Confirm {enumLabel(status).toLowerCase()}
                              </label>
                              <button className="button secondary" type="submit">
                                Mark {enumLabel(status)}
                              </button>
                            </form>
                          )
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {!selectedGallery.proofRounds.length ? (
                  <tr>
                    <td colSpan={4}>No proofing rounds yet.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {selectedGallery ? (
        <section className="grid-2">
          <div className="card stack">
            <h2 className="section-title">Gallery items</h2>
            <div className="grid-3">
              {selectedGallery.items.map((item) => (
                <div className="asset-tile" key={item.id}>
                  <div
                    aria-label={item.altText || item.title || "Portfolio item"}
                    role="img"
                    style={{
                      aspectRatio: "4 / 3",
                      backgroundColor: "var(--panel)",
                      backgroundImage: cssBackgroundImage(item.thumbnailUrl || item.imageUrl),
                      backgroundPosition: "center",
                      backgroundSize: "cover",
                      borderRadius: "var(--radius)"
                    }}
                  />
                  <div>
                    <strong>{item.title || item.imageUrl}</strong>
                    <p style={{ color: "var(--muted)", margin: "4px 0 0" }}>
                      {item.caption || enumLabel(item.type)}
                      {item.isCover ? " - cover" : ""}
                    </p>
                  </div>
                </div>
              ))}
              {!selectedGallery.items.length ? <p className="empty-state">No gallery items yet.</p> : null}
            </div>
          </div>

          <div className="card stack">
            <h2 className="section-title">Recent favorites</h2>
            <table className="table">
              <thead>
                <tr>
                  <th>Viewer</th>
                  <th>Notes</th>
                  <th>Saved</th>
                </tr>
              </thead>
              <tbody>
                {selectedGallery.favorites.map((favorite) => (
                  <tr key={favorite.id}>
                    <td>{favorite.viewerEmail || favorite.clientId || "Anonymous"}</td>
                    <td>{favorite.notes || favorite.itemId}</td>
                    <td>{formatDateTime(favorite.createdAt, settings.timezone)}</td>
                  </tr>
                ))}
                {!selectedGallery.favorites.length ? (
                  <tr>
                    <td colSpan={3}>No favorites yet.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {selectedGallery ? (
        <section className="grid-2">
          <div className="card stack">
            <h2 className="section-title">Proof decisions and comments</h2>
            {!latestProofRound ? <p className="empty-state">No proofing round selected.</p> : null}
            {latestProofRound ? (
              <table className="table">
                <thead>
                  <tr>
                    <th>Image</th>
                    <th>Viewer</th>
                    <th>Decision</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {latestProofRound.decisions.map((decision) => (
                    <tr key={decision.id}>
                      <td>{decision.item?.title || decision.item?.imageUrl || decision.itemId}</td>
                      <td>{decision.viewerEmail || decision.clientId || "Anonymous"}</td>
                      <td>{enumLabel(decision.status)}</td>
                      <td>{decision.notes || "-"}</td>
                    </tr>
                  ))}
                  {!latestProofRound.decisions.length ? (
                    <tr>
                      <td colSpan={4}>No image decisions yet.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            ) : null}
            {latestProofRound?.comments.length ? (
              <div className="stack">
                <h3>Recent proof comments</h3>
                {latestProofRound.comments.slice(0, 8).map((comment) => (
                  <div className="subpanel" key={comment.id}>
                    <strong>{comment.item?.title || comment.item?.imageUrl || "Round comment"}</strong>
                    <p style={{ margin: "6px 0" }}>{comment.body}</p>
                    <small className="muted-text">
                      {comment.authorName || comment.viewerEmail || "Viewer"} - {formatDateTime(comment.createdAt, settings.timezone)}
                    </small>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <div className="card stack">
            <h2 className="section-title">Selected image export</h2>
            <textarea
              readOnly
              rows={Math.max(6, Math.min(14, selectedImageExport.length + 1))}
              value={selectedImageExport.map((entry) => `${entry.source},${entry.viewer},${entry.item}`).join("\n")}
            />
            <div className="subpanel stack">
              <h3>Delivery bundle</h3>
              <p style={{ color: "var(--muted)" }}>
                {selectedDownloadableCount} media-backed downloadable item{selectedDownloadableCount === 1 ? "" : "s"} ready for a ZIP delivery bundle.
              </p>
              {selectedGallery.downloadEnabled && selectedDownloadableCount ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {selectedGallery.visibility === PortfolioGalleryVisibility.PUBLIC ? (
                    <a className="button secondary" href={`/galleries/${selectedGallery.slug}/bundle`}>
                      <Download size={16} />
                      Public bundle
                    </a>
                  ) : null}
                  {selectedGallery.accesses
                    .filter((access) => access.status === PortfolioAccessStatus.ACTIVE)
                    .slice(0, 4)
                    .map((access) => (
                      <a className="button secondary" href={`/galleries/${selectedGallery.slug}/bundle?access=${access.accessToken}`} key={access.id}>
                        <Download size={16} />
                        {access.recipientEmail}
                      </a>
                    ))}
                </div>
              ) : (
                <p style={{ color: "var(--muted)" }}>Enable gallery downloads and mark media-backed items downloadable to create a bundle.</p>
              )}
            </div>
            <div className="stack">
              <h3>Round responses</h3>
              {latestProofRound?.approvals.map((approval) => (
                <div className="subpanel" key={approval.id}>
                  <strong>{enumLabel(approval.status)}</strong>
                  <p style={{ margin: "6px 0" }}>{approval.notes || "-"}</p>
                  <small className="muted-text">
                    {approval.approverName || approval.viewerEmail || "Viewer"} - {formatDateTime(approval.createdAt, settings.timezone)}
                  </small>
                </div>
              ))}
              {!latestProofRound?.approvals.length ? <p className="empty-state">No round responses yet.</p> : null}
            </div>
          </div>
        </section>
      ) : null}

      {selectedGallery ? (
        <section className="grid-2">
          <form action={createPortfolioAccessAction} className="card form-grid">
            <input type="hidden" name="galleryId" value={selectedGallery.id} />
            <h2 className="section-title">Create private access</h2>
            <div className="grid-2">
              <div className="field">
                <label htmlFor="access-client">Client</label>
                <select id="access-client" name="clientId" defaultValue="">
                  <option value="">No linked client</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.name} ({client.email})
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="access-email">Recipient email</label>
                <input id="access-email" name="recipientEmail" type="email" required />
              </div>
            </div>
            <div className="grid-2">
              <div className="field">
                <label htmlFor="access-token">Access token</label>
                <input id="access-token" name="accessToken" placeholder="Generated if blank" />
              </div>
              <div className="field">
                <label htmlFor="access-expires">Expires</label>
                <input id="access-expires" name="expiresAt" type="date" />
              </div>
            </div>
            <button className="button secondary" type="submit">
              Create access
            </button>
          </form>

          <div className="card stack">
            <h2 className="section-title">Access links</h2>
            <table className="table">
              <thead>
                <tr>
                  <th>Recipient</th>
                  <th>Token</th>
                  <th>State</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {selectedGallery.accesses.map((access) => (
                  <tr key={access.id}>
                    <td>
                      {access.recipientEmail}
                      <br />
                      <span className="muted-text">
                        {access.expiresAt ? `Expires ${formatDateTime(access.expiresAt, settings.timezone)}` : "No expiry"}
                      </span>
                    </td>
                    <td>
                      <a href={`/galleries/access/${access.accessToken}`} style={{ color: "var(--primary-dark)" }}>
                        Open access route
                      </a>
                      <br />
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
                          value={access.status === PortfolioAccessStatus.ACTIVE ? PortfolioAccessStatus.REVOKED : PortfolioAccessStatus.ACTIVE}
                        />
                        <button className="button secondary" type="submit">
                          {access.status === PortfolioAccessStatus.ACTIVE ? "Revoke" : "Reactivate"}
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
                {!selectedGallery.accesses.length ? (
                  <tr>
                    <td colSpan={4}>No private access links yet.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
