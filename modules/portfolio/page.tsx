import { Camera, Image as ImageIcon, KeyRound, Star } from "lucide-react";
import {
  PortfolioAccessStatus,
  PortfolioGalleryStatus,
  PortfolioGalleryVisibility,
  PortfolioItemType
} from "@prisma/client";
import { cssBackgroundImage } from "@/lib/css";
import { enumLabel, formatDateTime } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { getSiteSettings } from "@/lib/site";
import {
  addPortfolioGalleryItemAction,
  createPortfolioAccessAction,
  createPortfolioGalleryAction,
  updatePortfolioAccessStatusAction,
  updatePortfolioGalleryStatusAction
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
  const [params, settings] = await Promise.all([searchParams, getSiteSettings()]);
  const [galleries, mediaAssets, clients, publishedCount, privateCount, itemCount, favoriteCount] = await Promise.all([
    prisma.portfolioGallery.findMany({
      include: { _count: { select: { items: true, accesses: true, favorites: true } } },
      orderBy: [{ status: "asc" }, { sortOrder: "asc" }, { updatedAt: "desc" }],
      take: 30
    }),
    prisma.mediaAsset.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 60
    }),
    prisma.client.findMany({
      orderBy: { updatedAt: "desc" },
      take: 50
    }),
    prisma.portfolioGallery.count({ where: { status: PortfolioGalleryStatus.PUBLISHED } }),
    prisma.portfolioGallery.count({
      where: { visibility: { in: [PortfolioGalleryVisibility.PRIVATE, PortfolioGalleryVisibility.PASSWORD] } }
    }),
    prisma.portfolioGalleryItem.count(),
    prisma.portfolioGalleryFavorite.count()
  ]);

  const selectedGalleryId = params.gallery || galleries[0]?.id;
  const selectedGallery = selectedGalleryId
    ? await prisma.portfolioGallery.findUnique({
        where: { id: selectedGalleryId },
        include: {
          items: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
          accesses: { orderBy: { createdAt: "desc" }, take: 20 },
          favorites: { orderBy: { createdAt: "desc" }, take: 20 }
        }
      })
    : null;
  const savedMessage = params.saved ? "Portfolio changes saved." : null;
  const errorMessage = params.error || null;

  return (
    <div className="stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">Portfolio</p>
          <h1 style={{ fontSize: "2.4rem" }}>Photography galleries and proofing</h1>
          <p>Create public or private galleries, organize image records, issue access links, and prepare proofing workflows.</p>
        </div>
      </header>

      {savedMessage ? <div className="success-message">{savedMessage}</div> : null}
      {errorMessage ? <div className="error">{errorMessage}</div> : null}

      <section className="grid-3">
        <div className="card">
          <Camera size={22} />
          <h3>{publishedCount} published galleries</h3>
          <p className="lead" style={{ fontSize: "0.95rem" }}>
            Portfolio collections ready for public gallery and campaign surfaces.
          </p>
        </div>
        <div className="card">
          <KeyRound size={22} />
          <h3>{privateCount} private galleries</h3>
          <p className="lead" style={{ fontSize: "0.95rem" }}>
            Password or private-link collections for proofing and client delivery.
          </p>
        </div>
        <div className="card">
          <Star size={22} />
          <h3>{favoriteCount} favorites</h3>
          <p className="lead" style={{ fontSize: "0.95rem" }}>
            Client selections captured for approval, delivery, and future print workflows.
          </p>
        </div>
      </section>

      <section className="grid-2">
        <form action={createPortfolioGalleryAction} className="card form-grid">
          <h2 style={{ fontSize: "1.35rem" }}>Create gallery</h2>
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
          <h2 style={{ fontSize: "1.35rem" }}>Gallery queue</h2>
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
                    <span style={{ color: "var(--muted)" }}>
                      {gallery.slug} {gallery.category ? `- ${gallery.category}` : ""}
                    </span>
                  </td>
                  <td>
                    {gallery._count.items} items
                    <br />
                    <span style={{ color: "var(--muted)" }}>{gallery._count.accesses} access links</span>
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
            <div className="page-header" style={{ marginBottom: 16 }}>
              <div>
                <h2 style={{ fontSize: "1.35rem" }}>{selectedGallery.title}</h2>
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
                  <td>Proofing</td>
                  <td>{selectedGallery.proofingEnabled ? "Enabled" : "Disabled"}</td>
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
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {[PortfolioGalleryStatus.PUBLISHED, PortfolioGalleryStatus.DRAFT, PortfolioGalleryStatus.ARCHIVED].map((status) => (
                <form action={updatePortfolioGalleryStatusAction} key={status}>
                  <input type="hidden" name="id" value={selectedGallery.id} />
                  <input type="hidden" name="status" value={status} />
                  <button className="button secondary" type="submit">
                    Mark {enumLabel(status)}
                  </button>
                </form>
              ))}
            </div>
          </div>

          <form action={addPortfolioGalleryItemAction} className="card form-grid">
            <input type="hidden" name="galleryId" value={selectedGallery.id} />
            <h2 style={{ fontSize: "1.35rem" }}>Add image or delivery item</h2>
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
          <div className="card stack">
            <h2 style={{ fontSize: "1.35rem" }}>Gallery items</h2>
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
            <h2 style={{ fontSize: "1.35rem" }}>Recent favorites</h2>
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
          <form action={createPortfolioAccessAction} className="card form-grid">
            <input type="hidden" name="galleryId" value={selectedGallery.id} />
            <h2 style={{ fontSize: "1.35rem" }}>Create private access</h2>
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
            <h2 style={{ fontSize: "1.35rem" }}>Access links</h2>
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
                      <span style={{ color: "var(--muted)" }}>
                        {access.expiresAt ? `Expires ${formatDateTime(access.expiresAt, settings.timezone)}` : "No expiry"}
                      </span>
                    </td>
                    <td>
                      <a href={`/galleries/access/${access.accessToken}`} style={{ color: "var(--primary-dark)" }}>
                        Open access route
                      </a>
                      <br />
                      <span style={{ color: "var(--muted)" }}>{access.accessToken}</span>
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
