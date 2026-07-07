import NextImage from "next/image";
import { notFound } from "next/navigation";
import { MediaVariantType, type Prisma } from "@prisma/client";
import { ArrowLeft, Boxes, CalendarCheck, Clock3, FileText, ImageIcon, Save, Tags, X } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { stringArrayCsv } from "@/lib/format";
import { isMediaUploadDriverConfigured, mediaAssetDisplayUrl } from "@/lib/media";
import { prisma } from "@/lib/prisma";
import { getSiteSettings } from "@/lib/site";
import { AssetPicker, Button, ButtonLink, Switch, type AssetPickerAsset } from "@/components/ui";
import { AdminMobileHeaderSlot } from "@/shell/admin-mobile-header";
import { attachServiceImageAction, createServiceAction, removeServiceImageAction, updateServiceAction, uploadServiceImageAction } from "./actions";
import { ServiceBookingRulesTable } from "./components/service-booking-rules-table";
import { ServiceDurationField } from "./components/service-duration-field";
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
  if (saved === "created") return "Service created. Build out the details below.";
  if (saved === "media") return "Service image updated.";
  if (saved === "service") return "Service changes saved.";
  if (saved) return "Service updated.";
  return null;
}

function serviceMediaUrl(service: ServiceWithBuilderData) {
  if (service.mediaAsset) return mediaAssetDisplayUrl(service.mediaAsset, MediaVariantType.CARD);
  return service.imageUrl || "";
}

