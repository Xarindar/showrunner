import Link from "next/link";
import { BookOpen, ChevronRight, Image as ImageIcon } from "lucide-react";
import { MediaVariantType, PortfolioGalleryLayout, PortfolioGalleryStatus, PortfolioGalleryVisibility, PortfolioItemType } from "@prisma/client";
import { getAccessibleGalleryWhere, getAccessibleMediaWhere, requireAdmin } from "@/lib/auth";
import { enumLabel, formatDateTime } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { getSiteSettings } from "@/lib/site";
import { mediaAssetDisplayUrl, mediaAssetIdFromUrl } from "@/lib/media";
import { Button, EqualGrid, Input, Select, SettingRow, SettingsCategory, SettingsGroup, Switch, Textarea } from "@/components/ui";
import { ModuleActionModals } from "@/components/ui/module-action-modals";
import { addPortfolioGalleryItemAction, createPortfolioGalleryAction, updatePortfolioGallerySettingsAction, updatePortfolioGalleryStatusAction } from "./actions";
import { AlbumPhotos } from "./album-photos";
import styles from "./albums.module.css";

export const dynamic = "force-dynamic";
type PortfolioPageProps = { searchParams: Promise<{ saved?: string; error?: string; gallery?: string }> };

export default async function PortfolioPage({ searchParams }: PortfolioPageProps) {
  const user = await requireAdmin("portfolio:manage");
  const [params, settings] = await Promise.all([searchParams, getSiteSettings()]);
  const galleryWhere = await getAccessibleGalleryWhere(user, settings.siteId, { visibility: PortfolioGalleryVisibility.PUBLIC });
  const mediaWhere = await getAccessibleMediaWhere(user, settings.siteId, { deletedAt: null, isPrivate: false, mimeType: { startsWith: "image/" } });
  const [galleries, mediaAssets] = await Promise.all([
    prisma.portfolioGallery.findMany({
      where: galleryWhere,
      include: {
        _count: { select: { items: { where: { type: PortfolioItemType.IMAGE } } } },
        items: { where: { type: PortfolioItemType.IMAGE }, orderBy: [{ isCover: "desc" }, { sortOrder: "asc" }], take: 1 }
      },
      orderBy: [{ status: "asc" }, { sortOrder: "asc" }, { updatedAt: "desc" }],
      take: 30
    }),
    prisma.mediaAsset.findMany({ where: mediaWhere, orderBy: { createdAt: "desc" }, take: 60 })
  ]);
  const selectedGallery = params.gallery ? await prisma.portfolioGallery.findFirst({
    where: await getAccessibleGalleryWhere(user, settings.siteId, { id: params.gallery, visibility: PortfolioGalleryVisibility.PUBLIC }),
    include: { items: { where: { type: PortfolioItemType.IMAGE }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] } }
  }) : null;
  const albumMediaIds = [...new Set([
    ...galleries.flatMap(gallery => [mediaAssetIdFromUrl(gallery.coverImageUrl), ...gallery.items.map(item => item.mediaAssetId)]),
    ...(selectedGallery?.items.map(item => item.mediaAssetId) || [])
  ].filter((id): id is string => Boolean(id)))];
  const albumMedia = albumMediaIds.length ? await prisma.mediaAsset.findMany({
    where: await getAccessibleMediaWhere(user, settings.siteId, { id: { in: albumMediaIds }, deletedAt: null })
  }) : [];
  const mediaById = new Map(albumMedia.map(asset => [asset.id, asset]));
  function itemUrl(item: { mediaAssetId: string | null; imageUrl: string }, type: MediaVariantType) {
    const asset = item.mediaAssetId ? mediaById.get(item.mediaAssetId) : null;
    return asset ? mediaAssetDisplayUrl(asset, type) : item.mediaAssetId ? "" : item.imageUrl;
  }
  function coverUrl(gallery: typeof galleries[number]) {
    const coverId = mediaAssetIdFromUrl(gallery.coverImageUrl);
    const asset = coverId ? mediaById.get(coverId) : null;
    if (coverId) return asset ? mediaAssetDisplayUrl(asset, MediaVariantType.CARD) : "";
    if (gallery.coverImageUrl && !gallery.coverImageUrl.startsWith("/galleries/")) return gallery.coverImageUrl;
    return gallery.items[0] ? itemUrl(gallery.items[0], MediaVariantType.CARD) : "";
  }
  const photos = (selectedGallery?.items || []).map(item => ({
    id: item.id, title: item.title, alt: item.altText || item.title || selectedGallery!.title,
    thumbnail: itemUrl(item, MediaVariantType.THUMBNAIL), largeThumbnail: itemUrl(item, MediaVariantType.CARD), url: itemUrl(item, MediaVariantType.FULL)
  })).filter(item => item.url);
  const savedMessage = params.saved ? "Album changes saved." : null;
  const errorMessage = params.error || null;
  const createGalleryForm = (
    <form action={createPortfolioGalleryAction} className="form-grid">
      <div className="ui-field"><label htmlFor="gallery-title">Album title</label><Input id="gallery-title" name="title" required maxLength={180} placeholder="A name for these moments" /></div>
      <p>Start with a title, then add your photos. New albums are saved as drafts.</p>
      <details className={styles.options}><summary>Album options</summary><div className="form-grid">
        <div className="ui-field"><label htmlFor="gallery-slug">Web address name</label><Input id="gallery-slug" name="slug" placeholder="Created from the title" /></div>
        <EqualGrid min="220px">
          <div className="ui-field"><label htmlFor="gallery-status">Status</label><Select id="gallery-status" name="status" defaultValue={PortfolioGalleryStatus.DRAFT}>{Object.values(PortfolioGalleryStatus).map(status => <option key={status} value={status}>{enumLabel(status)}</option>)}</Select></div>
          <div className="ui-field"><label htmlFor="gallery-sort">Sort order</label><Input id="gallery-sort" name="sortOrder" type="number" defaultValue="0" /></div>
        </EqualGrid>
        <div className="ui-field"><label htmlFor="gallery-layout">Layout</label><Select id="gallery-layout" name="layout" defaultValue={PortfolioGalleryLayout.GRID}>{Object.values(PortfolioGalleryLayout).map(layout => <option key={layout} value={layout}>{enumLabel(layout)}</option>)}</Select></div>
        <EqualGrid min="220px">
          <div className="ui-field"><label htmlFor="gallery-category">Category</label><Input id="gallery-category" name="category" placeholder="Portraits" /></div>
          <div className="ui-field"><label htmlFor="gallery-location">Location</label><Input id="gallery-location" name="location" /></div>
          <div className="ui-field"><label htmlFor="gallery-shot-at">Shoot date</label><Input id="gallery-shot-at" name="shotAt" type="date" /></div>
        </EqualGrid>
        <div className="ui-field"><label htmlFor="gallery-description">Description</label><Textarea id="gallery-description" name="description" /></div>
        <div className="ui-field"><label htmlFor="gallery-cover">Cover image URL</label><Input id="gallery-cover" name="coverImageUrl" placeholder="/hero.svg" /></div>
        <EqualGrid>
          <div className="ui-field"><label htmlFor="gallery-seo-title">SEO title</label><Input id="gallery-seo-title" name="seoTitle" /></div>
          <div className="ui-field"><label htmlFor="gallery-seo-description">SEO description</label><Input id="gallery-seo-description" name="seoDescription" /></div>
        </EqualGrid>
      </div></details>
      <div className="module-modal-actions"><Button type="submit"><ImageIcon size={18} />Create album</Button></div>
    </form>
  );

  return <div className={selectedGallery ? styles.galleryWorkspace : styles.workspace}>
    {!selectedGallery && <header className={styles.heading}>
      <div><h1>Photo albums</h1></div>
      <ModuleActionModals toolbarLabel="Album tools" items={[{ id: "album", label: "New album", title: "New photo album", icon: "plus", variant: "primary", content: createGalleryForm }]} />
    </header>}
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
    {selectedGallery && <AlbumPhotos key={selectedGallery.id} galleryId={selectedGallery.id} title={selectedGallery.title} status={selectedGallery.status} visibility={enumLabel(selectedGallery.visibility)} photos={photos}>
      <div className={styles.settingsScroll}>
        {errorMessage && <p className="error" role="alert">{errorMessage}</p>}
        {savedMessage && <p className="success-message" role="status">{savedMessage}</p>}
        <div className={styles.settingsList}>
          <form id="gallery-settings-form" action={updatePortfolioGallerySettingsAction} className="ui-settings-form">
            <input type="hidden" name="id" value={selectedGallery.id} />
            <SettingsCategory title="General"><SettingsGroup title="Album">
              <SettingRow title={<label htmlFor="album-title">Album title</label>}><Input id="album-title" name="title" defaultValue={selectedGallery.title} required maxLength={180} /></SettingRow>
              <SettingRow title={<label htmlFor="album-layout">Gallery layout</label>} description="The layout visitors see."><Select id="album-layout" name="layout" defaultValue={selectedGallery.layout}>{Object.values(PortfolioGalleryLayout).map(layout => <option key={layout} value={layout}>{enumLabel(layout)}</option>)}</Select></SettingRow>
              <SettingRow title="Published" description={selectedGallery.status === PortfolioGalleryStatus.ARCHIVED ? "Archived. Restore this album under Management." : "Show this gallery on the website."}><Switch aria-label="Published" name="published" defaultChecked={selectedGallery.status === PortfolioGalleryStatus.PUBLISHED} disabled={selectedGallery.status === PortfolioGalleryStatus.ARCHIVED} /></SettingRow>
            </SettingsGroup></SettingsCategory>
          </form>
          <SettingsCategory title="Management"><div className={styles.settingsTools}>
            <details name="gallery-tools" className={styles.settingsTool}><summary>Add image from media or URL<ChevronRight size={16} aria-hidden="true" /></summary><div>
              <form action={addPortfolioGalleryItemAction} className="form-grid">
                <input type="hidden" name="galleryId" value={selectedGallery.id} />
                <SettingRow title={<label htmlFor="item-media">Uploaded image</label>}><Select id="item-media" name="mediaAssetId" defaultValue=""><option value="">Use a URL instead</option>{mediaAssets.map(asset => <option key={asset.id} value={asset.id}>{asset.filename}</option>)}</Select></SettingRow>
                <SettingRow title={<label htmlFor="item-url">Image URL</label>}><Input id="item-url" name="imageUrl" placeholder="https://" /></SettingRow>
                <SettingRow title={<label htmlFor="item-title">Title</label>}><Input id="item-title" name="title" /></SettingRow>
                <SettingRow title={<label htmlFor="item-alt">Alt text</label>}><Input id="item-alt" name="altText" /></SettingRow>
                <SettingRow title={<label htmlFor="item-caption">Caption</label>}><Textarea id="item-caption" name="caption" /></SettingRow>
                <SettingRow title={<label htmlFor="item-sort">Sort order</label>}><Input id="item-sort" name="sortOrder" type="number" defaultValue={selectedGallery.items.length * 10 + 10} /></SettingRow>
                <SettingRow title="Use as cover"><Switch aria-label="Use as cover" name="isCover" /></SettingRow>
                <div className={styles.settingsActions}><Button size="sm" type="submit">Add image</Button></div>
              </form>
            </div></details>
            <details name="gallery-tools" className={styles.settingsTool}><summary>Gallery information<ChevronRight size={16} aria-hidden="true" /></summary><div>
              <SettingRow title="Slug">{selectedGallery.slug}</SettingRow>
              <SettingRow title="Last updated">{formatDateTime(selectedGallery.updatedAt, settings.timezone)}</SettingRow>
            </div></details>
            {selectedGallery.status !== PortfolioGalleryStatus.ARCHIVED ? <details name="gallery-tools" className={styles.settingsTool}><summary>Archive gallery<ChevronRight size={16} aria-hidden="true" /></summary><div>
              <form action={updatePortfolioGalleryStatusAction} className="form-grid">
                <input type="hidden" name="id" value={selectedGallery.id} /><input type="hidden" name="status" value={PortfolioGalleryStatus.ARCHIVED} />
                <SettingRow title="Confirm archive"><Switch aria-label="Confirm archive" name="confirmArchive" /></SettingRow>
                <div className={styles.settingsActions}><Button size="sm" type="submit" variant="danger">Archive gallery</Button></div>
              </form>
            </div></details> : <details name="gallery-tools" className={styles.settingsTool}><summary>Restore gallery<ChevronRight size={16} aria-hidden="true" /></summary><div>
              <form action={updatePortfolioGalleryStatusAction}>
                <input type="hidden" name="id" value={selectedGallery.id} /><input type="hidden" name="status" value={PortfolioGalleryStatus.DRAFT} />
                <SettingRow title="Archived gallery"><Button size="sm" type="submit" variant="secondary">Restore draft</Button></SettingRow>
              </form>
            </div></details>}
          </div></SettingsCategory>
        </div>
      </div>
      <div className={`ui-settings-footer ${styles.settingsFooter}`}><Button size="sm" type="submit" form="gallery-settings-form">Save gallery settings</Button></div>
    </AlbumPhotos>}
  </div>;
}
