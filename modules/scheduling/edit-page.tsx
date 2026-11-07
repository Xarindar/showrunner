import { listBookingDocuments } from "@/lib/scheduling/booking-document-store";
import { Notification } from "@/components/ui/notifications";
import { readImageFraming } from "@/modules/content/studio/image-framing";
import { SessionTypeForm } from "./components/session-type-form";
import { readSessionOffering } from "@/lib/scheduling/session-offering";
import { hydrateSessionServiceLibrary } from "@/lib/scheduling/service-library-store";
import { catalogMediaUrl } from "@/lib/catalog-media-url";
import { contentWebsiteUrl, resolveContentManifest } from "@/clients/content-manifests";
import { notFound } from "next/navigation";
import { MediaVariantType, type MediaAsset, type Prisma } from "@prisma/client";
import { summarizeMediaTags } from "@/lib/media-tags";
import { requireAdmin, getAccessibleMediaWhere } from "@/lib/auth";
import { isMediaUploadDriverConfigured, mediaAssetDisplayUrl } from "@/lib/media";
import { prisma } from "@/lib/prisma";
import { getSiteSettings } from "@/lib/site";
import { type AssetPickerAsset } from "@/components/ui";
import { bookingRuleSchema, readBookingRules } from "@/lib/scheduling/booking-rules";

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

export default async function ServiceEditPage({ searchParams, serviceId }: ServiceEditPageProps) {
  const user = await requireAdmin("scheduling:manage");
  const [params, settings] = await Promise.all([searchParams, getSiteSettings()]);
  const [rates, mediaTags, sessionTags, bookingDocuments] = await Promise.all([
    prisma.hourlyRate.findMany({ where: { siteId: settings.siteId }, orderBy: { name: "asc" }, select: { id: true, name: true, amountCents: true } }),
    prisma.mediaAsset.findMany({ where: await getAccessibleMediaWhere(user, settings.siteId, { deletedAt: null }), select: { tags: true }, take: 5000 }),
    prisma.service.findMany({ where: { siteId: settings.siteId }, select: { tags: true } }),
    listBookingDocuments(settings.siteId)
  ]);
  const tagOptions = summarizeMediaTags([...mediaTags, ...sessionTags], 5000).map(tag => tag.name);
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
  const formProps = { bookingDocuments, availableRules, intakeOptions, policyOptions, tags: tagOptions, rates, canUpload: isMediaUploadDriverConfigured(settings.mediaDriver), categoryOptions };
  if (serviceId === "new") return <SessionTypeForm {...formProps} />;
  if (!service) notFound();
  const offering = await hydrateSessionServiceLibrary(readSessionOffering(service.sessionOffering), settings.siteId);
  const savedMessage = savedServiceMessage(params.saved);
  const errorMessage = params.error || null;
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

  return <>
    {savedMessage && <Notification tone="success" queryKey="saved">{savedMessage}</Notification>}
    {errorMessage && <Notification tone="danger" queryKey="error">{errorMessage}</Notification>}
    <SessionTypeForm key={service.updatedAt.toISOString()} {...formProps} initialService={service} initialOffering={offering} initialMedia={{
      initialSquare: serviceImageUrl ? { asset: service.mediaAsset ? toPickerAsset(service.mediaAsset) : { id: "", filename: service.name, alt: serviceImageAlt, thumbnailUrl: serviceImageUrl, url: serviceImageUrl }, framing: readImageFraming(service.imageFraming) } : null,
      initialRectangular: service.rectangularMediaAsset ? { asset: toPickerAsset(service.rectangularMediaAsset), framing: readImageFraming(service.rectangularImageFraming) } : null,
      initialGallery: service.galleryAssets.map(toPickerAsset)
    }} />
  </>;
}
