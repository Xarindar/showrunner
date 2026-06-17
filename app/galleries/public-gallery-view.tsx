import Link from "next/link";
import NextImage from "next/image";
import { CheckCircle2, Download, Heart, LockKeyhole, MessageSquare } from "lucide-react";
import {
  FormAttachmentTargetType,
  MediaVariantType,
  PortfolioGalleryLayout,
  PortfolioGalleryStatus,
  PortfolioGalleryVisibility,
  PortfolioProofApprovalStatus,
  PortfolioProofItemStatus,
  PortfolioProofRoundStatus
} from "@prisma/client";
import { cssBackgroundImage } from "@/lib/css";
import { emitModuleEvent, requestAttribution } from "@/lib/events/emit";
import { enumLabel, formatDateTime } from "@/lib/format";
import { getPublicFormAttachments, publicFormAttachmentHref } from "@/lib/forms/attachments";
import { findActiveGalleryAccess, markGalleryAccessViewed } from "@/lib/portfolio/access";
import { prisma } from "@/lib/prisma";
import { getSiteSettings } from "@/lib/site";
import { themeToCssVars } from "@/lib/theme/tokens";
import { PublicGalleryLightbox } from "./public-gallery-lightbox";
import {
  commentOnGalleryItemAction,
  favoriteGalleryItemAction,
  saveGalleryItemDecisionAction,
  submitGalleryApprovalAction
} from "@/modules/portfolio/public-actions";

type GallerySearchParams = Record<string, string | string[] | undefined>;

type PublicGalleryViewProps = {
  accessToken?: string;
  searchParams?: GallerySearchParams;
  slug?: string;
};

function firstParam(searchParams: GallerySearchParams | undefined, key: string) {
  const value = searchParams?.[key];
  return Array.isArray(value) ? value[0] || "" : value || "";
}

function safeAlt(item: { altText: string; title: string; caption: string }) {
  return item.altText || item.title || item.caption || "Gallery image";
}

type GalleryMediaItem = {
  id: string;
  imageUrl: string;
  mediaAssetId: string | null;
  thumbnailUrl: string;
};

function galleryMediaPath(slug: string, itemId: string, accessToken: string, variant: MediaVariantType, download = false) {
  const params = new URLSearchParams();
  if (accessToken) params.set("access", accessToken);
  if (download) params.set("download", "1");
  params.set("variant", variant);
  const query = params.toString();

  return `/galleries/${encodeURIComponent(slug)}/media/${encodeURIComponent(itemId)}${query ? `?${query}` : ""}`;
}

function galleryBundlePath(slug: string, accessToken: string) {
  const params = new URLSearchParams();
  if (accessToken) params.set("access", accessToken);
  const query = params.toString();

  return `/galleries/${encodeURIComponent(slug)}/bundle${query ? `?${query}` : ""}`;
}

function galleryItemSource(item: GalleryMediaItem, slug: string, accessToken: string) {
  if (item.mediaAssetId) return galleryMediaPath(slug, item.id, accessToken, MediaVariantType.CARD);

  return item.thumbnailUrl || item.imageUrl || "/hero.svg";
}

function galleryItemHeroSource(item: GalleryMediaItem, slug: string, accessToken: string) {
  if (item.mediaAssetId) return galleryMediaPath(slug, item.id, accessToken, MediaVariantType.HERO);

  return item.imageUrl || item.thumbnailUrl || "/hero.svg";
}

function galleryItemFullSource(item: GalleryMediaItem, slug: string, accessToken: string) {
  if (item.mediaAssetId) return galleryMediaPath(slug, item.id, accessToken, MediaVariantType.FULL);

  return item.imageUrl || item.thumbnailUrl || "/hero.svg";
}

function galleryLayoutClass(layout: PortfolioGalleryLayout) {
  return `public-gallery-grid public-gallery-layout-${layout.toLowerCase().replaceAll("_", "-")}`;
}

function galleryDownloadHref(
  item: GalleryMediaItem,
  slug: string,
  accessToken: string,
  visibility: PortfolioGalleryVisibility
) {
  if (item.mediaAssetId) return galleryMediaPath(slug, item.id, accessToken, MediaVariantType.DOWNLOAD, true);
  if (visibility === PortfolioGalleryVisibility.PUBLIC) return item.imageUrl;

  return "";
}

