import { BookingPhotoField } from "./components/booking-photo-field";
import { SessionTypeForm } from "./components/session-type-form";
import { SessionPackagesEditor } from "./components/session-packages-editor";
import { SessionDetailsForm, SessionDetailsSaveButton } from "./components/session-details-form";
import { readSessionOffering } from "@/lib/scheduling/session-offering";
import { hydrateSessionServiceLibrary } from "@/lib/scheduling/service-library-store";
import styles from "./service-editor.module.css";
import { catalogMediaUrl } from "@/lib/catalog-media-url";
import { contentWebsiteUrl, resolveContentManifest } from "@/clients/content-manifests";
import { notFound } from "next/navigation";
import { MediaVariantType, type Prisma } from "@prisma/client";
import { ArrowLeft, Boxes, Clock3, FileText } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { stringArrayCsv } from "@/lib/format";
import { isMediaUploadDriverConfigured, mediaAssetDisplayUrl } from "@/lib/media";
import { prisma } from "@/lib/prisma";
import { getSiteSettings } from "@/lib/site";
import { ButtonLink, Switch, type AssetPickerAsset } from "@/components/ui";
import { AdminMobileHeaderSlot } from "@/shell/admin-mobile-header";
import { attachServiceImageAction, removeServiceImageAction, uploadServiceImageAction } from "./actions";
import { ServiceBookingRulesTable } from "./components/service-booking-rules-table";
import { ServicePresetField } from "./components/service-preset-field";
import { ServiceWorkspaceTabs, type ServiceWorkspaceTab } from "./components/service-workspace-tabs";

type ServiceEditPageProps = {
  searchParams: Promise<{ error?: string; saved?: string; tab?: string }>;
  serviceId: string;
};

type ServiceWithBuilderData = Prisma.ServiceGetPayload<{
  include: {
    mediaAsset: true;
    packageItems: {
      include: {
        package: true;
      };
    };
  };
}>;

type ServiceTaxonomyOption = {
  category: string;
  intakePrompt: string | null;
  location: string | null;
  policyText: string | null;
};

function uniqueSortedStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))).sort((left, right) =>
    left.localeCompare(right)
  );
}

function serviceTags(service: ServiceWithBuilderData) {
  return stringArrayCsv(service.tags);
}

