import { formatTimeValue, minutesToTime, nonEmptyStringArrayFromUnknown } from "@/lib/format";
import { Notification } from "@/components/ui/notifications";
import { ServiceMediaFields } from "./components/service-media-fields";
import { readImageFraming } from "@/modules/content/studio/image-framing";
import { SessionTypeForm } from "./components/session-type-form";
import { SessionPackagesEditor } from "./components/session-packages-editor";
import { SessionDetailsForm, SessionDetailsSaveButton } from "./components/session-details-form";
import { readSessionOffering } from "@/lib/scheduling/session-offering";
import { hydrateSessionServiceLibrary } from "@/lib/scheduling/service-library-store";
import styles from "./service-editor.module.css";
import { catalogMediaUrl } from "@/lib/catalog-media-url";
import { contentWebsiteUrl, resolveContentManifest } from "@/clients/content-manifests";
import { notFound } from "next/navigation";
import { MediaVariantType, type MediaAsset, type Prisma } from "@prisma/client";
import { ArrowLeft } from "lucide-react";
import { ServiceTagsField } from "./components/service-tags-field";
import { summarizeMediaTags } from "@/lib/media-tags";
import { requireAdmin, getAccessibleMediaWhere } from "@/lib/auth";
import { isMediaUploadDriverConfigured, mediaAssetDisplayUrl } from "@/lib/media";
import { prisma } from "@/lib/prisma";
import { getSiteSettings } from "@/lib/site";
import { ButtonLink, Switch, type AssetPickerAsset } from "@/components/ui";
import { AdminMobileHeaderSlot } from "@/shell/admin-mobile-header";
import { ServiceBookingRulesTable } from "./components/service-booking-rules-table";
import { bookingRuleSchema, readBookingRules } from "@/lib/scheduling/booking-rules";
import { ServicePresetField } from "./components/service-preset-field";
import { AvailabilityPanel } from "./components/availability-panel";
import { ServiceSchedulingRules } from "./components/service-scheduling-rules";

type ServiceEditPageProps = {
  searchParams: Promise<{ error?: string; saved?: string; tab?: string }>;
  serviceId: string;
};

