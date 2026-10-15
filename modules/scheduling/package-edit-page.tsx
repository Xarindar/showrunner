import styles from "./service-editor.module.css";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { ArrowLeft, Plus } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSiteSettings } from "@/lib/site";
import { AdminMobileHeaderSlot } from "@/shell/admin-mobile-header";
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
  return isActive ? "ui-badge ui-badge-success" : "ui-badge";
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

function newPackageForm() {
  return (
    <section className="studio-panel" aria-labelledby="new-package-title">
      <div className="studio-section-head">
        <div>
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
      <div className={`${styles.page} stack product-studio-page product-editor-page service-editor-page has-mobile-shell-header`}>
        <AdminMobileHeaderSlot backHref="/admin/modules/services?tab=packages" title="New package" />
        <header className="page-header service-studio-header">
          <div className={styles.heading}>
            <ButtonLink href="/admin/modules/services?tab=packages" size="sm" variant="ghost">
              <ArrowLeft size={15} />
              Packages
            </ButtonLink>
            <div>
              <h1>New package</h1>
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

  return (
    <div className={`${styles.page} stack product-studio-page product-editor-page service-editor-page has-mobile-shell-header`}>
      <AdminMobileHeaderSlot backHref="/admin/modules/services?tab=packages" title={servicePackage.name} />
      <header className="page-header service-studio-header">
        <div className={styles.heading}>
          <ButtonLink href="/admin/modules/services?tab=packages" size="sm" variant="ghost">
            <ArrowLeft size={15} />
            Packages
          </ButtonLink>
          <div>
            <h1>{servicePackage.name}</h1>
          </div>
          <div className="product-studio-badges">
            <span className={serviceStatusClass(servicePackage.isActive)}>{servicePackage.isActive ? "active" : "draft"}</span>
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
