import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { ArrowLeft, Boxes, Plus, Tags } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSiteSettings } from "@/lib/site";
import { Button, ButtonLink, Switch } from "@/components/ui";
import {
  addServicePackageItemAction,
  createServicePackageAction,
  removeServicePackageItemAction,
  updateServicePackageAction
} from "./actions";
import { PackageBuilder, type PackageBuilderPackage, type PackageBuilderService } from "./components/package-builder";

type ServicePackageEditPageProps = {
  packageId: string;
  searchParams: Promise<{ error?: string; saved?: string }>;
};

type ServicePackageWithItems = Prisma.ServicePackageGetPayload<{
  include: { items: { include: { service: true } } };
}>;

function jsonStringArray(value: Prisma.JsonValue | null | undefined) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())) : [];
}

function savedPackageMessage(saved?: string) {
  if (saved === "created") return "Package created. Add services to finish building it.";
  if (saved === "package-item") return "Package contents updated.";
  if (saved === "package") return "Package details saved.";
  return null;
}

function serviceStatusClass(isActive: boolean) {
  return isActive ? "catalog-status is-active" : "catalog-status is-draft";
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
    category: service.category.trim(),
    description: service.description || "",
    durationMinutes: service.durationMinutes,
    id: service.id,
    isActive: service.isActive,
    name: service.name,
    tags: jsonStringArray(service.tags)
  };
}

function toPackageBuilderPackage(servicePackage: ServicePackageWithItems): PackageBuilderPackage {
  return {
    description: servicePackage.description,
    id: servicePackage.id,
    isActive: servicePackage.isActive,
    items: servicePackage.items.map((item) => ({
      id: item.id,
      quantity: item.quantity,
      service: toPackageBuilderService(item.service),
      sortOrder: item.sortOrder
    })),
    name: servicePackage.name,
    slug: servicePackage.slug,
    sortOrder: servicePackage.sortOrder,
    tags: jsonStringArray(servicePackage.tags)
  };
}

function packageDuration(items: ServicePackageWithItems["items"]) {
  return items.reduce((total, item) => total + item.quantity * item.service.durationMinutes, 0);
}

function packageDurationLabel(minutes: number) {
  if (!minutes) return "No services";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours} hr ${remainder} min` : `${hours} hr`;
}

function newPackageForm() {
  return (
    <section className="studio-panel" aria-labelledby="new-package-title">
      <div className="studio-section-head">
        <div>
          <p className="catalog-rail-label">Package setup</p>
          <h2 id="new-package-title">Create package</h2>
        </div>
      </div>
      <form action={createServicePackageAction} className="studio-action-form">
        <p className="muted-text">Name the package first. After it is created, you can add services and refine the package details.</p>
        <div className="catalog-form-grid is-two">
          <div className="ui-field">
            <label htmlFor="package-name">Package name</label>
            <input autoFocus id="package-name" name="name" placeholder="Glow reset package" required />
          </div>
          <div className="ui-field">
            <label htmlFor="package-slug">Slug</label>
            <input id="package-slug" name="slug" placeholder="glow-reset" />
          </div>
        </div>
        <div className="ui-field">
          <label htmlFor="package-description">Description</label>
          <textarea id="package-description" name="description" />
        </div>
        <div className="catalog-form-grid is-two">
          <div className="ui-field">
            <label htmlFor="package-tags">Tags</label>
            <input id="package-tags" name="tags" placeholder="spa, premium" />
          </div>
          <div className="ui-field">
            <label htmlFor="package-sort">Sort</label>
            <input defaultValue="0" id="package-sort" name="sortOrder" type="number" />
          </div>
        </div>
        <Switch defaultChecked label="Active package" name="isActive" variant="inline" />
        <Button type="submit">
          <Plus size={16} />
          Create package
        </Button>
      </form>
    </section>
  );
}

export default async function ServicePackageEditPage({ packageId, searchParams }: ServicePackageEditPageProps) {
  await requireAdmin("scheduling:manage");
  const params = await searchParams;
  const savedMessage = savedPackageMessage(params.saved);
  const errorMessage = params.error ? decodeURIComponent(params.error) : null;

  if (packageId === "new") {
    return (
      <div className="product-studio-page product-editor-page service-editor-page">
        <header className="product-studio-header service-studio-header">
          <div className="product-studio-title">
            <ButtonLink href="/admin/modules/services?tab=packages" size="sm" variant="ghost">
              <ArrowLeft size={15} />
              Packages
            </ButtonLink>
            <div>
              <p className="catalog-kicker">Package builder</p>
              <h1>New package</h1>
              <p>Create the package shell before adding services.</p>
            </div>
          </div>
        </header>

        {savedMessage ? <div className="success-message">{savedMessage}</div> : null}
        {errorMessage ? <div className="error">{errorMessage}</div> : null}

        {newPackageForm()}
      </div>
    );
  }

  const settings = await getSiteSettings();
  const [servicePackage, services] = await Promise.all([
    prisma.servicePackage.findFirst({
      where: { id: packageId, siteId: settings.siteId },
      include: {
        items: {
          include: { service: true },
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
        }
      }
    }),
    prisma.service.findMany({
      where: { siteId: settings.siteId },
      orderBy: [{ isActive: "desc" }, { category: "asc" }, { name: "asc" }]
    })
  ]);

  if (!servicePackage) {
    redirect("/admin/modules/services?tab=packages&error=Package%20not%20found.");
  }

  const totalDuration = packageDuration(servicePackage.items);

  return (
    <div className="product-studio-page product-editor-page service-editor-page">
      <header className="product-studio-header service-studio-header">
        <div className="product-studio-title">
          <ButtonLink href="/admin/modules/services?tab=packages" size="sm" variant="ghost">
            <ArrowLeft size={15} />
            Packages
          </ButtonLink>
          <div>
            <p className="catalog-kicker">Package builder</p>
            <h1>{servicePackage.name}</h1>
            <p>/book/packages/{servicePackage.slug}</p>
          </div>
          <div className="product-studio-badges">
            <span className={serviceStatusClass(servicePackage.isActive)}>{servicePackage.isActive ? "active" : "draft"}</span>
            <span className="catalog-pill is-blue">
              <Boxes size={14} />
              {servicePackage.items.length} service{servicePackage.items.length === 1 ? "" : "s"}
            </span>
            <span className="catalog-pill">
              <Tags size={14} />
              {packageDurationLabel(totalDuration)}
            </span>
          </div>
        </div>
      </header>

      {savedMessage ? <div className="success-message">{savedMessage}</div> : null}
      {errorMessage ? <div className="error">{errorMessage}</div> : null}

      <PackageBuilder
        addPackageItemAction={addServicePackageItemAction}
        packages={[toPackageBuilderPackage(servicePackage)]}
        removePackageItemAction={removeServicePackageItemAction}
        services={services.map(toPackageBuilderService)}
        updatePackageAction={updateServicePackageAction}
      />
    </div>
  );
}
