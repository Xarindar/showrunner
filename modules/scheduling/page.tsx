import { Fragment } from "react";
import type { Prisma, Resource, ServiceResource, ServiceStaff, StaffMember } from "@prisma/client";
import { Boxes, CalendarCheck, CalendarClock, CalendarDays, Check, CircleOff, Clock3, ExternalLink, Plus, Save, Tags, Users } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { requireAdmin } from "@/lib/auth";
import { absoluteCalendarUrl, icsCalendarAdapter, requestBaseUrl } from "@/lib/scheduling/calendar";
import { getGoogleCalendarConnections } from "@/lib/scheduling/google-calendar";
import { nativeSchedulingAdapter } from "@/lib/scheduling/native";
import { getSiteSettings } from "@/lib/site";
import { getTodayDateKey, parseZonedDateKey } from "@/lib/timezone";
import { Button, ButtonLink, TableFilterBar, type TableFilterSelect } from "@/components/ui";
import {
  addServicePackageItemAction,
  createServiceAction,
  createServicePackageAction,
  removeServicePackageItemAction,
  toggleServiceAction,
  updateServiceAction,
  updateServicePackageAction
} from "./actions";
import { AvailabilityPanel } from "./components/availability-panel";
import { BlockoutsPanel } from "./components/blockouts-panel";
import { CalendarFeedsPanel } from "./components/calendar-feeds-panel";
import { PackageBuilder, type PackageBuilderPackage, type PackageBuilderService } from "./components/package-builder";
import { RemindersPanel } from "./components/reminders-panel";
import { ResourcesPanel } from "./components/resources-panel";
import { ServiceCreateMenu } from "./components/service-create-menu";
import { ServiceWorkspaceTabs, type ServiceWorkspaceTab } from "./components/service-workspace-tabs";
import { SlotDiagnosticsPanel } from "./components/slot-diagnostics-panel";
import { StaffPanel } from "./components/staff-panel";

export const dynamic = "force-dynamic";

const servicesAdminPath = "/admin/modules/services";

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

type ServiceWithAssignments = Prisma.ServiceGetPayload<{
  include: {
    resourceAssignments: { include: { resource: true } };
    staffAssignments: { include: { staff: true } };
  };
}>;

