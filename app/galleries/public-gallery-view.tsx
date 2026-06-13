import Link from "next/link";
import { Download, Heart, LockKeyhole } from "lucide-react";
import { FormAttachmentTargetType, PortfolioGalleryLayout, PortfolioGalleryStatus, PortfolioGalleryVisibility } from "@prisma/client";
import { cssBackgroundImage } from "@/lib/css";
import { emitModuleEvent, requestAttribution } from "@/lib/events/emit";
import { getPublicFormAttachments, publicFormAttachmentHref } from "@/lib/forms/attachments";
import { findActiveGalleryAccess, markGalleryAccessViewed } from "@/lib/portfolio/access";
import { prisma } from "@/lib/prisma";
import { getSiteSettings } from "@/lib/site";
import { themeToCssVars } from "@/lib/theme/tokens";
import { PublicGalleryLightbox } from "./public-gallery-lightbox";
import { favoriteGalleryItemAction } from "@/modules/portfolio/public-actions";

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

function galleryMediaPath(slug: string, itemId: string, accessToken: string, download = false) {
  const params = new URLSearchParams();
  if (accessToken) params.set("access", accessToken);
  if (download) params.set("download", "1");
  const query = params.toString();

  return `/galleries/${encodeURIComponent(slug)}/media/${encodeURIComponent(itemId)}${query ? `?${query}` : ""}`;
}

function galleryItemSource(item: GalleryMediaItem, slug: string, accessToken: string) {
  if (item.mediaAssetId) return galleryMediaPath(slug, item.id, accessToken);

  return item.thumbnailUrl || item.imageUrl || "/hero.svg";
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
  if (item.mediaAssetId) return galleryMediaPath(slug, item.id, accessToken, true);
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
          <h1 style={{ fontSize: "2.5rem" }}>Private gallery</h1>
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
  const favorited = firstParam(searchParams, "favorited");
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
          </div>
        </div>
      </section>

      <section className="section public-gallery-section">
        {favorited ? <div className="success-message">Favorite saved.</div> : null}
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

        <div
          aria-label={`${gallery.layout.toLowerCase().replaceAll("_", " ")} gallery layout`}
          className={galleryLayoutClass(gallery.layout)}
          id="gallery-grid"
        >
          {visibleItems.map((item) => {
            const isFavorited = favoriteItemIds.has(item.id) || favorited === item.id;
            const imageSrc = galleryItemSource(item, gallery.slug, queryAccessToken);
            const downloadHref = galleryDownloadHref(item, gallery.slug, queryAccessToken, gallery.visibility);
            const previousItem = visibleItems[index - 1] || visibleItems[visibleItems.length - 1];
            const nextItem = visibleItems[index + 1] || visibleItems[0];
            const itemAlt = safeAlt(item);

            return (
              <article className="public-gallery-item" key={item.id}>
                <PublicGalleryLightbox
                  alt={itemAlt}
                  caption={item.caption}
                  fullImageSrc={imageSrc}
                  height={900}
                  itemId={item.id}
                  nextItemId={nextItem.id}
                  positionLabel={`${index + 1} / ${visibleItems.length}`}
                  previousItemId={previousItem.id}
                  thumbnailSrc={imageSrc}
                  title={item.title || gallery.title}
                  width={1200}
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