function serviceDurationLabel(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours} hr ${remainder} min` : `${hours} hr`;
}

function savedServiceMessage(saved?: string) {
  if (saved === "created") return "Session type saved.";
  if (saved === "media") return "Session type image updated.";
  if (saved === "service") return "Session type saved.";
  if (saved) return "Session type updated.";
  return null;
}

function serviceMediaUrl(service: ServiceWithBuilderData) {
  if (service.mediaAsset) return mediaAssetDisplayUrl(service.mediaAsset, MediaVariantType.CARD);
  return service.imageUrl || "";
}

function serviceStatusClass(isActive: boolean) {
  return isActive ? "ui-badge ui-badge-success" : "ui-badge";
}

function hiddenSchedulingValues(service: ServiceWithBuilderData) {
  return (
    <>
      <input name="bufferBeforeMinutes" type="hidden" value={service.bufferBeforeMinutes} />
      <input name="bufferAfterMinutes" type="hidden" value={service.bufferAfterMinutes} />
      <input name="minimumNoticeHours" type="hidden" value={service.minimumNoticeHours} />
      <input name="maxAdvanceDays" type="hidden" value={service.maxAdvanceDays} />
      <input name="slotIntervalMinutes" type="hidden" value={service.slotIntervalMinutes} />
    </>
  );
}

export default async function ServiceEditPage({ searchParams, serviceId }: ServiceEditPageProps) {
  await requireAdmin("scheduling:manage");
  const [params, settings] = await Promise.all([searchParams, getSiteSettings()]);
  const taxonomyServicesPromise = prisma.service.findMany({
    where: { siteId: settings.siteId, isOneOff: false },
    select: { category: true, intakePrompt: true, location: true, policyText: true }
  });
  const serviceCategoriesPromise = prisma.serviceCategory.findMany({
    where: { siteId: settings.siteId },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { name: true }
  });
  const intakeFormFieldsPromise = prisma.formField.findMany({
    where: {
      form: { siteId: settings.siteId },
      isHidden: false
    },
    select: { label: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }]
  });

  if (serviceId === "new") {
    const rules = await prisma.availabilityRule.findMany({ where: { siteId: settings.siteId, staffId: null, resourceId: null }, orderBy: [{ weekday: "asc" }, { startMinutes: "asc" }] });
    const timeLabel = (minutes: number) => `${Math.floor(minutes / 60).toString().padStart(2, "0")}:${(minutes % 60).toString().padStart(2, "0")}`;
    const businessHours = rules.map(rule => `${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][rule.weekday]} ${timeLabel(rule.startMinutes)}–${timeLabel(rule.endMinutes)}`);
    return <SessionTypeForm businessHours={businessHours} timezone={settings.timezone} />;
  }

  const [service, taxonomyServices, intakeFormFields, serviceCategories, mediaAssets] = await Promise.all([
    prisma.service.findFirst({
      where: { id: serviceId, siteId: settings.siteId },
      include: {
        mediaAsset: true,
        packageItems: {
          include: { package: true },
          orderBy: [{ package: { sortOrder: "asc" } }, { createdAt: "asc" }]
        }
      }
    }),
    taxonomyServicesPromise,
    intakeFormFieldsPromise,
    serviceCategoriesPromise,
    prisma.mediaAsset.findMany({
      where: { siteId: settings.siteId, deletedAt: null, isPrivate: false },
      orderBy: { createdAt: "desc" },
      take: 40
    })
  ]);

  if (!service) notFound();
  const offering = await hydrateSessionServiceLibrary(readSessionOffering(service.sessionOffering), settings.siteId);

  const categoryOptions = uniqueSortedStrings([...serviceCategories.map((category) => category.name), ...taxonomyServices.map((item: ServiceTaxonomyOption) => item.category)]);
  const intakeOptions = uniqueSortedStrings([...taxonomyServices.map((item: ServiceTaxonomyOption) => item.intakePrompt), ...intakeFormFields.map((field) => field.label)]);
  const policyOptions = uniqueSortedStrings(taxonomyServices.map((item: ServiceTaxonomyOption) => item.policyText));
  const savedMessage = savedServiceMessage(params.saved);
  const errorMessage = params.error ? decodeURIComponent(params.error) : null;
  const bookingPath = "Client booking rebuild pending";
  const tagsValue = serviceTags(service);
  const packageCount = service.packageItems.length;
  const canUpload = isMediaUploadDriverConfigured(settings.mediaDriver);
  const mediaAssetOptions: AssetPickerAsset[] = mediaAssets.map((asset) => ({
    alt: asset.alt || asset.filename,
    filename: asset.filename,
    id: asset.id,
    thumbnailUrl: mediaAssetDisplayUrl(asset, MediaVariantType.CARD)
  }));
  const serviceImageUrl = catalogMediaUrl(serviceMediaUrl(service), contentWebsiteUrl(resolveContentManifest(settings.siteId, settings.publicContentConfig)));
  const serviceImageAlt = `${service.name} session photo`;
  const serviceImageUploadFormId = `service-${service.id}-image-upload`;
  const serviceImageAttachFormId = `service-${service.id}-image-attach`;
  const serviceImageRemoveFormId = `service-${service.id}-image-remove`;

  const detailsContent = (
    <>
      <SessionDetailsForm key={service.updatedAt.toISOString()}>
        <input name="id" type="hidden" value={service.id} />
        <input name="location" type="hidden" value={service.location || ""} />
        {hiddenSchedulingValues(service)}
        <main className="product-studio-main">
        <section className="studio-panel" aria-labelledby="session-details-title">
          <div className="studio-section-head">
            <h2 id="session-details-title">Session details</h2>
          </div>
            <div className="catalog-form-grid">
              <div className="ui-field">
                <label htmlFor="service-name">Session type name</label>
                <input defaultValue={service.name} id="service-name" name="name" required />
              </div>
            </div>

            <div className="ui-field">
              <label htmlFor="service-description">Description</label>
              <textarea defaultValue={service.description || ""} id="service-description" name="description" rows={3} />
            </div>

            <BookingPhotoField assets={mediaAssetOptions} canUpload={canUpload} imageAlt={serviceImageAlt} imageUrl={serviceImageUrl || ""} serviceId={service.id}
              uploadFormId={serviceImageUploadFormId} attachFormId={serviceImageAttachFormId} removeFormId={serviceImageRemoveFormId} />
                <ServicePresetField
                  defaultValue={service.category}
                  emptyLabel="Uncategorized"
                  id="service-category"
                  label="Category"
                  name="category"
                  newLabel="New category"
                  newPlaceholder="Category name"
                  options={categoryOptions}
                />
        </section>
        <SessionPackagesEditor initialOffering={offering} durationMinutes={service.durationMinutes} priceCents={service.priceCents} />
        <section className="studio-panel">
              <details className={styles.moreOptions}><summary>Intake and booking policies</summary>
                <ServiceBookingRulesTable
                  defaultIntakePrompt={service.intakePrompt}
                  defaultPolicyText={service.policyText}
                  defaultRequirePolicy={service.requirePolicy}
                  defaultRequestOnly={service.requestOnly}
                  defaultWaitlistEnabled={service.waitlistEnabled}
                  idPrefix="service"
                  intakeOptions={intakeOptions}
                  policyOptions={policyOptions}
                />
              </details>
        </section>


        </main>

        <aside className="product-studio-sidecar">


          <section className="studio-panel">
          <h2 className="section-title">Status</h2>
          <Switch defaultChecked={service.isActive} label="Active" name="isActive" variant="inline" />
          <dl className="service-editor-summary">
            <div>
              <dt>Duration</dt>
              <dd>{serviceDurationLabel(service.durationMinutes)}</dd>
            </div>
            <div>
              <dt>Packages</dt>
              <dd>{readSessionOffering(service.sessionOffering)?.tiers.length ?? 1}</dd>
            </div>
            {bookingPath !== "Client booking rebuild pending" && <div><dt>Booking link</dt><dd>{bookingPath}</dd></div>}
          </dl>
          <ButtonLink href="/admin/modules/appointments?panel=rules&tab=availability" variant="secondary">
            <Clock3 size={16} />
            Business hours
          </ButtonLink>
          </section>
              <section className="studio-panel" aria-labelledby="session-organization-title">
                <h2 id="session-organization-title" className="section-title">Organization</h2>
                <div className="ui-field">
                  <label htmlFor="service-tags">Tags</label>
                  <input defaultValue={tagsValue} id="service-tags" name="tags" />
                </div>
              </section>
        </aside>
        <footer className={styles.saveFooter}>
          <SessionDetailsSaveButton />
        </footer>
      </SessionDetailsForm>

      <form action={uploadServiceImageAction} id={serviceImageUploadFormId} />
      <form action={uploadServiceImageAction} id={`${serviceImageUploadFormId}-library`} />
      <form action={attachServiceImageAction} id={serviceImageAttachFormId} />
      <form action={removeServiceImageAction} id={serviceImageRemoveFormId}>
        <input name="serviceId" type="hidden" value={service.id} />
      </form>
    </>
  );

  const packagesContent = (
    <section className="studio-panel">
      <div className="studio-section-head">
        <div>
          <h2>Service bundles</h2>
        </div>
        <Boxes size={20} />
      </div>

      {service.packageItems.length ? (
        <div className="catalog-table-scroll">
          <table className="catalog-product-table">
            <thead>
              <tr>
                <th>Bundle</th>
                <th>Status</th>
                <th>Quantity</th>
                <th>Sort</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {service.packageItems.map((item) => (
                <tr key={item.id}>
                  <td>
                    <span className="catalog-cell-text" title={item.package.name}>{item.package.name}</span>
                  </td>
                  <td>
                    <span className={serviceStatusClass(item.package.isActive)}>{item.package.isActive ? "active" : "draft"}</span>
                  </td>
                  <td>{item.quantity}</td>
                  <td>{item.sortOrder}</td>
                  <td>
                    <ButtonLink href={`/admin/modules/services/packages/${item.package.id}`} size="sm" variant="secondary">
                      Edit bundle
                    </ButtonLink>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="catalog-empty-state">
          <Boxes size={28} />
          <h3>No service bundles</h3>
          <p>Open a bundle to combine this session type with other services.</p>
          <ButtonLink href="/admin/modules/services?tab=packages" variant="secondary">
            Open service bundles
          </ButtonLink>
        </div>
      )}
    </section>
  );

  const tabs: ServiceWorkspaceTab[] = [
    { content: detailsContent, icon: <FileText size={15} />, id: "details", label: "Session & packages" },
    ...(packageCount ? [{ content: packagesContent, icon: <Boxes size={15} />, id: "packages", label: "Service bundles" }] : [])
  ];

  return (
    <div className={`${styles.page} stack product-studio-page product-editor-page service-editor-page has-mobile-shell-header`}>
      <AdminMobileHeaderSlot backHref="/admin/modules/services" title={service.name} />
      <header className="page-header service-studio-header">
        <div className={styles.heading}>
          <ButtonLink href="/admin/modules/services" size="sm" variant="ghost">
            <ArrowLeft size={15} />
            Services
          </ButtonLink>
          <div>
            <h1>{service.name}</h1>
          </div>
          <div className="product-studio-badges">
            <span className={serviceStatusClass(service.isActive)}>{service.isActive ? "active" : "draft"}</span>
          </div>
        </div>
      </header>

      {savedMessage ? <div className="success-message">{savedMessage}</div> : null}
      {errorMessage ? <div className="error">{errorMessage}</div> : null}

      <ServiceWorkspaceTabs initialTab={params.tab} tabs={tabs} />
    </div>
  );
}