function lockedGallery(settings: Awaited<ReturnType<typeof getSiteSettings>>) {
  return (
    <main className="site-shell" style={themeToCssVars(settings)}>
      <nav className="site-nav">
        <Link href="/" className="brand">
          <span className="brand-mark" />
          <span>{settings.businessName}</span>
        </Link>
        <div className="site-nav-links">
          <Link href="/" className="button secondary">
            Home
          </Link>
        </div>
      </nav>
      <section className="section" style={{ maxWidth: 760 }}>
        <div className="card" style={{ minHeight: 260 }}>
          <LockKeyhole size={28} />
          <h1>Private gallery</h1>
          <p className="lead">Use an active gallery access link to view this collection.</p>
        </div>
      </section>
    </main>
  );
}

export async function PublicGalleryView({ accessToken = "", searchParams, slug }: PublicGalleryViewProps) {
  const settings = await getSiteSettings();
  if (!settings.enabledModuleIds.includes("portfolio")) return lockedGallery(settings);

  const queryAccessToken = accessToken || firstParam(searchParams, "access") || firstParam(searchParams, "token");
  const access = queryAccessToken ? await findActiveGalleryAccess(queryAccessToken, undefined, settings.siteId) : null;
  const gallerySlug = slug || access?.gallery.slug || "";
  const gallery = gallerySlug
    ? await prisma.portfolioGallery.findFirst({
        where: {
          siteId: settings.siteId,
          slug: gallerySlug,
          status: PortfolioGalleryStatus.PUBLISHED
        },
        include: {
          items: {
            orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
          }
        }
      })
    : null;

  if (!gallery) return lockedGallery(settings);
  if (gallery.visibility !== PortfolioGalleryVisibility.PUBLIC && access?.galleryId !== gallery.id) return lockedGallery(settings);

  if (access) {
    await markGalleryAccessViewed(access.id, settings.siteId);
  }

  const mediaIds = gallery.items.map((item) => item.mediaAssetId).filter((id): id is string => Boolean(id));
  const mediaAssets = mediaIds.length
    ? await prisma.mediaAsset.findMany({
        where: { siteId: settings.siteId, id: { in: mediaIds } },
        select: { deletedAt: true, id: true, isPrivate: true }
      })
    : [];
  const mediaById = new Map(mediaAssets.map((asset) => [asset.id, asset]));
  const visibleItems = gallery.items.filter((item) => {
    if (!item.mediaAssetId) return gallery.visibility === PortfolioGalleryVisibility.PUBLIC;
    const asset = mediaById.get(item.mediaAssetId);
    if (!asset) return false;
    if (asset?.deletedAt) return false;
    if (asset?.isPrivate && !access) return false;
    return true;
  });
  const favoriteViewerEmail = access?.recipientEmail || "";
  const favoriteItemIds = favoriteViewerEmail
    ? new Set(
        (
          await prisma.portfolioGalleryFavorite.findMany({
            where: {
              galleryId: gallery.id,
              viewerEmail: favoriteViewerEmail
            },
            select: { itemId: true }
          })
        ).map((favorite) => favorite.itemId)
      )
    : new Set<string>();
  const latestProofRound = gallery.proofingEnabled
    ? await prisma.portfolioProofRound.findFirst({
        where: {
          galleryId: gallery.id,
          siteId: settings.siteId
        },
        include: {
          approvals: { orderBy: { createdAt: "desc" }, take: 10 },
          comments: { orderBy: { createdAt: "desc" }, take: 50 },
          decisions: { orderBy: { updatedAt: "desc" }, take: 100 }
        },
        orderBy: { roundNumber: "desc" }
      })
    : null;
  const activeProofRound = latestProofRound?.status === PortfolioProofRoundStatus.OPEN ? latestProofRound : null;
  const canSubmitProofing = Boolean(access);
  const viewerDecisions = access
    ? new Map(latestProofRound?.decisions.filter((decision) => decision.accessId === access.id).map((decision) => [decision.itemId, decision]) || [])
    : new Map<string, NonNullable<typeof latestProofRound>["decisions"][number]>();
  const commentsByItem = new Map<string, NonNullable<typeof latestProofRound>["comments"]>();
  const roundComments: NonNullable<typeof latestProofRound>["comments"] = [];
  for (const comment of latestProofRound?.comments || []) {
    if (!comment.itemId) {
      roundComments.push(comment);
      continue;
    }

    const current = commentsByItem.get(comment.itemId) || [];
    commentsByItem.set(comment.itemId, [...current, comment]);
  }
  const canonicalPathname = `/galleries/${gallery.slug}`;
  const attribution = await requestAttribution(searchParams, canonicalPathname);

  await emitModuleEvent("gallery.viewed", {
    ...attribution,
    actorEmail: favoriteViewerEmail,
    metadata: {
      accessId: access?.id,
      gallerySlug: gallery.slug,
      galleryTitle: gallery.title,
      visibility: gallery.visibility
    },
    dedupeWindowMinutes: 30,
    relatedId: gallery.id,
    relatedType: "portfolio_gallery"
  });

  const firstVisibleImage = visibleItems[0] ? galleryItemSource(visibleItems[0], gallery.slug, queryAccessToken) : "";
  const coverImage =
    gallery.visibility === PortfolioGalleryVisibility.PUBLIC
      ? gallery.coverImageUrl || firstVisibleImage || "/hero.svg"
      : firstVisibleImage || "/hero.svg";
  const featuredItems = visibleItems.slice(0, 6);
  const downloadableBundleCount = visibleItems.filter((item) => item.isDownloadable && item.mediaAssetId).length;
  const bundleHref = galleryBundlePath(gallery.slug, queryAccessToken);
  const favorited = firstParam(searchParams, "favorited");
  const commented = firstParam(searchParams, "commented");
  const decision = firstParam(searchParams, "decision");
  const approved = firstParam(searchParams, "approved");
  const error = firstParam(searchParams, "error");
  const galleryFormAttachments = await getPublicFormAttachments({
    siteId: settings.siteId,
    targetId: gallery.id,
    targetType: FormAttachmentTargetType.GALLERY
  });

  return (
    <main className="site-shell public-gallery-shell" style={themeToCssVars(settings)}>
      <nav className="site-nav">
        <Link href="/" className="brand">
          <span className="brand-mark" />
          <span>{settings.businessName}</span>
        </Link>
        <div className="site-nav-links">
          <Link href="/" className="button secondary">
            Home
          </Link>
        </div>
      </nav>

      <section className="public-gallery-hero" style={{ backgroundImage: cssBackgroundImage(coverImage) }}>
        <div>
          <p className="eyebrow">{gallery.category || "Gallery"}</p>
          <h1>{gallery.title}</h1>
          {gallery.description ? <p className="lead">{gallery.description}</p> : null}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 20 }}>
            {gallery.proofingEnabled ? <span className="pill success">proofing open</span> : null}
            {gallery.downloadEnabled ? <span className="pill">downloads enabled</span> : null}
            {access ? <span className="pill">private access</span> : null}
            {latestProofRound ? <span className="pill">proof round {latestProofRound.roundNumber}</span> : null}
          </div>
          {gallery.downloadEnabled && downloadableBundleCount ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 16 }}>
              <a className="button" href={bundleHref}>
                <Download size={16} />
                Download bundle
              </a>
              <span style={{ alignSelf: "center", color: "rgba(255, 255, 255, 0.84)" }}>
                {downloadableBundleCount} file{downloadableBundleCount === 1 ? "" : "s"}
              </span>
            </div>
          ) : null}
        </div>
      </section>

      <section className="section public-gallery-section">
        {favorited ? <div className="success-message">Favorite saved.</div> : null}
        {commented ? <div className="success-message">Comment saved.</div> : null}
        {decision ? <div className="success-message">Image decision saved.</div> : null}
        {approved ? <div className="success-message">Proofing response submitted.</div> : null}
        {error ? <div className="error">{decodeURIComponent(error)}</div> : null}
        {galleryFormAttachments.length ? (
          <div className="subpanel" style={{ marginBottom: 18 }}>
            <div className="page-header" style={{ marginBottom: 12 }}>
              <div>
                <p className="eyebrow">Gallery forms</p>
                <h2 style={{ fontSize: "1.4rem" }}>Forms for this gallery</h2>
              </div>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              {galleryFormAttachments.map((attachment) => (
                <Link
                  className={attachment.isRequired ? "button" : "button secondary"}
                  href={publicFormAttachmentHref({
                    formSlug: attachment.form.slug,
                    targetId: attachment.targetId,
                    targetType: attachment.targetType
                  })}
                  key={attachment.id}
                >
                  {attachment.isRequired ? "Required: " : ""}
                  {attachment.form.name}
                </Link>
              ))}
            </div>
          </div>
        ) : null}

        {latestProofRound ? (
          <div className="subpanel" style={{ marginBottom: 18 }}>
            <div className="page-header" style={{ marginBottom: 12 }}>
              <div>
                <p className="eyebrow">Proofing round {latestProofRound.roundNumber}</p>
                <h2 style={{ fontSize: "1.4rem" }}>{latestProofRound.title || `Round ${latestProofRound.roundNumber}`}</h2>
                {latestProofRound.instructions ? <p>{latestProofRound.instructions}</p> : null}
                {latestProofRound.dueAt ? (
                  <p style={{ color: "var(--muted)", marginTop: 6 }}>
                    Due {formatDateTime(latestProofRound.dueAt, settings.timezone)}
                  </p>
                ) : null}
              </div>
              <span className={latestProofRound.status === PortfolioProofRoundStatus.OPEN ? "pill success" : "pill"}>
                {enumLabel(latestProofRound.status)}
              </span>
            </div>

            {activeProofRound && canSubmitProofing ? (
              <form action={submitGalleryApprovalAction} className="form-grid">
                <input type="hidden" name="galleryId" value={gallery.id} />
                <input type="hidden" name="roundId" value={activeProofRound.id} />
                <input type="hidden" name="slug" value={gallery.slug} />
                <input type="hidden" name="accessToken" value={queryAccessToken} />
                <input type="hidden" name="pathname" value={canonicalPathname} />
                <input
                  aria-hidden="true"
                  autoComplete="off"
                  name="companyWebsite"
                  style={{ display: "none" }}
                  tabIndex={-1}
                  type="text"
                />
                <div className="grid-3">
                  {favoriteViewerEmail ? (
                    <input type="hidden" name="viewerEmail" value={favoriteViewerEmail} />
                  ) : (
                    <div className="field">
                      <label htmlFor="proof-email">Email</label>
                      <input id="proof-email" name="viewerEmail" type="email" required />
                    </div>
                  )}
                  <div className="field">
                    <label htmlFor="proof-name">Name</label>
                    <input id="proof-name" name="approverName" />
                  </div>
                  <div className="field">
                    <label htmlFor="proof-status">Response</label>
                    <select id="proof-status" name="status" defaultValue={PortfolioProofApprovalStatus.APPROVED}>
                      {Object.values(PortfolioProofApprovalStatus).map((status) => (
                        <option key={status} value={status}>
                          {enumLabel(status)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="field">
                  <label htmlFor="proof-notes">Round notes</label>
                  <textarea id="proof-notes" name="notes" />
                </div>
                <label style={{ alignItems: "center", display: "flex", gap: 8 }}>
                  <input name="approvalConfirmed" type="checkbox" />
                  I approve this gallery for delivery or production.
                </label>
                <button className="button" type="submit">
                  <CheckCircle2 size={16} />
                  Submit response
                </button>
              </form>
            ) : activeProofRound ? (
              <p style={{ color: "var(--muted)" }}>Use an active gallery access link to submit proofing responses.</p>
            ) : (
              <p style={{ color: "var(--muted)" }}>This proofing round is closed.</p>
            )}

            {roundComments.length || latestProofRound.approvals.length ? (
              <div className="grid-2" style={{ marginTop: 16 }}>
                <div>
                  <h3>Round comments</h3>
                  {roundComments.slice(0, 4).map((comment) => (
                    <p key={comment.id} style={{ margin: "8px 0" }}>
                      <strong>{comment.authorName || comment.viewerEmail || "Viewer"}:</strong> {comment.body}
                    </p>
                  ))}
                </div>
                <div>
                  <h3>Responses</h3>
                  {latestProofRound.approvals.map((approval) => (
                    <p key={approval.id} style={{ margin: "8px 0" }}>
                      <strong>{approval.approverName || approval.viewerEmail || "Viewer"}:</strong> {enumLabel(approval.status)}
                    </p>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {featuredItems.length ? (
          <div className="public-gallery-widgets" aria-label="Gallery widgets">
            <div className="public-gallery-widget public-gallery-widget-feature">
              <NextImage
                alt={safeAlt(featuredItems[0])}
                height={720}
                src={galleryItemHeroSource(featuredItems[0], gallery.slug, queryAccessToken)}
                sizes="(max-width: 860px) 100vw, 52vw"
                unoptimized
                width={1080}
              />
              <div>
                <p className="eyebrow">{gallery.category || "Featured"}</p>
                <h2>{featuredItems[0].title || gallery.title}</h2>
                <p>{featuredItems[0].caption || gallery.description || "Featured image from this collection."}</p>
              </div>
            </div>
            <div className="public-gallery-widget public-gallery-widget-strip" aria-label="Featured gallery strip">
              {featuredItems.map((item) => (
                <a href={`#lightbox-${item.id}`} key={item.id}>
                  <NextImage
                    alt={safeAlt(item)}
                    height={180}
                    src={galleryItemSource(item, gallery.slug, queryAccessToken)}
                    sizes="150px"
                    unoptimized
                    width={240}
                  />
                </a>
              ))}
            </div>
          </div>
        ) : null}

        <div className={galleryLayoutClass(gallery.layout)} id="gallery-grid" aria-label={`${enumLabel(gallery.layout)} gallery layout`}>
          {visibleItems.map((item, index) => {
            const isFavorited = favoriteItemIds.has(item.id) || favorited === item.id;
            const fullImageSrc = galleryItemFullSource(item, gallery.slug, queryAccessToken);
            const downloadHref = galleryDownloadHref(item, gallery.slug, queryAccessToken, gallery.visibility);
            const itemDecision = viewerDecisions.get(item.id);
            const itemComments = commentsByItem.get(item.id) || [];
            const previousItem = visibleItems[index - 1] || visibleItems[visibleItems.length - 1];
            const nextItem = visibleItems[index + 1] || visibleItems[0];
            const itemAlt = safeAlt(item);

            return (
              <article className="public-gallery-item" key={item.id}>
                <PublicGalleryLightbox
                  alt={itemAlt}
                  caption={item.caption}
                  fullImageSrc={fullImageSrc}
                  height={1200}
                  itemId={item.id}
                  nextItemId={nextItem.id}
                  positionLabel={`${index + 1} / ${visibleItems.length}`}
                  previousItemId={previousItem.id}
                  thumbnailSrc={galleryItemSource(item, gallery.slug, queryAccessToken)}
                  title={item.title || gallery.title}
                  width={1800}
                />
                <div className="public-gallery-item-body">
                  <div>
                    {item.title ? <h2>{item.title}</h2> : null}
                    {item.caption ? <p>{item.caption}</p> : null}
                    {item.licenseNotes ? <small>{item.licenseNotes}</small> : null}
                  </div>
                  <div className="public-gallery-actions">
                    {gallery.downloadEnabled && item.isDownloadable && downloadHref ? (
                      <a className="button secondary" href={downloadHref} download>
                        <Download size={16} />
                        Download
                      </a>
                    ) : null}
                    {gallery.proofingEnabled ? (
                      <details>
                        <summary className={isFavorited ? "button" : "button secondary"}>
                          <Heart size={16} />
                          {isFavorited ? "Favorited" : "Favorite"}
                        </summary>
                        <form action={favoriteGalleryItemAction} className="form-grid public-gallery-favorite-form">
                          <input type="hidden" name="galleryId" value={gallery.id} />
                          <input type="hidden" name="itemId" value={item.id} />
                          <input type="hidden" name="slug" value={gallery.slug} />
                          <input type="hidden" name="accessToken" value={queryAccessToken} />
                          <input type="hidden" name="pathname" value={canonicalPathname} />
                          <input
                            aria-hidden="true"
                            autoComplete="off"
                            name="companyWebsite"
                            style={{ display: "none" }}
                            tabIndex={-1}
                            type="text"
                          />
                          {favoriteViewerEmail ? (
                            <input type="hidden" name="viewerEmail" value={favoriteViewerEmail} />
                          ) : (
                            <div className="field">
                              <label htmlFor={`favorite-${item.id}-email`}>Email</label>
                              <input id={`favorite-${item.id}-email`} name="viewerEmail" type="email" required />
                            </div>
                          )}
                          <div className="field">
                            <label htmlFor={`favorite-${item.id}-notes`}>Notes</label>
                            <textarea id={`favorite-${item.id}-notes`} name="notes" />
                          </div>
                          <button className="button" type="submit">
                            <Heart size={16} />
                            Save favorite
                          </button>
                        </form>
                      </details>
                    ) : null}
                    {activeProofRound && canSubmitProofing ? (
                      <details>
                        <summary className="button secondary">
                          <MessageSquare size={16} />
                          Proof
                        </summary>
                        <div className="form-grid public-gallery-favorite-form">
                          <form action={saveGalleryItemDecisionAction} className="form-grid">
                            <input type="hidden" name="galleryId" value={gallery.id} />
                            <input type="hidden" name="roundId" value={activeProofRound.id} />
                            <input type="hidden" name="itemId" value={item.id} />
                            <input type="hidden" name="slug" value={gallery.slug} />
                            <input type="hidden" name="accessToken" value={queryAccessToken} />
                            <input type="hidden" name="pathname" value={canonicalPathname} />
                            <input
                              aria-hidden="true"
                              autoComplete="off"
                              name="companyWebsite"
                              style={{ display: "none" }}
                              tabIndex={-1}
                              type="text"
                            />
                            {favoriteViewerEmail ? (
                              <input type="hidden" name="viewerEmail" value={favoriteViewerEmail} />
                            ) : (
                              <div className="field">
                                <label htmlFor={`decision-${item.id}-email`}>Email</label>
                                <input id={`decision-${item.id}-email`} name="viewerEmail" type="email" required />
                              </div>
                            )}
                            <div className="field">
                              <label htmlFor={`decision-${item.id}-status`}>Decision</label>
                              <select
                                id={`decision-${item.id}-status`}
                                name="status"
                                defaultValue={itemDecision?.status || PortfolioProofItemStatus.APPROVED}
                              >
                                {Object.values(PortfolioProofItemStatus).map((status) => (
                                  <option key={status} value={status}>
                                    {enumLabel(status)}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="field">
                              <label htmlFor={`decision-${item.id}-notes`}>Decision notes</label>
                              <textarea id={`decision-${item.id}-notes`} name="notes" defaultValue={itemDecision?.notes || ""} />
                            </div>
                            <button className="button secondary" type="submit">
                              Save decision
                            </button>
                          </form>

                          <form action={commentOnGalleryItemAction} className="form-grid">
                            <input type="hidden" name="galleryId" value={gallery.id} />
                            <input type="hidden" name="roundId" value={activeProofRound.id} />
                            <input type="hidden" name="itemId" value={item.id} />
                            <input type="hidden" name="slug" value={gallery.slug} />
                            <input type="hidden" name="accessToken" value={queryAccessToken} />
                            <input type="hidden" name="pathname" value={canonicalPathname} />
                            <input
                              aria-hidden="true"
                              autoComplete="off"
                              name="companyWebsite"
                              style={{ display: "none" }}
                              tabIndex={-1}
                              type="text"
                            />
                            {favoriteViewerEmail ? (
                              <input type="hidden" name="viewerEmail" value={favoriteViewerEmail} />
                            ) : (
                              <div className="field">
                                <label htmlFor={`comment-${item.id}-email`}>Email</label>
                                <input id={`comment-${item.id}-email`} name="viewerEmail" type="email" required />
                              </div>
                            )}
                            <div className="field">
                              <label htmlFor={`comment-${item.id}-name`}>Name</label>
                              <input id={`comment-${item.id}-name`} name="authorName" />
                            </div>
                            <div className="field">
                              <label htmlFor={`comment-${item.id}-body`}>Comment</label>
                              <textarea id={`comment-${item.id}-body`} name="body" required />
                            </div>
                            <button className="button secondary" type="submit">
                              Save comment
                            </button>
                          </form>

                          {itemComments.length ? (
                            <div>
                              {itemComments.slice(0, 3).map((comment) => (
                                <p key={comment.id} style={{ margin: "8px 0" }}>
                                  <strong>{comment.authorName || comment.viewerEmail || "Viewer"}:</strong> {comment.body}
                                </p>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </details>
                    ) : activeProofRound ? (
                      <p style={{ color: "var(--muted)", fontSize: "0.95rem" }}>Use an access link to proof this image.</p>
                    ) : null}
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        {!visibleItems.length ? <p className="empty-state">No gallery images are available.</p> : null}
        {gallery.rightsNotes ? (
          <div className="subpanel" style={{ marginTop: 18 }}>
            <p>{gallery.rightsNotes}</p>
          </div>
        ) : null}
      </section>
    </main>
  );
}
