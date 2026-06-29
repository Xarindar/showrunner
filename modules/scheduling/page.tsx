import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { Boxes, CalendarCheck, Clock3, ExternalLink, Plus, Tags } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSiteSettings } from "@/lib/site";
import { Button, ButtonLink, FolderTabs, Switch, type FolderTab, type SelectMenuOption } from "@/components/ui";
import {
  addServicePackageItemAction,
  createServiceAction,
  createServicePackageAction,
  removeServicePackageItemAction,
  toggleServiceAction,
  updateServicePackageAction
} from "./actions";
import { PackageBuilder, type PackageBuilderPackage, type PackageBuilderService } from "./components/package-builder";
import { ServiceCatalogTable, type ServiceCatalogTableService } from "./components/service-catalog-table";
import { ServiceCreateMenu } from "./components/service-create-menu";

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
    tab?: string;
    tag?: string;
  }>;
};

type ServiceCatalogItem = Prisma.ServiceGetPayload<{
  include: { _count: { select: { packageItems: true } } };
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

function savedServiceMessage(saved?: string) {
  if (saved === "package") return "Package changes saved.";
  if (saved === "package-item") return "Package contents updated.";
  if (saved) return "Services catalog updated.";
  return null;
}

function toPackageBuilderService(service: {
  category: string;
  description: string | null;
  durationMinutes: number;
  id: string;
  isActive: boolean;
  name: string;
  tags: Prisma.JsonValue;
}): PackageBuilderService {
  return {
    category: serviceCategory(service),
    description: service.description || "",
    durationMinutes: service.durationMinutes,
    id: service.id,
    isActive: service.isActive,
    name: service.name,
    tags: serviceTags(service)
  };
}

function toServiceCatalogTableService(service: ServiceCatalogItem): ServiceCatalogTableService {
  return {
    bookingPath: `/book/${service.slug}`,
    category: serviceCategory(service) || "Uncategorized",
    description: service.description || "",
    durationMinutes: service.durationMinutes,
    id: service.id,
    isActive: service.isActive,
    location: service.location || "",
    name: service.name,
    packageCount: service._count.packageItems,
    tags: serviceTags(service)
  };
}

function toPackageBuilderPackage(servicePackage: ServicePackageWithItems): PackageBuilderPackage {
  return {
    description: servicePackage.description,
    id: servicePackage.id,
    isActive: servicePackage.isActive,
    name: servicePackage.name,
    slug: servicePackage.slug,
    sortOrder: servicePackage.sortOrder,
    tags: jsonStringArray(servicePackage.tags),
    items: servicePackage.items.map((item) => ({
      id: item.id,
      quantity: item.quantity,
      service: toPackageBuilderService(item.service),
      sortOrder: item.sortOrder
    }))
  };
}

function hiddenServiceDefaults() {
  return (
    <>
      <input name="bufferBeforeMinutes" type="hidden" value="0" />
      <input name="bufferAfterMinutes" type="hidden" value="15" />
      <input name="minimumNoticeHours" type="hidden" value="12" />
      <input name="maxAdvanceDays" type="hidden" value="60" />
      <input name="slotIntervalMinutes" type="hidden" value="30" />
      <input name="intakePrompt" type="hidden" value="" />
      <input name="policyText" type="hidden" value="" />
    </>
  );
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
  const [services, servicePackages] = await Promise.all([
    prisma.service.findMany({
      where: { siteId: settings.siteId },
      include: { _count: { select: { packageItems: true } } },
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
    })
  ]);

  const searchQuery = (params.q || "").trim().slice(0, 120);
  const categories = Array.from(new Set(services.map(serviceCategory).filter(Boolean))).sort((left, right) => left.localeCompare(right));
  const tags = Array.from(new Set(services.flatMap(serviceTags))).sort((left, right) => left.localeCompare(right));
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

  const createServiceForm = (
    <form action={createServiceAction} className="catalog-form-grid">
      {hiddenServiceDefaults()}
      <p className="muted-text">Start with the service basics. You can build out copy, tags, and booking behavior on the next screen.</p>
      <div className="ui-field">
        <label htmlFor="new-service-name">Service name</label>
        <input autoFocus id="new-service-name" name="name" placeholder="30-minute head spa" required />
      </div>
      <div className="catalog-form-grid is-two">
        <div className="ui-field">
          <label htmlFor="new-service-duration">Duration</label>
          <input defaultValue="30" id="new-service-duration" min="5" name="durationMinutes" step="5" type="number" required />
        </div>
        <div className="ui-field">
          <label htmlFor="new-service-category">Category</label>
          <input id="new-service-category" name="category" placeholder="Spa treatments" />
        </div>
      </div>
      <div className="ui-field">
        <label htmlFor="new-service-tags">Tags</label>
        <input id="new-service-tags" name="tags" placeholder="relaxation, featured" />
      </div>
      <input name="description" type="hidden" value="" />
      <input name="location" type="hidden" value="" />
      <Switch defaultChecked label="Active" name="isActive" variant="inline" />
      <div className="module-modal-actions">
        <Button type="submit">
          <Plus size={18} />
          Create service
        </Button>
      </div>
    </form>
  );

  const createPackageForm = (
    <form action={createServicePackageAction} className="catalog-form-grid">
      <p className="muted-text">Packages group base services together, such as a head spa plus a premium face mask.</p>
      <div className="ui-field">
        <label htmlFor="new-package-name">Package name</label>
        <input autoFocus id="new-package-name" name="name" placeholder="Glow reset package" required />
      </div>
      <div className="catalog-form-grid is-two">
        <div className="ui-field">
          <label htmlFor="new-package-slug">Package slug</label>
          <input id="new-package-slug" name="slug" placeholder="glow-reset" />
        </div>
        <div className="ui-field">
          <label htmlFor="new-package-tags">Tags</label>
          <input id="new-package-tags" name="tags" placeholder="spa, premium" />
        </div>
      </div>
      <div className="ui-field">
        <label htmlFor="new-package-description">Description</label>
        <textarea id="new-package-description" name="description" />
      </div>
      <Switch defaultChecked label="Active" name="isActive" variant="inline" />
      <div className="module-modal-actions">
        <Button type="submit">
          <Boxes size={18} />
          Create package
        </Button>
      </div>
    </form>
  );

  const servicesContent = (
    <ServiceCatalogTable
      activePackages={activePackages}
      activeServices={activeServices}
      categoryOptions={categoryOptions}
      createAction={
        <ServiceCreateMenu
          items={[
            { content: createServiceForm, description: "Create a bookable catalog service.", id: "service", label: "Service", title: "Create service", type: "service" },
            { content: createPackageForm, description: "Compose multiple services together.", id: "package", label: "Package", title: "Create package", type: "package" }
          ]}
        />
      }
      initialCategory={categoryFilter}
      initialSearch={searchQuery}
      initialTag={tagFilter}
      services={services.map(toServiceCatalogTableService)}
      tagOptions={tagOptions}
      toggleServiceAction={toggleServiceAction}
    />
  );

  const packagesContent = (
    <PackageBuilder
      addPackageItemAction={addServicePackageItemAction}
      packages={servicePackages.map(toPackageBuilderPackage)}
      removePackageItemAction={removeServicePackageItemAction}
      services={services.map(toPackageBuilderService)}
      updatePackageAction={updateServicePackageAction}
    />
  );

  const tabs: FolderTab[] = [
    { content: servicesContent, icon: <CalendarCheck size={15} />, id: "services", label: "Services" },
    { content: packagesContent, icon: <Boxes size={15} />, id: "packages", label: "Packages" }
  ];

  return (
    <div className="products-workspace service-workspace">
      <header className="product-studio-header service-studio-header">
        <div className="product-studio-title">
          <div className="service-header-mark" aria-hidden="true">
            <CalendarCheck size={20} />
          </div>
          <div>
            <p className="catalog-kicker">Services</p>
            <h1>Services</h1>
            <p>Build a catalog of base services and combine them into packages.</p>
          </div>
          <div className="product-studio-badges">
            <span className="catalog-pill is-green">
              <Clock3 size={14} />
              {activeServices} active services
            </span>
            <span className="catalog-pill is-blue">
              <Tags size={14} />
              {categories.length} categories
            </span>
          </div>
        </div>
        <div className="product-studio-actions">
          <ButtonLink href="/book" rel="noreferrer" size="sm" target="_blank" variant="secondary">
            <ExternalLink size={15} />
            View booking
          </ButtonLink>
          <ServiceCreateMenu
            items={[
              { content: createServiceForm, description: "Create a bookable catalog service.", id: "service-header", label: "Service", title: "Create service", type: "service" },
              { content: createPackageForm, description: "Compose multiple services together.", id: "package-header", label: "Package", title: "Create package", type: "package" }
            ]}
          />
        </div>
      </header>

      {savedMessage ? <div className="success-message">{savedMessage}</div> : null}
      {errorMessage ? <div className="error">{errorMessage}</div> : null}

      <FolderTabs ariaLabel="Service catalog sections" initialTab={params.tab} tabs={tabs} />
    </div>
  );
}
