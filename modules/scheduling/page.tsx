import { redirect } from "next/navigation";
import Link from "next/link";
import { MediaVariantType, type Prisma } from "@prisma/client";
import { Boxes, CalendarCheck, Images, Plus } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { isMediaUploadDriverConfigured, mediaAssetDisplayUrl } from "@/lib/media";
import { prisma } from "@/lib/prisma";
import { getSiteSettings } from "@/lib/site";
import { ButtonLink, FolderTabs, type AssetPickerAsset, type FolderTab, type SelectMenuOption } from "@/components/ui";
import { toggleServiceAction } from "./actions";
import { ServiceCategoryManager, type ServiceCategoryManagerCategory } from "./components/service-category-manager";
import { ServiceCatalogTable, type ServiceCatalogTableService } from "./components/service-catalog-table";
import { ServicePackageTable, type ServicePackageTablePackage } from "./components/service-package-table";

export const dynamic = "force-dynamic";

type SchedulingPageProps = {
  searchParams: Promise<{
    category?: string;
    diagnosticDate?: string;
    diagnosticResourceId?: string;
    diagnosticServiceId?: string;
    diagnosticStaffId?: string;
    error?: string;
    q?: string;
    saved?: string;
    statusService?: string;
    tab?: string;
    tag?: string;
  }>;
};

type ServiceCatalogItem = Prisma.ServiceGetPayload<{
  include: { _count: { select: { packageItems: true } }; mediaAsset: true };
}>;

type ServicePackageWithItems = Prisma.ServicePackageGetPayload<{
  include: { items: { include: { service: true } } };
}>;

function jsonStringArray(value: Prisma.JsonValue | null | undefined) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())) : [];
}

function serviceCategory(service: { category: string }) {
  return service.category.trim();
}

function serviceTags(service: { tags: Prisma.JsonValue }) {
  return jsonStringArray(service.tags);
}

function uniqueSortedStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean))).sort((left, right) => left.localeCompare(right));
}

function servicePackageCategories(servicePackage: ServicePackageWithItems) {
  return uniqueSortedStrings(servicePackage.items.map((item) => serviceCategory(item.service)));
}

function servicePackageTags(servicePackage: { tags: Prisma.JsonValue }) {
  return jsonStringArray(servicePackage.tags);
}

function savedServiceMessage(saved?: string) {
  if (saved === "category") return "Service category updated.";
  if (saved === "category-media") return "Category image updated.";
  if (saved === "media") return "Service image updated.";
  if (saved === "package") return "Package changes saved.";
  if (saved === "package-item") return "Package contents updated.";
  if (saved) return "Services catalog updated.";
  return null;
}

function serviceImageUrl(service: ServiceCatalogItem) {
  if (service.mediaAsset) return mediaAssetDisplayUrl(service.mediaAsset, MediaVariantType.CARD);
  return service.imageUrl || "";
}

function toServiceCatalogTableService(service: ServiceCatalogItem): ServiceCatalogTableService {
  return {
    bookingPath: "Client booking rebuild pending",
    category: serviceCategory(service) || "Uncategorized",
    description: service.description || "",
    durationMinutes: service.durationMinutes,
    id: service.id,
    imageUrl: serviceImageUrl(service),
    isActive: service.isActive,
    location: service.location || "",
    name: service.name,
    packageCount: service._count.packageItems,
    tags: serviceTags(service)
  };
}

function toServicePackageTablePackage(servicePackage: ServicePackageWithItems): ServicePackageTablePackage {
  const serviceNames = servicePackage.items.map((item) => item.service.name);
  const durationMinutes = servicePackage.items.reduce((total, item) => total + item.quantity * item.service.durationMinutes, 0);

  return {
    bookingPath: "Client booking rebuild pending",
    categories: servicePackageCategories(servicePackage),
    description: servicePackage.description,
    durationMinutes,
    id: servicePackage.id,
    isActive: servicePackage.isActive,
    itemCount: servicePackage.items.length,
    name: servicePackage.name,
    serviceNames,
    sortOrder: servicePackage.sortOrder,
    tags: servicePackageTags(servicePackage)
  };
}