type ServicePackageWithItems = Prisma.ServicePackageGetPayload<{
  include: {
    items: {
      include: {
        service: {
          include: {
            resourceAssignments: { include: { resource: true } };
            staffAssignments: { include: { staff: true } };
          };
        };
      };
    };
  };
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

function serviceDurationLabel(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours} hr ${remainder} min` : `${hours} hr`;
}

function compactList(values: string[], fallback: string) {
  return values.length ? values.join(", ") : fallback;
}

function serviceStaffLabel(service: { staffAssignments: Array<ServiceStaff & { staff: StaffMember }> }) {
  return compactList(
    service.staffAssignments.map((assignment) => assignment.staff.name),
    "Business-wide"
  );
}

function serviceResourceLabel(service: { resourceAssignments: Array<ServiceResource & { resource: Resource }> }) {
  return compactList(
    service.resourceAssignments.map((assignment) => assignment.resource.name),
    "No resources"
  );
}

function serviceStatusClass(isActive: boolean) {
  return isActive ? "catalog-status is-active" : "catalog-status is-draft";
}

function savedServiceMessage(saved?: string) {
  if (saved === "service") return "Service changes saved.";
  if (saved === "package") return "Package changes saved.";
  if (saved === "package-item") return "Package contents updated.";
  if (saved === "staff" || saved === "staff-link") return "Team settings saved.";
  if (saved === "resource") return "Resource settings saved.";
  if (saved === "availability") return "Availability saved.";
  if (saved === "blockout") return "Blockout saved.";
  if (saved === "reminders") return "Reminder settings saved.";
  if (saved === "google-calendar") return "Calendar connection saved.";
  if (saved) return "Services changes saved.";
  return null;
}

function visibleErrorMessage(error?: string) {
  if (!error) return null;
  if (error === "blockout") return "Blockouts must use valid start and end times.";
  return decodeURIComponent(error);
}

function serviceMatchesSearch(service: ServiceWithAssignments, searchQuery: string) {
  if (!searchQuery) return true;
  const haystack = [
    service.name,
    service.slug,
    service.description || "",
    service.location || "",
    serviceCategory(service),
    ...serviceTags(service),
    ...service.staffAssignments.map((assignment) => assignment.staff.name),
    ...service.resourceAssignments.map((assignment) => assignment.resource.name)
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(searchQuery.toLowerCase());
}

function toPackageBuilderService(service: ServiceWithAssignments): PackageBuilderService {
  return {
    category: serviceCategory(service),
    description: service.description || "",
    durationMinutes: service.durationMinutes,
    id: service.id,
    isActive: service.isActive,
    name: service.name,
    resourceLabel: serviceResourceLabel(service),
    staffLabel: serviceStaffLabel(service),
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

function AssignmentCheckboxes({
  assignedIds,
  checkboxIdPrefix,
  emptyLabel,
  items,
  label,
  name
}: {
  assignedIds: string[];
  checkboxIdPrefix: string;
  emptyLabel: string;
  items: Array<{ id: string; isActive: boolean; name: string }>;
  label: string;
  name: "resourceIds" | "staffIds";
}) {
  if (!items.length) {
    return <p className="muted-text">{emptyLabel}</p>;
  }

  return (
    <fieldset className="catalog-check-fieldset">
      <legend>{label}</legend>
      <div className="catalog-check-grid">
        {items.map((item) => (
          <label className="ui-check-row" key={item.id}>
            <input
              defaultChecked={assignedIds.includes(item.id)}
              disabled={!item.isActive}
              id={`${checkboxIdPrefix}-${item.id}`}
              name={name}
              type="checkbox"
              value={item.id}
            />
            {item.name}
          </label>
        ))}
      </div>
    </fieldset>
  );
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

export default async function SchedulingPage({ searchParams }: SchedulingPageProps) {
  const adminUser = await requireAdmin("scheduling:manage");
  const canLinkStaffAccounts = hasAdminPermission(adminUser, "users:manage");
  const [params, settings] = await Promise.all([searchParams, getSiteSettings()]);
  const baseUrl = await requestBaseUrl();
  const [
    services,
    servicePackages,
    staff,
    resources,
    availability,
    blockouts,
    schedulingSettings,
    googleCalendarConnections,
    adminUsers
  ] = await Promise.all([
    prisma.service.findMany({
      where: { siteId: settings.siteId },
      include: {
        resourceAssignments: { include: { resource: true }, orderBy: { resource: { name: "asc" } } },
        staffAssignments: { include: { staff: true }, orderBy: { staff: { name: "asc" } } }
      },
      orderBy: [{ isActive: "desc" }, { category: "asc" }, { createdAt: "asc" }]
    }),
    prisma.servicePackage.findMany({
      where: { siteId: settings.siteId },
      include: {
        items: {
          include: {
            service: {
              include: {
                resourceAssignments: { include: { resource: true }, orderBy: { resource: { name: "asc" } } },
                staffAssignments: { include: { staff: true }, orderBy: { staff: { name: "asc" } } }
              }
            }
          },
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
        }
      },
      orderBy: [{ isActive: "desc" }, { sortOrder: "asc" }, { name: "asc" }]
    }),
    prisma.staffMember.findMany({ where: { siteId: settings.siteId }, orderBy: [{ isActive: "desc" }, { name: "asc" }] }),
    prisma.resource.findMany({ where: { siteId: settings.siteId }, orderBy: [{ isActive: "desc" }, { name: "asc" }] }),
    prisma.availabilityRule.findMany({
      where: { siteId: settings.siteId },
      include: { resource: true, staff: true },
      orderBy: [{ staffId: "asc" }, { resourceId: "asc" }, { weekday: "asc" }, { startMinutes: "asc" }]
    }),
    prisma.blockedTime.findMany({ where: { siteId: settings.siteId }, include: { resource: true }, orderBy: { startsAt: "asc" }, take: 20 }),
    prisma.schedulingSettings.findUnique({ where: { siteId: settings.siteId } }),
    getGoogleCalendarConnections(settings.siteId),
    canLinkStaffAccounts
      ? prisma.adminUser.findMany({ select: { id: true, email: true, role: true }, orderBy: { email: "asc" } })
      : Promise.resolve([])
  ]);

  const searchQuery = (params.q || "").trim().slice(0, 120);
  const categories = Array.from(new Set(services.map(serviceCategory).filter(Boolean))).sort((left, right) => left.localeCompare(right));
  const tags = Array.from(new Set(services.flatMap(serviceTags))).sort((left, right) => left.localeCompare(right));
  const categoryFilter = categories.includes(params.category || "") ? String(params.category) : "all";
  const tagFilter = tags.includes(params.tag || "") ? String(params.tag) : "all";
  const filteredServices = services.filter((service) => {
    if (categoryFilter !== "all" && serviceCategory(service) !== categoryFilter) return false;
    if (tagFilter !== "all" && !serviceTags(service).includes(tagFilter)) return false;
    return serviceMatchesSearch(service, searchQuery);
  });

  const activeServices = services.filter((service) => service.isActive).length;
  const activePackages = servicePackages.filter((servicePackage) => servicePackage.isActive).length;
  const savedMessage = savedServiceMessage(params.saved);
  const errorMessage = visibleErrorMessage(params.error);
  const staffIdsWithAvailability = new Set(availability.flatMap((rule) => (rule.staffId ? [rule.staffId] : [])));
  const assignedStaffIds = new Set(services.flatMap((service) => service.staffAssignments.map((assignment) => assignment.staffId)));
  const resourceIdsWithAvailability = new Set(availability.flatMap((rule) => (rule.resourceId ? [rule.resourceId] : [])));
  const assignedResourceIds = new Set(services.flatMap((service) => service.resourceAssignments.map((assignment) => assignment.resourceId)));
  const selectedServiceId = services.some((service) => service.id === params.diagnosticServiceId)
    ? String(params.diagnosticServiceId)
    : services[0]?.id || "";
  const selectedDate = /^\d{4}-\d{2}-\d{2}$/.test(params.diagnosticDate || "")
    ? String(params.diagnosticDate)
    : getTodayDateKey(settings.timezone);
  const selectedStaffId = staff.some((member) => member.id === params.diagnosticStaffId) ? String(params.diagnosticStaffId) : "";
  const selectedResourceId = resources.some((resource) => resource.id === params.diagnosticResourceId) ? String(params.diagnosticResourceId) : "";
  const diagnosticDay = parseZonedDateKey(selectedDate, settings.timezone);
  const diagnostics =
    selectedServiceId && diagnosticDay
      ? await nativeSchedulingAdapter.getSlotDiagnostics(selectedServiceId, diagnosticDay, {
          resourceId: selectedResourceId || undefined,
          staffId: selectedStaffId || undefined
        })
      : null;

  const categorySelect: TableFilterSelect = {
    id: "services-category-filter",
    label: "Category",
    name: "category",
    value: categoryFilter,
    options: [
      { label: "All categories", value: "all" },
      ...categories.map((category) => ({ label: category, value: category }))
    ]
  };
  const tagSelect: TableFilterSelect = {
    id: "services-tag-filter",
    label: "Tag",
    name: "tag",
    value: tagFilter,
    options: [
      { label: "All tags", value: "all" },
      ...tags.map((tag) => ({ label: tag, value: tag }))
    ]
  };

  const createServiceForm = (
    <form action={createServiceAction} className="catalog-form-grid">
      {hiddenServiceDefaults()}
      <p className="muted-text">Create the base service first. Availability, team assignment, and package composition can be tuned after it exists.</p>
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
          <label htmlFor="new-service-location">Location</label>
          <input id="new-service-location" name="location" placeholder="Spa room, online, client location" />
        </div>
      </div>
      <div className="catalog-form-grid is-two">
        <div className="ui-field">
          <label htmlFor="new-service-category">Category</label>
          <input id="new-service-category" name="category" placeholder="Spa treatments" />
        </div>
        <div className="ui-field">
          <label htmlFor="new-service-tags">Tags</label>
          <input id="new-service-tags" name="tags" placeholder="relaxation, featured" />
        </div>
      </div>
      <div className="ui-field">
        <label htmlFor="new-service-description">Description</label>
        <textarea id="new-service-description" name="description" />
      </div>
      <label className="ui-check-row product-editor-inline-check">
        <input defaultChecked name="isActive" type="checkbox" />
        Active
      </label>
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
      <label className="ui-check-row product-editor-inline-check">
        <input defaultChecked name="isActive" type="checkbox" />
        Active
      </label>
      <div className="module-modal-actions">
        <Button type="submit">
          <Boxes size={18} />
          Create package
        </Button>
      </div>
    </form>
  );

  const servicesContent = (
    <section className="catalog-board service-board" aria-labelledby="services-board-title">
      <div className="catalog-board-header">
        <div>
          <p className="catalog-rail-label">Services</p>
          <h2 id="services-board-title">Service board</h2>
          <p>
            {filteredServices.length} of {services.length} services
            {searchQuery ? ` matching "${searchQuery}"` : ""}
          </p>
        </div>
        <div className="catalog-board-actions">
          <span className="catalog-pill is-green">
            <CalendarCheck size={15} />
            {activeServices} active
          </span>
          <span className="catalog-pill is-blue">
            <Boxes size={15} />
            {activePackages} packages
          </span>
          <ServiceCreateMenu
            items={[
              { content: createServiceForm, description: "Add a bookable base service.", id: "service", label: "Service", title: "Create service", type: "service" },
              { content: createPackageForm, description: "Compose multiple services together.", id: "package", label: "Package", title: "Create package", type: "package" }
            ]}
          />
        </div>
      </div>

      <TableFilterBar
        action={servicesAdminPath}
        className="catalog-board-filters"
        clearHref={servicesAdminPath}
        searchId="services-search"
        searchPlaceholder="Search service, category, tag"
        searchValue={searchQuery}
        selects={[categorySelect, tagSelect]}
        showClear={Boolean(searchQuery || categoryFilter !== "all" || tagFilter !== "all")}
      />

      <div className="catalog-table-scroll">
        <table className="catalog-product-table service-board-table">
          <thead>
            <tr>
              <th>Service</th>
              <th>Category</th>
              <th>Duration</th>
              <th>Team</th>
              <th>Booking rules</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredServices.map((service) => {
              const tagsForService = serviceTags(service);
              const category = serviceCategory(service) || "Uncategorized";
              return (
                <Fragment key={service.id}>
                  <tr>
                    <td>
                      <div className="catalog-product-cell">
                        <div className="catalog-row-thumb service-row-thumb">
                          <CalendarCheck size={18} />
                        </div>
                        <div className="catalog-row-copy">
                          <strong title={service.name}>{service.name}</strong>
                          <small title={`/book/${service.slug} · ${service.description || "No service description yet."}`}>
                            /book/{service.slug} · {service.description || "No service description yet."}
                          </small>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="catalog-cell-text" title={`${category}${tagsForService.length ? ` · ${tagsForService.join(", ")}` : ""}`}>
                        {category}
                      </span>
                      <small className="service-table-tags">{tagsForService.length ? tagsForService.join(", ") : "No tags"}</small>
                    </td>
                    <td>
                      <strong className="catalog-price-cell">{serviceDurationLabel(service.durationMinutes)}</strong>
                    </td>
                    <td>
                      <span className="catalog-cell-text" title={serviceStaffLabel(service)}>{serviceStaffLabel(service)}</span>
                      <small className="service-table-tags" title={serviceResourceLabel(service)}>{serviceResourceLabel(service)}</small>
                    </td>
                    <td>
                      <span className="catalog-cell-text" title={`${service.minimumNoticeHours}h notice · ${service.maxAdvanceDays}d advance`}>
                        {service.minimumNoticeHours}h notice
                      </span>
                      <small className="service-table-tags">{service.slotIntervalMinutes}m interval</small>
                    </td>
                    <td>
                      <span className={serviceStatusClass(service.isActive)}>{service.isActive ? "active" : "draft"}</span>
                    </td>
                    <td>
                      <div className="catalog-row-actions">
                        <form action={toggleServiceAction} className="ui-inline-form">
                          <input name="id" type="hidden" value={service.id} />
                          <input name="isActive" type="hidden" value={service.isActive ? "false" : "true"} />
                          <Button size="sm" type="submit" variant={service.isActive ? "ghost" : "secondary"}>
                            {service.isActive ? <CircleOff size={14} /> : <Check size={14} />}
                            {service.isActive ? "Disable" : "Enable"}
                          </Button>
                        </form>
                      </div>
                    </td>
                  </tr>
                  <tr className="service-edit-row">
                    <td colSpan={7}>
                      <details className="product-editor-advanced">
                        <summary>
                          <span>Edit service</span>
                          <small>{service.location || category}</small>
                        </summary>
                        <form action={updateServiceAction} className="studio-action-form">
                          <input name="id" type="hidden" value={service.id} />
                          <div className="catalog-form-grid is-two">
                            <div className="ui-field">
                              <label htmlFor={`service-${service.id}-name`}>Name</label>
                              <input defaultValue={service.name} id={`service-${service.id}-name`} name="name" required />
                            </div>
                            <div className="ui-field">
                              <label htmlFor={`service-${service.id}-slug`}>Booking URL slug</label>
                              <input defaultValue={service.slug} id={`service-${service.id}-slug`} name="slug" />
                            </div>
                          </div>
                          <div className="catalog-form-grid is-three">
                            <div className="ui-field">
                              <label htmlFor={`service-${service.id}-duration`}>Duration</label>
                              <input defaultValue={service.durationMinutes} id={`service-${service.id}-duration`} min="1" name="durationMinutes" step="5" type="number" required />
                            </div>
                            <div className="ui-field">
                              <label htmlFor={`service-${service.id}-category`}>Category</label>
                              <input defaultValue={serviceCategory(service)} id={`service-${service.id}-category`} name="category" />
                            </div>
                            <div className="ui-field">
                              <label htmlFor={`service-${service.id}-location`}>Location</label>
                              <input defaultValue={service.location || ""} id={`service-${service.id}-location`} name="location" />
                            </div>
                          </div>
                          <div className="ui-field">
                            <label htmlFor={`service-${service.id}-tags`}>Tags</label>
                            <input defaultValue={tagsForService.join(", ")} id={`service-${service.id}-tags`} name="tags" />
                          </div>
                          <div className="ui-field">
                            <label htmlFor={`service-${service.id}-description`}>Description</label>
                            <textarea defaultValue={service.description || ""} id={`service-${service.id}-description`} name="description" />
                          </div>
                          <div className="catalog-form-grid is-three">
                            <div className="ui-field">
                              <label htmlFor={`service-${service.id}-notice`}>Minimum notice</label>
                              <input defaultValue={service.minimumNoticeHours} id={`service-${service.id}-notice`} min="0" name="minimumNoticeHours" type="number" />
                            </div>
                            <div className="ui-field">
                              <label htmlFor={`service-${service.id}-advance`}>Max advance days</label>
                              <input defaultValue={service.maxAdvanceDays} id={`service-${service.id}-advance`} min="1" name="maxAdvanceDays" type="number" />
                            </div>
                            <div className="ui-field">
                              <label htmlFor={`service-${service.id}-interval`}>Slot interval</label>
                              <input defaultValue={service.slotIntervalMinutes} id={`service-${service.id}-interval`} min="1" name="slotIntervalMinutes" step="5" type="number" />
                            </div>
                          </div>
                          <div className="catalog-form-grid is-two">
                            <div className="ui-field">
                              <label htmlFor={`service-${service.id}-before`}>Buffer before</label>
                              <input defaultValue={service.bufferBeforeMinutes} id={`service-${service.id}-before`} min="0" name="bufferBeforeMinutes" step="5" type="number" />
                            </div>
                            <div className="ui-field">
                              <label htmlFor={`service-${service.id}-after`}>Buffer after</label>
                              <input defaultValue={service.bufferAfterMinutes} id={`service-${service.id}-after`} min="0" name="bufferAfterMinutes" step="5" type="number" />
                            </div>
                          </div>
                          <div className="catalog-form-grid is-two">
                            <div className="ui-field">
                              <label htmlFor={`service-${service.id}-intake`}>Intake question</label>
                              <input defaultValue={service.intakePrompt || ""} id={`service-${service.id}-intake`} name="intakePrompt" />
                            </div>
                            <div className="ui-field">
                              <label htmlFor={`service-${service.id}-policy`}>Booking policy</label>
                              <input defaultValue={service.policyText || ""} id={`service-${service.id}-policy`} name="policyText" />
                            </div>
                          </div>
                          <div className="studio-toggle-strip">
                            <label className="ui-check-row">
                              <input defaultChecked={service.requirePolicy && Boolean(service.policyText?.trim())} name="requirePolicy" type="checkbox" />
                              Require policy acceptance
                            </label>
                            <label className="ui-check-row">
                              <input defaultChecked={service.requestOnly} name="requestOnly" type="checkbox" />
                              Request-only approval
                            </label>
                            <label className="ui-check-row">
                              <input defaultChecked={service.waitlistEnabled} name="waitlistEnabled" type="checkbox" />
                              Offer waitlist
                            </label>
                            <label className="ui-check-row">
                              <input defaultChecked={service.isActive} name="isActive" type="checkbox" />
                              Active
                            </label>
                          </div>
                          <AssignmentCheckboxes
                            assignedIds={service.staffAssignments.map((assignment) => assignment.staffId)}
                            checkboxIdPrefix={`service-${service.id}-staff`}
                            emptyLabel="Add staff before assigning this service to specific people."
                            items={staff}
                            label="Staff who can take this service"
                            name="staffIds"
                          />
                          <AssignmentCheckboxes
                            assignedIds={service.resourceAssignments.map((assignment) => assignment.resourceId)}
                            checkboxIdPrefix={`service-${service.id}-resource`}
                            emptyLabel="Add rooms or equipment before requiring resources."
                            items={resources}
                            label="Required rooms or equipment"
                            name="resourceIds"
                          />
                          <Button type="submit">
                            <Save size={16} />
                            Save service
                          </Button>
                        </form>
                      </details>
                    </td>
                  </tr>
                </Fragment>
              );
            })}
            {!filteredServices.length ? (
              <tr>
                <td colSpan={7}>
                  <div className="catalog-empty-state">
                    <CalendarCheck size={30} />
                    <h3>No services found</h3>
                    <p>Add a base service or adjust the current filters.</p>
                  </div>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );

  const packageBuilderServices = filteredServices.map(toPackageBuilderService);
  const packageBuilderPackages = servicePackages.map(toPackageBuilderPackage);

  const packagesContent = (
    <PackageBuilder
      addPackageItemAction={addServicePackageItemAction}
      packages={packageBuilderPackages}
      removePackageItemAction={removeServicePackageItemAction}
      services={packageBuilderServices}
      updatePackageAction={updateServicePackageAction}
    />
  );

  const availabilityContent = (
    <div className="product-editor-stack">
      <AvailabilityPanel availability={availability} resources={resources} staff={staff} />
      <SlotDiagnosticsPanel
        diagnostics={diagnostics}
        resources={resources}
        selectedDate={selectedDate}
        selectedResourceId={selectedResourceId}
        selectedServiceId={selectedServiceId}
        selectedStaffId={selectedStaffId}
        services={services}
        staff={staff}
      />
      <BlockoutsPanel blockouts={blockouts} resources={resources} timezone={settings.timezone} />
    </div>
  );

  const teamContent = (
    <div className="product-editor-stack">
      <StaffPanel
        adminUsers={adminUsers}
        assignedStaffIds={assignedStaffIds}
        canLinkStaffAccounts={canLinkStaffAccounts}
        staff={staff}
        staffIdsWithAvailability={staffIdsWithAvailability}
      />
      <ResourcesPanel resources={resources} assignedResourceIds={assignedResourceIds} resourceIdsWithAvailability={resourceIdsWithAvailability} />
    </div>
  );

  const calendarContent = (
    <div className="product-editor-stack">
      <RemindersPanel
        enabled={schedulingSettings?.bookingReminderEnabled ?? true}
        leadMinutes={schedulingSettings?.bookingReminderLeadMinutes ?? 1440}
      />
      <CalendarFeedsPanel
        googleConnections={googleCalendarConnections.map((connection) => ({
          connection,
          staff: staff.find((member) => member.id === connection.ownerId) || null
        }))}
        siteFeedUrl={absoluteCalendarUrl(baseUrl, icsCalendarAdapter.feedPath({ siteId: settings.siteId }))}
        staff={staff}
        staffFeedUrls={staff.map((member) => ({
          staff: member,
          url: absoluteCalendarUrl(baseUrl, icsCalendarAdapter.feedPath({ siteId: settings.siteId, staffId: member.id }))
        }))}
      />
    </div>
  );

  const tabs: ServiceWorkspaceTab[] = [
    { content: servicesContent, icon: <CalendarCheck size={15} />, id: "services", label: "Services" },
    { content: packagesContent, icon: <Boxes size={15} />, id: "packages", label: "Packages" },
    { content: availabilityContent, icon: <CalendarDays size={15} />, id: "availability", label: "Days & times" },
    { content: teamContent, icon: <Users size={15} />, id: "team", label: "Team & resources" },
    { content: calendarContent, icon: <CalendarClock size={15} />, id: "calendar", label: "Calendar & reminders" }
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
            <p>Base services, packages, days, times, team, and calendar connections.</p>
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
              { content: createServiceForm, description: "Add a bookable base service.", id: "service-header", label: "Service", title: "Create service", type: "service" },
              { content: createPackageForm, description: "Compose multiple services together.", id: "package-header", label: "Package", title: "Create package", type: "package" }
            ]}
          />
        </div>
      </header>

      {savedMessage ? <div className="success-message">{savedMessage}</div> : null}
      {errorMessage ? <div className="error">{errorMessage}</div> : null}

      <ServiceWorkspaceTabs initialTab={params.tab} tabs={tabs} />
    </div>
  );
}
