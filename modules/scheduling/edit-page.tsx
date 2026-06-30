import { notFound } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { ArrowLeft, Boxes, CalendarCheck, Clock3, ExternalLink, FileText, Save, Tags } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { stringArrayCsv } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { getSiteSettings } from "@/lib/site";
import { Button, ButtonLink } from "@/components/ui";
import { createServiceAction, updateServiceAction } from "./actions";
import { ServiceBookingRulesTable } from "./components/service-booking-rules-table";
import { ServicePresetField } from "./components/service-preset-field";
import { ServiceWorkspaceTabs, type ServiceWorkspaceTab } from "./components/service-workspace-tabs";

type ServiceEditPageProps = {
  searchParams: Promise<{ error?: string; saved?: string; tab?: string }>;
  serviceId: string;
};

type ServiceWithBuilderData = Prisma.ServiceGetPayload<{
  include: {
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
  if (saved === "service") return "Service changes saved.";
  if (saved) return "Service updated.";
  return null;
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
    <div className="product-studio-page product-editor-page service-editor-page">
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

      <form action={createServiceAction} className="product-studio-save-grid" id="service-create-form">
        <main className="product-studio-main">
          <section className="studio-panel">
            <div className="studio-section-head">
              <div>
                <p className="catalog-rail-label">Service details</p>
                <h2>Name, category &amp; description</h2>
              </div>
              <FileText size={20} />
            </div>

            <div className="catalog-form-grid is-two">
              <div className="ui-field">
                <label htmlFor="new-service-name">Service name</label>
                <input autoFocus id="new-service-name" name="name" placeholder="30-minute head spa" required />
              </div>
              <div className="ui-field">
                <label htmlFor="new-service-slug">Booking URL slug</label>
                <input id="new-service-slug" name="slug" placeholder="head-spa" />
              </div>
            </div>

            <div className="catalog-form-grid is-three">
              <div className="ui-field">
                <label htmlFor="new-service-duration">Duration</label>
                <input defaultValue="30" id="new-service-duration" min="1" name="durationMinutes" step="5" type="number" required />
              </div>
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
                emptyLabel="No location label"
                id="new-service-location"
                label="Location label"
                name="location"
                newLabel="New location label"
                newPlaceholder="Location label name"
                options={locationOptions}
              />
            </div>

            <div className="ui-field">
              <label htmlFor="new-service-tags">Tags</label>
              <input id="new-service-tags" name="tags" placeholder="relaxation, featured" />
            </div>

            <div className="ui-field">
              <label htmlFor="new-service-description">Description</label>
              <textarea id="new-service-description" name="description" placeholder="Describe what customers should expect before booking." />
            </div>
          </section>

          <section className="studio-panel">
            <div className="studio-section-head">
              <div>
                <p className="catalog-rail-label">Booking copy</p>
                <h2>Customer prompts &amp; policy</h2>
              </div>
              <CalendarCheck size={20} />
            </div>

            <ServiceBookingRulesTable
              defaultIsActive
              idPrefix="new-service"
              intakeOptions={intakeOptions}
              policyOptions={policyOptions}
            />
          </section>

          <section className="studio-panel">
            <div className="studio-section-head">
              <div>
                <p className="catalog-rail-label">Booking rules</p>
                <h2>Notice, buffers &amp; slot timing</h2>
              </div>
              <Clock3 size={20} />
            </div>

            <div className="catalog-form-grid is-three">
              <div className="ui-field">
                <label htmlFor="new-service-buffer-before">Buffer before</label>
                <input defaultValue="0" id="new-service-buffer-before" min="0" name="bufferBeforeMinutes" step="5" type="number" />
              </div>
              <div className="ui-field">
                <label htmlFor="new-service-buffer-after">Buffer after</label>
                <input defaultValue="15" id="new-service-buffer-after" min="0" name="bufferAfterMinutes" step="5" type="number" />
              </div>
              <div className="ui-field">
                <label htmlFor="new-service-slot-interval">Slot interval</label>
                <input defaultValue="30" id="new-service-slot-interval" min="1" name="slotIntervalMinutes" step="5" type="number" />
              </div>
            </div>

            <div className="catalog-form-grid is-two">
              <div className="ui-field">
                <label htmlFor="new-service-minimum-notice">Minimum notice hours</label>
                <input defaultValue="12" id="new-service-minimum-notice" min="0" name="minimumNoticeHours" type="number" />
              </div>
              <div className="ui-field">
                <label htmlFor="new-service-max-advance">Max advance days</label>
                <input defaultValue="60" id="new-service-max-advance" min="1" name="maxAdvanceDays" type="number" />
              </div>
            </div>
          </section>
        </main>

        <aside className="product-studio-sidecar">
          <section className="studio-panel">
            <p className="catalog-rail-label">Create service</p>
            <span className="catalog-status is-draft">ready to create</span>
            <dl className="service-editor-summary">
              <div>
                <dt>After save</dt>
                <dd>Open the full editor</dd>
              </div>
              <div>
                <dt>Packages</dt>
                <dd>Add after creation</dd>
              </div>
              <div>
                <dt>Booking URL</dt>
                <dd>Generated from name or slug</dd>
              </div>
            </dl>
            <Button form="service-create-form" type="submit">
              <Save size={16} />
              Create service
            </Button>
            <ButtonLink href="/admin/modules/services" variant="secondary">
              <ArrowLeft size={16} />
              Back to services
            </ButtonLink>
            <ButtonLink href="/admin/modules/appointments?panel=rules&tab=availability" variant="ghost">
              <Clock3 size={16} />
              Appointment rules
            </ButtonLink>
          </section>
        </aside>
      </form>
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
  const intakeFormFieldsPromise = prisma.formField.findMany({
    where: {
      form: { siteId: settings.siteId },
      isHidden: false
    },
    select: { label: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }]
  });

  if (serviceId === "new") {
    const [taxonomyServices, intakeFormFields] = await Promise.all([taxonomyServicesPromise, intakeFormFieldsPromise]);
    const categoryOptions = uniqueSortedStrings(taxonomyServices.map((service) => service.category));
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

  const [service, taxonomyServices, intakeFormFields] = await Promise.all([
    prisma.service.findFirst({
      where: { id: serviceId, siteId: settings.siteId },
      include: {
        packageItems: {
          include: { package: true },
          orderBy: [{ package: { sortOrder: "asc" } }, { createdAt: "asc" }]
        }
      }
    }),
    taxonomyServicesPromise,
    intakeFormFieldsPromise
  ]);

  if (!service) notFound();

  const categoryOptions = uniqueSortedStrings(taxonomyServices.map((item: ServiceTaxonomyOption) => item.category));
  const intakeOptions = uniqueSortedStrings([...taxonomyServices.map((item: ServiceTaxonomyOption) => item.intakePrompt), ...intakeFormFields.map((field) => field.label)]);
  const locationOptions = uniqueSortedStrings(taxonomyServices.map((item: ServiceTaxonomyOption) => item.location));
  const policyOptions = uniqueSortedStrings(taxonomyServices.map((item: ServiceTaxonomyOption) => item.policyText));
  const savedMessage = savedServiceMessage(params.saved);
  const errorMessage = params.error ? decodeURIComponent(params.error) : null;
  const bookingPath = `/book/${service.slug}`;
  const tagsValue = serviceTags(service);
  const packageCount = service.packageItems.length;

  const detailsContent = (
    <form action={updateServiceAction} className="product-studio-save-grid" id="service-core-form">
      <input name="id" type="hidden" value={service.id} />
      {hiddenSchedulingValues(service)}
      <main className="product-studio-main">
        <section className="studio-panel">
          <div className="studio-section-head">
            <div>
              <p className="catalog-rail-label">Service details</p>
              <h2>Name, category &amp; description</h2>
            </div>
            <FileText size={20} />
          </div>

          <div className="catalog-form-grid is-two">
            <div className="ui-field">
              <label htmlFor="service-name">Service name</label>
              <input defaultValue={service.name} id="service-name" name="name" required />
            </div>
            <div className="ui-field">
              <label htmlFor="service-slug">Booking URL slug</label>
              <input defaultValue={service.slug} id="service-slug" name="slug" />
            </div>
          </div>

          <div className="catalog-form-grid is-three">
            <div className="ui-field">
              <label htmlFor="service-duration">Duration</label>
              <input defaultValue={service.durationMinutes} id="service-duration" min="1" name="durationMinutes" step="5" type="number" required />
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
            <ServicePresetField
              defaultValue={service.location || ""}
              emptyLabel="No location label"
              id="service-location"
              label="Location label"
              name="location"
              newLabel="New location label"
              newPlaceholder="Location label name"
              options={locationOptions}
            />
          </div>

          <div className="ui-field">
            <label htmlFor="service-tags">Tags</label>
            <input defaultValue={tagsValue} id="service-tags" name="tags" />
          </div>

          <div className="ui-field">
            <label htmlFor="service-description">Description</label>
            <textarea defaultValue={service.description || ""} id="service-description" name="description" />
          </div>
        </section>

        <section className="studio-panel">
          <div className="studio-section-head">
            <div>
              <p className="catalog-rail-label">Booking copy</p>
              <h2>Customer prompts &amp; policy</h2>
            </div>
            <CalendarCheck size={20} />
          </div>

          <ServiceBookingRulesTable
            defaultIntakePrompt={service.intakePrompt}
            defaultIsActive={service.isActive}
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
        <section className="studio-panel">
          <p className="catalog-rail-label">Status</p>
          <span className={serviceStatusClass(service.isActive)}>{service.isActive ? "active" : "draft"}</span>
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
              <dt>Booking URL</dt>
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
          <ButtonLink href={bookingPath} rel="noreferrer" target="_blank" variant="ghost">
            <ExternalLink size={16} />
            Preview booking
          </ButtonLink>
        </section>
      </aside>
    </form>
  );

  const packagesContent = (
    <section className="studio-panel">
      <div className="studio-section-head">
        <div>
          <p className="catalog-rail-label">Packages</p>
          <h2>Package membership</h2>
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
    <div className="product-studio-page product-editor-page service-editor-page">
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
