"use client";

import { ResponsiveTableFrame } from "@/components/ui/responsive-table";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import { Eye, EyeOff, Pencil, Search, X } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Pagination } from "@/components/ui/pagination";
import { SelectMenu, type SelectMenuOption } from "@/components/ui/select-menu";
import { Tooltip } from "@/components/ui/tooltip";
import { useCatalogTablePagination } from "./use-catalog-table-pagination";

type ServerAction = (formData: FormData) => void | Promise<void>;

export type ServiceCatalogTableService = {
  bookingPath: string;
  category: string;
  description: string;
  durationMinutes: number;
  id: string;
  isActive: boolean;
  location: string;
  name: string;
  pricing: string;
  packageCount: number;
  tags: string[];
};

type ServiceCatalogTableProps = {
  categoryOptions: SelectMenuOption[];
  createAction: ReactNode;
  emptyCreateAction?: ReactNode;
  initialCategory: string;
  initialSearch: string;
  initialTag: string;
  services: ServiceCatalogTableService[];
  statusActionService?: ServiceCatalogTableService | null;
  tagOptions: SelectMenuOption[];
  toggleServiceAction: ServerAction;
};

function serviceDurationLabel(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours} hr ${remainder} min` : `${hours} hr`;
}

function serviceStatusClass(isActive: boolean) {
  return isActive ? "catalog-status is-active" : "catalog-status";
}

function serviceMatchesSearch(service: ServiceCatalogTableService, searchQuery: string) {
  if (!searchQuery) return true;
  const haystack = [
    service.name,
    service.bookingPath,
    service.description,
    service.location,
    service.category,
    ...service.tags
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(searchQuery.toLowerCase());
}

export function ServiceCatalogTable({
  categoryOptions,
  createAction,
  emptyCreateAction,
  initialCategory,
  initialSearch,
  initialTag,
  services,
  statusActionService,
  tagOptions,
  toggleServiceAction
}: ServiceCatalogTableProps) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState(initialSearch);
  const [categoryFilter, setCategoryFilter] = useState(initialCategory);
  const [tagFilter, setTagFilter] = useState(initialTag);
  const normalizedSearch = searchQuery.trim().slice(0, 120);
  const filtersActive = Boolean(normalizedSearch || categoryFilter !== "all" || tagFilter !== "all");
  const filteredServices = useMemo(
    () =>
      services.filter((service) => {
        if (categoryFilter !== "all" && service.category !== categoryFilter) return false;
        if (tagFilter !== "all" && !service.tags.includes(tagFilter)) return false;
        return serviceMatchesSearch(service, normalizedSearch);
      }),
    [categoryFilter, normalizedSearch, services, tagFilter]
  );
  const {
    currentPage,
    endIndex,
    firstPage,
    nextPage,
    pageCount,
    previousPage,
    resizePage,
    startIndex
  } = useCatalogTablePagination(filteredServices.length);
  const pagedServices = filteredServices.slice(startIndex, endIndex);
  const rangeStart = filteredServices.length ? startIndex + 1 : 0;
  const rangeEnd = endIndex;
  const hasServices = Boolean(services.length);
  const statusModalService = statusActionService || null;
  const nextToggleState = statusModalService?.isActive ? "draft" : "active";
  const toggleModalTitle = statusModalService ? `Mark ${statusModalService.name} ${nextToggleState}?` : "Update session status";
  const toggleModalCopy =
    statusModalService?.isActive
      ? "This session will be hidden from new bookings. Its details and existing appointments will stay in place."
      : "This session will be available when booking a client. Online package selection is not available yet.";
  const servicesHref = "/admin/modules/services";

  const resetFilters = () => {
    setSearchQuery("");
    setCategoryFilter("all");
    setTagFilter("all");
    firstPage();
  };

  return (
    <div data-viewport-table className="service-catalog-folder-panel" aria-labelledby="services-board-title">
      <div className="catalog-board-header">
        <div>
          <h2 id="services-board-title">Sessions</h2>
          <p>
            {filteredServices.length ? `${rangeStart}-${rangeEnd}` : "0"} of {filteredServices.length || services.length}
            {normalizedSearch ? ` matching "${normalizedSearch}"` : " sessions"}
          </p>
        </div>
        <div className="catalog-board-actions">
          <span className="ui-badge">Online booking unavailable</span>
          {createAction}
        </div>
      </div>

      <div className="ui-table-filter-bar catalog-board-filters">
        <div className="ui-table-filter-search" role="search">
          <label className="ui-sr-only" htmlFor="services-search">
            Search session, category, tag
          </label>
          <span className="ui-table-filter-input">
            <Search aria-hidden="true" size={15} />
            <input
              id="services-search"
              onChange={(event) => {
                setSearchQuery(event.currentTarget.value);
                firstPage();
              }}
              placeholder="Search session, category, tag"
              value={searchQuery}
            />
          </span>

          <SelectMenu
            className="ui-table-filter-select"
            id="services-category-filter"
            label="Category"
            name="category"
            onValueChange={(value) => {
              setCategoryFilter(value);
              firstPage();
            }}
            options={categoryOptions}
            value={categoryFilter}
          />
          <SelectMenu
            className="ui-table-filter-select"
            id="services-tag-filter"
            label="Tag"
            name="tag"
            onValueChange={(value) => {
              setTagFilter(value);
              firstPage();
            }}
            options={tagOptions}
            value={tagFilter}
          />

          {filtersActive ? (
            <Button onClick={resetFilters} size="sm" type="button" variant="ghost">
              <X size={15} />
              Reset
            </Button>
          ) : null}
        </div>
      </div>

      <ResponsiveTableFrame mobileLayout="columns" aria-label="Sessions table" className="catalog-table-scroll catalog-viewport-table service-desktop-table" role="region" tabIndex={0}>
        <table className="catalog-product-table">
          <thead>
            <tr>
              <th data-mobile-column>Session</th>
              <th data-mobile-column>Status</th>
              <th>Category</th>
              <th>Tags</th>
              <th>Duration</th>
              <th>Price</th>
              <th data-mobile-column>Packages</th>
              <th data-mobile-column>Actions</th>
            </tr>
          </thead>
          <tbody>
            {pagedServices.map((service) => {
              const category = service.category || "Uncategorized";
              const tagsLabel = service.tags.join(", ") || "No tags";
              return (
                <tr key={service.id}>
                  <td data-mobile-column data-label="Session">
                    <div className="catalog-row-copy">
                      <Link className="catalog-cell-text" href={`/admin/modules/services/${service.id}`} title={service.name}>{service.name}</Link>
                    </div>
                  </td>
                  <td data-mobile-column data-label="Status">
                    <span className={serviceStatusClass(service.isActive)}>{service.isActive ? "active" : "draft"}</span>
                  </td>
                  <td data-label="Category">
                    <span className="catalog-cell-text" title={category}>{category}</span>
                  </td>
                  <td data-label="Tags">
                    <span className="catalog-cell-text" title={tagsLabel}>{tagsLabel}</span>
                  </td>
                  <td data-label="Duration">
                    <strong className="catalog-price-cell">{serviceDurationLabel(service.durationMinutes)}</strong>
                  </td>
                  <td data-label="Price">
                    <span className="catalog-cell-text" title={service.pricing === "-" ? "Price not set" : service.pricing}>{service.pricing}</span>
                  </td>
                  <td data-mobile-column data-label="Packages">{service.packageCount}</td>
                  <td data-mobile-column data-label="Actions">
                    <div className="catalog-row-actions">
                      <Tooltip content="Edit session" focusable={false}>
                        <ButtonLink
                          aria-label={`Edit ${service.name}`}
                          className="catalog-icon-button"
                          href={`/admin/modules/services/${service.id}`}
                          size="sm"
                          title="Edit session"
                          variant="secondary">
                          <Pencil aria-hidden="true" size={15} />
                        </ButtonLink>
                      </Tooltip>
                      <Tooltip content={service.isActive ? "Mark draft" : "Mark active"} focusable={false}>
                        <ButtonLink
                          aria-haspopup="dialog"
                          aria-label={service.isActive ? `Mark ${service.name} draft` : `Mark ${service.name} active`}
                          className="catalog-icon-button"
                          href={`${servicesHref}?statusService=${encodeURIComponent(service.id)}`}
                          size="sm"
                          title={service.isActive ? "Mark draft" : "Mark active"}
                          variant="secondary">
                          {service.isActive ? <EyeOff aria-hidden="true" size={15} /> : <Eye aria-hidden="true" size={15} />}
                        </ButtonLink>
                      </Tooltip>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!filteredServices.length ? (
              <tr
                className="catalog-table-empty-state-row"
                >
                <td colSpan={8}>
                  <div className="catalog-empty-state">
                    {hasServices ? (
                      <>
                        <h3>No sessions found</h3>
                        <p>Adjust the current filters.</p>
                      </>
                    ) : (
                      <>
                        <h3>No sessions yet</h3>
                        <div className="catalog-empty-state-action">
                          {emptyCreateAction || "Create a session or adjust the current filters."}
                        </div>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </ResponsiveTableFrame>
      <Pagination
        onPageSizeChange={resizePage}
        className="catalog-table-pagination"
        label="Service catalog pages"
        onNext={nextPage}
        onPrevious={previousPage}
        page={currentPage}
        pageCount={pageCount}
      />
      {statusModalService ? (
        <Modal open title={toggleModalTitle} className="catalog-confirm-modal" onClose={() => router.push(servicesHref)}>
            <form action={toggleServiceAction} className="catalog-confirm-form">
              <p className="catalog-confirm-copy">{toggleModalCopy}</p>
              <input name="id" type="hidden" value={statusModalService.id} />
              <input name="isActive" type="hidden" value={statusModalService.isActive ? "false" : "true"} />
              <div className="module-modal-actions">
                <ButtonLink href={servicesHref} variant="ghost">
                  Cancel
                </ButtonLink>
                <Button type="submit" variant={statusModalService.isActive ? "danger" : "primary"}>
                  {statusModalService.isActive ? "Mark draft" : "Mark active"}
                </Button>
              </div>
            </form>
        </Modal>
      ) : null}
    </div>
  );
}
