"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { CalendarCheck, MoreHorizontal, Pencil, Search, X } from "lucide-react";
import { Button, ButtonLink, Pagination, SelectMenu, Tooltip, type SelectMenuOption } from "@/components/ui";
import { useCatalogTablePagination } from "./use-catalog-table-pagination";

type ServerAction = (formData: FormData) => void | Promise<void>;

export type ServiceCatalogTableService = {
  bookingPath: string;
  category: string;
  description: string;
  durationMinutes: number;
  id: string;
  imageUrl: string;
  isActive: boolean;
  location: string;
  name: string;
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
  return isActive ? "catalog-status is-active" : "catalog-status is-inactive";
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
    startIndex
  } = useCatalogTablePagination(filteredServices.length);
  const pagedServices = filteredServices.slice(startIndex, endIndex);
  const rangeStart = filteredServices.length ? startIndex + 1 : 0;
  const rangeEnd = endIndex;
  const hasServices = Boolean(services.length);
  const statusModalService = statusActionService || null;
  const nextToggleState = statusModalService?.isActive ? "draft" : "active";
  const toggleModalTitle = statusModalService ? `Mark ${statusModalService.name} ${nextToggleState}?` : "Update session type status";
  const toggleModalCopy =
    statusModalService?.isActive
      ? "This session type will be hidden from new bookings. Its details and existing appointments will stay in place."
      : "This session type will be available when booking a client. Online package selection is not available yet.";
  const servicesHref = "/admin/modules/services";

  const resetFilters = () => {
    setSearchQuery("");
    setCategoryFilter("all");
    setTagFilter("all");
    firstPage();
  };

  return (
    <div className="service-catalog-folder-panel" aria-labelledby="services-board-title">
      <div className="catalog-board-header">
        <div>
          <h2 id="services-board-title">Session types</h2>
          <p>
            {filteredServices.length ? `${rangeStart}-${rangeEnd}` : "0"} of {filteredServices.length || services.length}
            {normalizedSearch ? ` matching "${normalizedSearch}"` : " session types"}
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
            Search session type, category, tag
          </label>
          <span className="ui-table-filter-input">
            <Search aria-hidden="true" size={15} />
            <input
              id="services-search"
              onChange={(event) => {
                setSearchQuery(event.currentTarget.value);
                firstPage();
              }}
              placeholder="Search session type, category, tag"
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

      <ul aria-label="Session types" className="service-mobile-list">
        {pagedServices.map((service) => (
          <li key={service.id}>
            <div className="service-mobile-summary">
              <Link className="service-mobile-name" href={`/admin/modules/services/${service.id}`}>{service.name}</Link>
              <div className="service-mobile-meta">
                <span className={serviceStatusClass(service.isActive)}>{service.isActive ? "active" : "draft"}</span>
                <span>{serviceDurationLabel(service.durationMinutes)}</span>
                <span>{service.packageCount} {service.packageCount === 1 ? "package" : "packages"}</span>
              </div>
            </div>
            <ButtonLink aria-label={`Edit ${service.name}`} className="service-mobile-edit" href={`/admin/modules/services/${service.id}`} size="sm" variant="secondary">
              <Pencil aria-hidden="true" size={14} /> Edit
            </ButtonLink>
            <details className="service-mobile-actions">
              <summary aria-label={`More actions for ${service.name}`}><MoreHorizontal aria-hidden="true" size={18} /></summary>
              <ButtonLink aria-haspopup="dialog" href={`${servicesHref}?statusService=${encodeURIComponent(service.id)}`} size="sm" variant="ghost">
                {service.isActive ? "Mark draft" : "Mark active"}
              </ButtonLink>
            </details>
          </li>
        ))}
        {!filteredServices.length ? <li className="service-mobile-empty">
          <strong>{hasServices ? "No session types found" : "No session types yet"}</strong>
          {hasServices ? <p>Adjust the current filters.</p> : emptyCreateAction || <p>Create a session type to get started.</p>}
        </li> : null}
      </ul>
      <div aria-label="Session types table" className="catalog-table-scroll catalog-viewport-table service-desktop-table" role="region" tabIndex={0}>
        <table className="catalog-product-table">
          <thead>
            <tr>
              <th>Session type</th>
              <th>Status</th>
              <th>Category</th>
              <th>Tags</th>
              <th>Duration</th>
              <th>Packages</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {pagedServices.map((service) => {
              const category = service.category || "Uncategorized";
              const tagsLabel = service.tags.join(", ") || "No tags";
              const packageLabel = `${service.packageCount} ${service.packageCount === 1 ? "package" : "packages"}`;
              return (
                <tr key={service.id}>
                  <td data-label="Session type">
                    <div className="catalog-product-cell">
                      <div className="catalog-row-thumb">
                        {service.imageUrl ? <img alt="" src={service.imageUrl} /> : (
                          <span>
                            <CalendarCheck size={17} />
                          </span>
                        )}
                      </div>
                      <div className="catalog-row-copy">
                        <Link href={`/admin/modules/services/${service.id}`} title={service.name}>{service.name}</Link>
                        {service.description || service.location ? <small title={service.description || service.location}>{service.description || service.location}</small> : null}
                      </div>
                    </div>
                  </td>
                  <td data-label="Status">
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
                  <td data-label="Packages">
                    <span className="catalog-cell-text" title={packageLabel}>{packageLabel}</span>
                  </td>
                  <td data-label="Actions">
                    <div className="catalog-row-actions">
                      <Tooltip content="Edit session type" focusable={false}>
                        <ButtonLink
                          aria-label={`Edit ${service.name}`}
                          className="catalog-icon-button"
                          href={`/admin/modules/services/${service.id}`}
                          size="sm"
                          title="Edit session type"
                          variant="secondary">
                          <Pencil aria-hidden="true" size={15} />
                        </ButtonLink>
                      </Tooltip>
                      <Tooltip content={service.isActive ? "Mark draft" : "Mark active"} focusable={false}>
                        <ButtonLink
                          aria-haspopup="dialog"
                          aria-label={service.isActive ? `Mark ${service.name} draft` : `Mark ${service.name} active`}
                          className="catalog-status-action"
                          href={`${servicesHref}?statusService=${encodeURIComponent(service.id)}`}
                          size="sm"
                          title={service.isActive ? "Mark draft" : "Mark active"}
                          variant="secondary">
                          {service.isActive ? "Mark draft" : "Mark active"}
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
                <td colSpan={7}>
                  <div className="catalog-empty-state">
                    {hasServices ? (
                      <>
                        <h3>No session types found</h3>
                        <p>Adjust the current filters.</p>
                      </>
                    ) : (
                      <>
                        <h3>No session types yet</h3>
                        <div className="catalog-empty-state-action">
                          {emptyCreateAction || "Create a session type or adjust the current filters."}
                        </div>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <Pagination
        className="catalog-table-pagination"
        label="Service catalog pages"
        onNext={nextPage}
        onPrevious={previousPage}
        page={currentPage}
        pageCount={pageCount}
      />
      {statusModalService ? (
        <>
          <div aria-hidden="true" className="catalog-confirm-backdrop" />
          <dialog aria-labelledby="service-status-dialog-title" aria-modal="true" className="ui-dialog catalog-confirm-modal" open>
            <div className="ui-modal-head">
              <h2 className="ui-zero" id="service-status-dialog-title">
                {toggleModalTitle}
              </h2>
              <ButtonLink
                aria-label="Close dialog"
                className="ui-dialog-close"
                href={servicesHref}
                size="sm"
                title="Close dialog"
                variant="ghost">
                <X aria-hidden="true" size={16} />
              </ButtonLink>
            </div>
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
          </dialog>
        </>
      ) : null}
    </div>
  );
}