type ServiceWithBuilderData = Prisma.ServiceGetPayload<{
  include: {
    mediaAsset: true;
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

function savedServiceMessage(saved?: string) {
  if (saved === "created") return "Session saved.";
  if (saved === "media") return "Session image updated.";
  if (saved === "service") return "Session saved.";
  if (saved) return "Session updated.";
  return null;
}

function serviceMediaUrl(service: ServiceWithBuilderData) {
  if (service.mediaAsset) return mediaAssetDisplayUrl(service.mediaAsset, service.imageFraming ? MediaVariantType.FULL : MediaVariantType.CARD);
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
  const user = await requireAdmin("scheduling:manage");
  const [params, settings] = await Promise.all([searchParams, getSiteSettings()]);
  const [availability, staff, resources, rates, mediaTags, sessionTags] = await Promise.all([
    prisma.availabilityRule.findMany({ where: { siteId: settings.siteId }, include: { resource: true, staff: true }, orderBy: [{ weekday: "asc" }, { startMinutes: "asc" }] }),
    prisma.staffMember.findMany({ where: { siteId: settings.siteId }, orderBy: [{ isActive: "desc" }, { name: "asc" }] }),
    prisma.resource.findMany({ where: { siteId: settings.siteId }, orderBy: [{ isActive: "desc" }, { name: "asc" }] }),
    prisma.hourlyRate.findMany({ where: { siteId: settings.siteId }, orderBy: { name: "asc" }, select: { id: true, name: true, amountCents: true } }),
    prisma.mediaAsset.findMany({ where: await getAccessibleMediaWhere(user, settings.siteId, { deletedAt: null }), select: { tags: true }, take: 5000 }),
    prisma.service.findMany({ where: { siteId: settings.siteId }, select: { tags: true } })
  ]);
  const tagOptions = summarizeMediaTags([...mediaTags, ...sessionTags], 5000).map(tag => tag.name);
  const schedulingRules = <ServiceSchedulingRules><AvailabilityPanel availability={availability} resources={resources} staff={staff} /></ServiceSchedulingRules>;
  const taxonomyServicesPromise = prisma.service.findMany({
    where: { siteId: settings.siteId, isOneOff: false },
    select: { category: true, intakePrompt: true, location: true, policyText: true, bookingRules: true }
  });
  const serviceCategoriesPromise = prisma.serviceCategory.findMany({
    where: { siteId: settings.siteId },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { name: true }
  });
  const intakeFormFieldsPromise = prisma.formField.findMany({
    where: {
      form: { siteId: settings.siteId },
      isHidden: false,
      type: { in: ["TEXT", "TEXTAREA", "EMAIL", "PHONE", "RADIO", "SELECT"] }
    },
    select: { id: true, label: true, type: true, fieldRole: true, isRequired: true, options: true, placeholder: true, helpText: true, form: { select: { name: true } } },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }]
  });

  const [service, taxonomyServices, intakeFormFields, serviceCategories] = await Promise.all([
    serviceId === "new" ? null : prisma.service.findFirst({
      where: { id: serviceId, siteId: settings.siteId },
      include: {
        mediaAsset: true,
        rectangularMediaAsset: true,
        galleryAssets: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] }
      }
    }),
    taxonomyServicesPromise,
    intakeFormFieldsPromise,
    serviceCategoriesPromise
  ]);

  const categoryOptions = uniqueSortedStrings([...serviceCategories.map((category) => category.name), ...taxonomyServices.map((item: ServiceTaxonomyOption) => item.category)]);
  const intakeOptions = uniqueSortedStrings([...taxonomyServices.filter(service => service.bookingRules == null).map((item: ServiceTaxonomyOption) => item.intakePrompt)]);
  const policyOptions = uniqueSortedStrings(taxonomyServices.filter(service => service.bookingRules == null).map((item: ServiceTaxonomyOption) => item.policyText));
  const availableRules = [...taxonomyServices.flatMap(service => service.bookingRules == null ? [] : readBookingRules(service.bookingRules)), ...intakeFormFields.flatMap(field => {
    const contactField = field.fieldRole === "SUBMITTER_NAME" ? "customerName" : field.fieldRole === "SUBMITTER_EMAIL" || field.type === "EMAIL" ? "customerEmail" : field.type === "PHONE" ? "customerPhone" : undefined;
    const parsed = bookingRuleSchema.safeParse({ id: field.id, kind: "intake", category: contactField ? "Contact" : field.form.name.slice(0, 80), label: field.label, type: field.type === "RADIO" || field.type === "SELECT" ? field.type : "TEXT", required: field.isRequired, options: Array.isArray(field.options) ? field.options : [], placeholder: field.placeholder, helpText: field.helpText, contactField });
    return parsed.success ? [parsed.data] : [];
  })];
  if (serviceId === "new") {
    const rules = availability.filter(rule => !rule.staffId && !rule.resourceId);
    const timeLabel = (minutes: number) => formatTimeValue(minutesToTime(minutes));
    const businessHours = rules.map(rule => `${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][rule.weekday]} ${timeLabel(rule.startMinutes)}–${timeLabel(rule.endMinutes)}`);
    return <SessionTypeForm availableRules={availableRules} intakeOptions={intakeOptions} policyOptions={policyOptions} tags={tagOptions} rates={rates} businessHours={businessHours} timezone={settings.timezone} canUpload={isMediaUploadDriverConfigured(settings.mediaDriver)} schedulingRules={schedulingRules} />;
  }
  if (!service) notFound();
  const offering = await hydrateSessionServiceLibrary(readSessionOffering(service.sessionOffering), settings.siteId);
  const savedMessage = savedServiceMessage(params.saved);
  const errorMessage = params.error || null;
  const canUpload = isMediaUploadDriverConfigured(settings.mediaDriver);
  const toPickerAsset = (asset: MediaAsset): AssetPickerAsset => ({
    alt: asset.alt || asset.filename,
    filename: asset.filename,
    id: asset.id,
    thumbnailUrl: mediaAssetDisplayUrl(asset, MediaVariantType.CARD),
    url: mediaAssetDisplayUrl(asset, MediaVariantType.FULL)
  });
  const websiteUrl = contentWebsiteUrl(resolveContentManifest(settings.siteId, settings.publicContentConfig));
  const serviceImageUrl = catalogMediaUrl(serviceMediaUrl(service), websiteUrl);
  const serviceImageAlt = `${service.name} session photo`;

  const detailsContent = (
    <>
      <SessionDetailsForm key={service.updatedAt.toISOString()}>
        <input name="id" type="hidden" value={service.id} />
        <input name="updatedAt" type="hidden" value={service.updatedAt.toISOString()} />
        <input name="location" type="hidden" value={service.location || ""} />
        {hiddenSchedulingValues(service)}
        <main className={`product-studio-main ${styles.detailsMain}`}>
        <section className="studio-panel ui-section-card" aria-labelledby="session-details-title">
          <div className="ui-section-header">
            <h2 id="session-details-title">Session details</h2>
          </div>
          <div className="ui-section-body">
            <div className="catalog-form-grid">
              <div className="ui-field">
                <label htmlFor="service-name">Session name</label>
                <input defaultValue={service.name} id="service-name" name="name" required />
              </div>
            </div>

            <div className="ui-field">
              <label htmlFor="service-description">Description</label>
              <textarea defaultValue={service.description || ""} id="service-description" name="description" rows={3} />
            </div>

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
        <ServiceMediaFields canUpload={canUpload}
          initialSquare={serviceImageUrl ? { asset: service.mediaAsset ? toPickerAsset(service.mediaAsset) : { id: "", filename: service.name, alt: serviceImageAlt, thumbnailUrl: serviceImageUrl, url: serviceImageUrl }, framing: readImageFraming(service.imageFraming) } : null}
          initialRectangular={service.rectangularMediaAsset ? { asset: toPickerAsset(service.rectangularMediaAsset), framing: readImageFraming(service.rectangularImageFraming) } : null}
          initialGallery={service.galleryAssets.map(toPickerAsset)} />
            <Switch defaultChecked={service.isActive} label="Active" name="isActive" variant="inline" />
            <ServiceTagsField tags={tagOptions} initialTags={nonEmptyStringArrayFromUnknown(service.tags)} />
          </div>
        </section>
        <SessionPackagesEditor initialRates={rates} initialPricingType={service.pricingType} initialHourlyRateId={service.hourlyRateId ?? ""} initialOffering={offering} durationMinutes={service.durationMinutes} priceCents={service.priceCents} />

        <ServiceBookingRulesTable
          defaultRules={service.bookingRules}
          availableRules={availableRules}
          defaultIntakePrompt={service.intakePrompt}
          defaultPolicyText={service.policyText}
          defaultRequirePolicy={service.requirePolicy}
          defaultRequestOnly={service.requestOnly}
          defaultWaitlistEnabled={service.waitlistEnabled}
          idPrefix="service"
          intakeOptions={intakeOptions}
          policyOptions={policyOptions}
        />

        </main>

        <footer className={styles.saveFooter}>
          <SessionDetailsSaveButton />
        </footer>
      </SessionDetailsForm>

    </>
  );

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

      {savedMessage ? <Notification tone="success" queryKey="saved">{savedMessage}</Notification> : null}
      {errorMessage ? <Notification tone="danger" queryKey="error">{errorMessage}</Notification> : null}

      {detailsContent}
    </div>
  );
}