function serviceStatusClass(isActive: boolean) {
  return isActive ? "catalog-status is-active" : "catalog-status is-draft";
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

function ServiceTimingField({
  defaultValue,
  id,
  label,
  min,
  name,
  step,
  unit
}: {
  defaultValue: number;
  id: string;
  label: string;
  min: number;
  name: string;
  step?: number;
  unit: string;
}) {
  return (
    <div className="service-timing-field">
      <label htmlFor={id}>{label}</label>
      <div className="service-timing-input">
        <input defaultValue={defaultValue} id={id} min={min} name={name} step={step} type="number" />
        <span aria-hidden="true">{unit}</span>
      </div>
    </div>
  );
}

function ServiceCreatePage({
  categoryOptions,
  errorMessage,
  intakeOptions,
  locationOptions,
  policyOptions
}: {
  categoryOptions: string[];
  errorMessage: string | null;
  intakeOptions: string[];
  locationOptions: string[];
  policyOptions: string[];
}) {
  return (
    <div className="product-studio-page product-editor-page service-editor-page has-mobile-shell-header">
      <AdminMobileHeaderSlot backHref="/admin/modules/services" title="New service" />
      <header className="product-studio-header service-studio-header">
        <div className="product-studio-title">
          <ButtonLink href="/admin/modules/services" size="sm" variant="ghost">
            <ArrowLeft size={15} />
            Services
          </ButtonLink>
          <div>
            <p className="catalog-kicker">Service builder</p>
            <h1>New service</h1>
            <p>Set up the customer-facing service details, booking behavior, and scheduling rules before publishing.</p>
          </div>
          <div className="product-studio-badges">
            <span className="catalog-status is-draft">new</span>
          </div>
        </div>
      </header>

      {errorMessage ? <div className="error">{errorMessage}</div> : null}

      <form action={createServiceAction} className="product-studio-save-grid service-create-form" id="service-create-form">
        <main className="product-studio-main">
          <section className="studio-panel">
            <div className="studio-section-head">
              <div>
                <h2>Service details</h2>
              </div>
              <FileText size={20} />
            </div>

            <div className="catalog-form-grid is-two">
              <div className="ui-field">
                <label htmlFor="new-service-name">Service name</label>
                <input autoFocus id="new-service-name" name="name" placeholder="30-minute head spa" required />
              </div>
              <div className="ui-field">
                <label htmlFor="new-service-slug">Booking page link</label>
                <input id="new-service-slug" name="slug" placeholder="head-spa" />
                <span className="ui-field-hint">Use the final part of the booking link, such as head-spa.</span>
              </div>
            </div>

            <div className="catalog-form-grid is-three service-details-meta-grid">
              <ServiceDurationField defaultMinutes={30} idPrefix="new-service" />
              <ServicePresetField
                emptyLabel="Uncategorized"
                id="new-service-category"
                label="Category"
                name="category"
                newLabel="New category"
                newPlaceholder="Category name"
                options={categoryOptions}
              />
              <ServicePresetField
                emptyLabel="No location"
                id="new-service-location"
                label="Location"
                name="location"
                newLabel="New location"
                newPlaceholder="Location name"
                options={locationOptions}
              />
            </div>

            <div className="ui-field">
              <label htmlFor="new-service-description">Description</label>
              <textarea id="new-service-description" name="description" placeholder="Describe what customers should expect before booking." />
            </div>

            <div className="ui-field">
              <label htmlFor="new-service-tags">Tags</label>
              <input id="new-service-tags" name="tags" placeholder="relaxation, featured" />
            </div>
          </section>

          <section className="studio-panel">
            <div className="studio-section-head">
              <div>
                <h2>Booking rules</h2>
              </div>
              <CalendarCheck size={20} />
            </div>

            <ServiceBookingRulesTable
              idPrefix="new-service"
              intakeOptions={intakeOptions}
              policyOptions={policyOptions}
            />
          </section>

          <section className="studio-panel">
            <div className="studio-section-head">
              <div>
                <h2>Scheduling</h2>
              </div>
              <Clock3 size={20} />
            </div>

            <div className="service-timing-grid">
              <ServiceTimingField
                defaultValue={0}
                id="new-service-buffer-before"
                label="Before"
                min={0}
                name="bufferBeforeMinutes"
                step={5}
                unit="min"
              />
              <ServiceTimingField
                defaultValue={15}
                id="new-service-buffer-after"
                label="After"
                min={0}
                name="bufferAfterMinutes"
                step={5}
                unit="min"
              />
              <ServiceTimingField
                defaultValue={30}
                id="new-service-slot-interval"
                label="Slot size"
                min={1}
                name="slotIntervalMinutes"
                step={5}
                unit="min"
              />
              <ServiceTimingField
                defaultValue={12}
                id="new-service-minimum-notice"
                label="Notice"
                min={0}
                name="minimumNoticeHours"
                unit="hr"
              />
              <ServiceTimingField
                defaultValue={60}
                id="new-service-max-advance"
                label="Book ahead"
                min={1}
                name="maxAdvanceDays"
                unit="days"
              />
            </div>
          </section>
        </main>
      </form>

      <footer className="product-studio-sticky-footer service-editor-footer">
        <Switch defaultChecked form="service-create-form" label="Active" name="isActive" variant="inline" />
        <Button form="service-create-form" type="submit">
          <Save size={16} />
          Create Service
        </Button>
      </footer>
    </div>
  );
}

export default async function ServiceEditPage({ searchParams, serviceId }: ServiceEditPageProps) {
  await requireAdmin("scheduling:manage");
  const [params, settings] = await Promise.all([searchParams, getSiteSettings()]);
  const taxonomyServicesPromise = prisma.service.findMany({
    where: { siteId: settings.siteId },
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
    const [taxonomyServices, intakeFormFields, serviceCategories] = await Promise.all([taxonomyServicesPromise, intakeFormFieldsPromise, serviceCategoriesPromise]);
    const categoryOptions = uniqueSortedStrings([...serviceCategories.map((category) => category.name), ...taxonomyServices.map((service) => service.category)]);
    const intakeOptions = uniqueSortedStrings([...taxonomyServices.map((service) => service.intakePrompt), ...intakeFormFields.map((field) => field.label)]);
    const locationOptions = uniqueSortedStrings(taxonomyServices.map((service) => service.location));
    const policyOptions = uniqueSortedStrings(taxonomyServices.map((service) => service.policyText));
    const errorMessage = params.error ? decodeURIComponent(params.error) : null;
    return (
      <ServiceCreatePage
        categoryOptions={categoryOptions}
        errorMessage={errorMessage}
        intakeOptions={intakeOptions}
        locationOptions={locationOptions}
        policyOptions={policyOptions}
      />
    );
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

  const categoryOptions = uniqueSortedStrings([...serviceCategories.map((category) => category.name), ...taxonomyServices.map((item: ServiceTaxonomyOption) => item.category)]);
  const intakeOptions = uniqueSortedStrings([...taxonomyServices.map((item: ServiceTaxonomyOption) => item.intakePrompt), ...intakeFormFields.map((field) => field.label)]);
  const locationOptions = uniqueSortedStrings(taxonomyServices.map((item: ServiceTaxonomyOption) => item.location));
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
  const serviceImageUrl = serviceMediaUrl(service);
  const serviceImageAlt = `${service.name} booking image`;
  const serviceImageUploadFormId = `service-${service.id}-image-upload`;
  const serviceImageAttachFormId = `service-${service.id}-image-attach`;
  const serviceImageRemoveFormId = `service-${service.id}-image-remove`;

  const detailsContent = (
    <>
      <form action={updateServiceAction} className="product-studio-save-grid" id="service-core-form">
        <input name="id" type="hidden" value={service.id} />
        {hiddenSchedulingValues(service)}
        <main className="product-studio-main">
        <section className="studio-panel">
          <div className="studio-section-head">
            <div>
              <h2>Service details</h2>
            </div>
            <FileText size={20} />
          </div>

          <div className="catalog-form-grid is-two">
            <div className="ui-field">
              <label htmlFor="service-name">Service name</label>
              <input defaultValue={service.name} id="service-name" name="name" required />
            </div>
            <div className="ui-field">
              <label htmlFor="service-slug">Booking slug</label>
              <input defaultValue={service.slug} id="service-slug" name="slug" />
              <span className="ui-field-hint">Use the future client-facing booking slug, such as head-spa.</span>
            </div>
          </div>

          <div className="catalog-form-grid is-three service-details-meta-grid">
            <ServiceDurationField defaultMinutes={service.durationMinutes} idPrefix="service" />
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
            <ServicePresetField
              defaultValue={service.location || ""}
              emptyLabel="No location"
              id="service-location"
              label="Location"
              name="location"
              newLabel="New location"
              newPlaceholder="Location name"
              options={locationOptions}
            />
          </div>

          <div className="ui-field">
            <label htmlFor="service-description">Description</label>
            <textarea defaultValue={service.description || ""} id="service-description" name="description" />
          </div>

          <div className="ui-field">
            <label htmlFor="service-tags">Tags</label>
            <input defaultValue={tagsValue} id="service-tags" name="tags" />
          </div>
        </section>

        <section className="studio-panel">
          <div className="studio-section-head">
            <div>
              <h2>Booking rules</h2>
            </div>
            <CalendarCheck size={20} />
          </div>

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
        </section>
        </main>

        <aside className="product-studio-sidecar">
          <section className="studio-panel service-image-panel">
            <div className="studio-section-head">
              <div>
                <p className="catalog-rail-label">Booking image</p>
                <h2>Card artwork</h2>
              </div>
              {serviceImageUrl ? (
                <Button aria-label="Remove service image" form={serviceImageRemoveFormId} size="sm" title="Remove image" type="submit" variant="ghost">
                  <X size={15} />
                </Button>
              ) : null}
            </div>
            <AssetPicker
              assets={mediaAssetOptions}
              attachFields={{ serviceId: service.id }}
              attachFormId={serviceImageAttachFormId}
              canUpload={canUpload}
              defaultAlt={serviceImageAlt}
              emptyLibraryMessage="No reusable service images yet."
              title="Service booking image"
              triggerClassName={serviceImageUrl ? "service-image-trigger has-image" : "service-image-trigger"}
              triggerHint={serviceImageUrl ? "Replace image" : "Add image"}
              uploadFields={{ serviceId: service.id }}
              uploadFormId={serviceImageUploadFormId}
              uploadUnavailableMessage="Uploads need Server asset folder, Railway/S3 bucket, R2, or Cloudflare Images. You can still choose from the library.">
              <span className="service-image-preview">
                {serviceImageUrl ? (
                  <NextImage alt={serviceImageAlt} fill sizes="(max-width: 760px) 100vw, 280px" src={serviceImageUrl} unoptimized />
                ) : (
                  <span className="studio-media-empty">
                    <ImageIcon size={24} />
                    <span>No image</span>
                  </span>
                )}
              </span>
            </AssetPicker>
            <p className="muted-text">Shown on service choices in the public booking flow.</p>
          </section>

          <section className="studio-panel">
          <p className="catalog-rail-label">Status</p>
          <span className={serviceStatusClass(service.isActive)}>{service.isActive ? "active" : "draft"}</span>
          <Switch defaultChecked={service.isActive} label="Active" name="isActive" variant="inline" />
          <dl className="service-editor-summary">
            <div>
              <dt>Duration</dt>
              <dd>{serviceDurationLabel(service.durationMinutes)}</dd>
            </div>
            <div>
              <dt>Packages</dt>
              <dd>{packageCount}</dd>
            </div>
            <div>
              <dt>Client route</dt>
              <dd>{bookingPath}</dd>
            </div>
          </dl>
          <Button form="service-core-form" type="submit">
            <Save size={16} />
            Save service
          </Button>
          <ButtonLink href="/admin/modules/appointments?panel=rules&tab=availability" variant="secondary">
            <Clock3 size={16} />
            Appointment rules
          </ButtonLink>
          </section>
        </aside>
      </form>

      <form action={uploadServiceImageAction} id={serviceImageUploadFormId} />
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
          <h2>Packages</h2>
        </div>
        <Boxes size={20} />
      </div>

      {service.packageItems.length ? (
        <div className="catalog-table-scroll">
          <table className="catalog-product-table">
            <thead>
              <tr>
                <th>Package</th>
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
                      Edit package
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
          <h3>No package memberships</h3>
          <p>Open a package to add this service to its builder.</p>
          <ButtonLink href="/admin/modules/services?tab=packages" variant="secondary">
            Open packages
          </ButtonLink>
        </div>
      )}
    </section>
  );

  const tabs: ServiceWorkspaceTab[] = [
    { content: detailsContent, icon: <FileText size={15} />, id: "details", label: "Details" },
    { content: packagesContent, icon: <Boxes size={15} />, id: "packages", label: "Packages" }
  ];

  return (
    <div className="product-studio-page product-editor-page service-editor-page has-mobile-shell-header">
      <AdminMobileHeaderSlot backHref="/admin/modules/services" title={service.name} />
      <header className="product-studio-header service-studio-header">
        <div className="product-studio-title">
          <ButtonLink href="/admin/modules/services" size="sm" variant="ghost">
            <ArrowLeft size={15} />
            Services
          </ButtonLink>
          <div>
            <p className="catalog-kicker">Service builder</p>
            <h1>{service.name}</h1>
            <p>{service.description || service.category || "Build the catalog details customers see before booking."}</p>
          </div>
          <div className="product-studio-badges">
            <span className={serviceStatusClass(service.isActive)}>{service.isActive ? "active" : "draft"}</span>
            <span className="catalog-pill is-blue">
              <Tags size={14} />
              {service.category || "Uncategorized"}
            </span>
          </div>
        </div>
      </header>

      {savedMessage ? <div className="success-message">{savedMessage}</div> : null}
      {errorMessage ? <div className="error">{errorMessage}</div> : null}

      <ServiceWorkspaceTabs initialTab={params.tab} tabs={tabs} />
    </div>
  );
}