function redirectLegacyRulesTab(params: Awaited<SchedulingPageProps["searchParams"]>) {
  if (params.tab !== "availability" && params.tab !== "team" && params.tab !== "calendar") return;
  const query = new URLSearchParams({ panel: "rules", tab: params.tab });
  if (params.diagnosticDate) query.set("diagnosticDate", params.diagnosticDate);
  if (params.diagnosticResourceId) query.set("diagnosticResourceId", params.diagnosticResourceId);
  if (params.diagnosticServiceId) query.set("diagnosticServiceId", params.diagnosticServiceId);
  if (params.diagnosticStaffId) query.set("diagnosticStaffId", params.diagnosticStaffId);
  if (params.error) query.set("error", params.error);
  if (params.saved) query.set("saved", params.saved);
  redirect(`/admin/modules/appointments?${query.toString()}`);
}

export default async function SchedulingPage({ searchParams }: SchedulingPageProps) {
  await requireAdmin("scheduling:manage");
  const [params, settings] = await Promise.all([searchParams, getSiteSettings()]);
  redirectLegacyRulesTab(params);
  const [services, servicePackages, serviceCategories, mediaAssets] = await Promise.all([
    prisma.service.findMany({
      where: { siteId: settings.siteId },
      include: { _count: { select: { packageItems: true } }, mediaAsset: true },
      orderBy: [{ isActive: "desc" }, { category: "asc" }, { updatedAt: "desc" }]
    }),
    prisma.servicePackage.findMany({
      where: { siteId: settings.siteId },
      include: {
        items: {
          include: { service: true },
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
        }
      },
      orderBy: [{ isActive: "desc" }, { sortOrder: "asc" }, { name: "asc" }]
    }),
    prisma.serviceCategory.findMany({
      where: { siteId: settings.siteId },
      include: { mediaAsset: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }]
    }),
    prisma.mediaAsset.findMany({
      where: { siteId: settings.siteId, deletedAt: null, isPrivate: false },
      orderBy: { createdAt: "desc" },
      take: 40
    })
  ]);

  const searchQuery = (params.q || "").trim().slice(0, 120);
  const categories = uniqueSortedStrings([...serviceCategories.map((category) => category.name), ...services.map(serviceCategory)]);
  const tags = uniqueSortedStrings(services.flatMap(serviceTags));
  const packageCategories = uniqueSortedStrings(servicePackages.flatMap(servicePackageCategories));
  const packageTags = uniqueSortedStrings(servicePackages.flatMap(servicePackageTags));
  const categoryFilter = categories.includes(params.category || "") ? String(params.category) : "all";
  const tagFilter = tags.includes(params.tag || "") ? String(params.tag) : "all";

  const activeServices = services.filter((service) => service.isActive).length;
  const activePackages = servicePackages.filter((servicePackage) => servicePackage.isActive).length;
  const savedMessage = savedServiceMessage(params.saved);
  const errorMessage = params.error ? decodeURIComponent(params.error) : null;
  const categoryOptions: SelectMenuOption[] = [
    { label: "All categories", value: "all" },
    ...categories.map((category) => ({ label: category, value: category }))
  ];
  const tagOptions: SelectMenuOption[] = [
    { label: "All tags", value: "all" },
    ...tags.map((tag) => ({ label: tag, value: tag }))
  ];
  const packageCategoryOptions: SelectMenuOption[] = [
    { label: "All categories", value: "all" },
    ...packageCategories.map((category) => ({ label: category, value: category }))
  ];
  const packageTagOptions: SelectMenuOption[] = [
    { label: "All tags", value: "all" },
    ...packageTags.map((tag) => ({ label: tag, value: tag }))
  ];
  const serviceRows = services.map(toServiceCatalogTableService);
  const statusActionService = serviceRows.find((service) => service.id === params.statusService) || null;
  const categoryServiceCounts = new Map<string, number>();
  services.forEach((service) => {
    const category = serviceCategory(service);
    if (!category) return;
    categoryServiceCounts.set(category, (categoryServiceCounts.get(category) || 0) + 1);
  });
  const serviceCategoryRows: ServiceCategoryManagerCategory[] = serviceCategories.map((category) => ({
    description: category.description,
    id: category.id,
    imageUrl: category.mediaAsset ? mediaAssetDisplayUrl(category.mediaAsset, MediaVariantType.CARD) : category.imageUrl,
    name: category.name,
    serviceCount: categoryServiceCounts.get(category.name) || 0,
    slug: category.slug,
    sortOrder: category.sortOrder
  }));
  const mediaAssetOptions: AssetPickerAsset[] = mediaAssets.map((asset) => ({
    alt: asset.alt || asset.filename,
    filename: asset.filename,
    id: asset.id,
    thumbnailUrl: mediaAssetDisplayUrl(asset, MediaVariantType.CARD)
  }));

  const servicesContent = (
    <ServiceCatalogTable
      categoryOptions={categoryOptions}
      createAction={
        <ButtonLink href="/admin/modules/services/new" size="sm">
          <Plus size={15} />
          New service
        </ButtonLink>
      }
      emptyCreateAction={
        <Link className="catalog-empty-state-link" href="/admin/modules/services/new">
          Click here to make your first service
        </Link>
      }
      initialCategory={categoryFilter}
      initialSearch={searchQuery}
      initialTag={tagFilter}
      services={serviceRows}
      statusActionService={statusActionService}
      tagOptions={tagOptions}
      toggleServiceAction={toggleServiceAction}
    />
  );

  const packagesContent = (
    <ServicePackageTable
      categoryOptions={packageCategoryOptions}
      packages={servicePackages.map(toServicePackageTablePackage)}
      tagOptions={packageTagOptions}
    />
  );

  const categoriesContent = (
    <ServiceCategoryManager
      canUpload={isMediaUploadDriverConfigured(settings.mediaDriver)}
      categories={serviceCategoryRows}
      mediaAssets={mediaAssetOptions}
    />
  );

  const tabs: FolderTab[] = [
    {
      content: servicesContent,
      footer: (
        <div className="catalog-table-status-strip" aria-label="Service catalog status">
          <span className="catalog-pill is-green">
            <CalendarCheck size={15} />
            {activeServices} active
          </span>
          <span className="catalog-pill is-blue">
            <Boxes size={15} />
            {activePackages} packages
          </span>
        </div>
      ),
      icon: <CalendarCheck size={15} />,
      id: "services",
      label: "Services"
    },
    {
      content: categoriesContent,
      footer: (
        <div className="catalog-table-status-strip" aria-label="Service category catalog status">
          <span className="catalog-pill is-blue">
            <Images size={15} />
            {serviceCategories.length} categories
          </span>
        </div>
      ),
      icon: <Images size={15} />,
      id: "categories",
      label: "Categories"
    },
    {
      content: packagesContent,
      footer: (
        <div className="catalog-table-status-strip" aria-label="Package catalog status">
          <span className="catalog-pill is-blue">
            <Boxes size={15} />
            {activePackages} active
          </span>
        </div>
      ),
      icon: <Boxes size={15} />,
      id: "packages",
      label: "Packages"
    }
  ];

  return (
    <div className="stack products-workspace service-workspace">
      <header className="page-header">
        <div>
          <h1>Services</h1>
        </div>
      </header>

      {savedMessage ? <div className="success-message">{savedMessage}</div> : null}
      {errorMessage ? <div className="error">{errorMessage}</div> : null}

      <FolderTabs ariaLabel="Service catalog sections" initialTab={params.tab} tabs={tabs} />
    </div>
  );
}
