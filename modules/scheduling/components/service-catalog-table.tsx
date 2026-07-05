"use client";

import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { CalendarCheck, ExternalLink, Eye, EyeOff, Pencil, Search, X } from "lucide-react";
import { Button, ButtonLink, Pagination, SelectMenu, Tooltip, type SelectMenuOption } from "@/components/ui";
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
    emptyRowCount,
    endIndex,
    fillerRowCount,
    firstPage,
    nextPage,
    pageCount,
    previousPage,
    setTableFrameRef,
    startIndex
  } = useCatalogTablePagination(filteredServices.length);
  const pagedServices = filteredServices.slice(startIndex, endIndex);
  const rangeStart = filteredServices.length ? startIndex + 1 : 0;
  const rangeEnd = endIndex;
  const hasServices = Boolean(services.length);
  const statusModalService = statusActionService || null;
  const nextToggleState = statusModalService?.isActive ? "inactive" : "active";
  const toggleModalTitle = statusModalService ? `Mark ${statusModalService.name} ${nextToggleState}?` : "Update service status";
  const toggleModalCopy =
    statusModalService?.isActive
      ? "This service will be removed from public booking, but its catalog details and existing appointments will stay in place."
      : "This service will become available anywhere active services are shown, including booking surfaces.";
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
          <p className="catalog-rail-label">Catalog</p>
          <h2 id="services-board-title">Service catalog</h2>
          <p>
            {filteredServices.length ? `${rangeStart}-${rangeEnd}` : "0"} of {filteredServices.length || services.length}
            {normalizedSearch ? ` matching "${normalizedSearch}"` : " services"}
          </p>
        </div>
        <div className="catalog-board-actions">
          <ButtonLink href="/book" rel="noreferrer" size="sm" target="_blank" variant="secondary">
            <ExternalLink size={15} />
            View booking
          </ButtonLink>
          {createAction}
        </div>
      </div>

      <div className="ui-table-filter-bar catalog-board-filters">
        <div className="ui-table-filter-search" role="search">
          <label className="ui-sr-only" htmlFor="services-search">
            Search service, category, tag
          </label>
          <span className="ui-table-filter-input">
            <Search aria-hidden="true" size={15} />
            <input
              id="services-search"
              onChange={(event) => {
                setSearchQuery(event.currentTarget.value);
                firstPage();
              }}
              placeholder="Search service, category, tag"
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

      <div className="catalog-table-scroll catalog-viewport-table" ref={setTableFrameRef}>
        <table className="catalog-product-table">
          <thead>
            <tr>
              <th>Service</th>
              <th>Status</th>
              <th>Category</th>
              <th>Tags</th>
              <th>Duration</th>
              <th>Packages</th>
              <th>Booking</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {pagedServices.map((service) => {
              const category = service.category || "Uncategorized";
              const tagsLabel = service.tags.join(", ") || "No tags";
              const packageLabel = `${service.packageCount} pkg`;
              return (
                <tr key={service.id}>
                  <td>
                    <div className="catalog-product-cell">
                      <div className="catalog-row-thumb">
                        <span>
                          <CalendarCheck size={17} />
                        </span>
                      </div>
                      <div className="catalog-row-copy">
                        <strong title={service.name}>{service.name}</strong>
                        <small title={`${service.bookingPath} · ${service.description || service.location || "No service copy yet."}`}>
                          {service.bookingPath} · {service.description || service.location || "No service copy yet."}
                        </small>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className={serviceStatusClass(service.isActive)}>{service.isActive ? "active" : "inactive"}</span>
                  </td>
                  <td>
                    <span className="catalog-cell-text" title={category}>{category}</span>
                  </td>
                  <td>
                    <span className="catalog-cell-text" title={tagsLabel}>{tagsLabel}</span>
                  </td>
                  <td>
                    <strong className="catalog-price-cell">{serviceDurationLabel(service.durationMinutes)}</strong>
                  </td>
                  <td>
                    <span className="catalog-cell-text" title={packageLabel}>{packageLabel}</span>
                  </td>
                  <td>
                    <span className="catalog-cell-text" title={service.bookingPath}>{service.bookingPath}</span>
                  </td>
                  <td>
                    <div className="catalog-row-actions">
                      <Tooltip content="Edit service" focusable={false}>
                        <ButtonLink
                          aria-label={`Edit ${service.name}`}
                          className="catalog-icon-button"
                          href={`/admin/modules/services/${service.id}`}
                          size="sm"
                          title="Edit service"
                          variant="secondary">
                          <Pencil aria-hidden="true" size={15} />
                        </ButtonLink>
                      </Tooltip>
                      <Tooltip content={service.isActive ? "Mark inactive" : "Mark active"} focusable={false}>
                        <ButtonLink
                          aria-haspopup="dialog"
                          aria-label={service.isActive ? `Mark ${service.name} inactive` : `Mark ${service.name} active`}
                          className={`catalog-icon-button catalog-visibility-toggle ${service.isActive ? "is-live" : "is-muted"}`}
                          href={`${servicesHref}?statusService=${encodeURIComponent(service.id)}`}
                          size="sm"
                          title={service.isActive ? "Mark inactive" : "Mark active"}
                          variant="secondary">
                          {service.isActive ? <Eye aria-hidden="true" size={16} /> : <EyeOff aria-hidden="true" size={16} />}
                        </ButtonLink>
                      </Tooltip>
                    </div>
                  </td>
                </tr>
              );
            })}
            {fillerRowCount ? (
              <tr
                aria-hidden="true"
                className="catalog-table-filler-row"
                style={{ "--catalog-table-filler-rows": fillerRowCount } as CSSProperties}>
                <td colSpan={8} />
              </tr>
            ) : null}
            {!filteredServices.length ? (
              <tr
                className="catalog-table-empty-state-row"
                style={{ "--catalog-table-empty-rows": emptyRowCount } as CSSProperties}>
                <td colSpan={8}>
                  <div className="catalog-empty-state">
                    {hasServices ? (
                      <>
                        <h3>No services found</h3>
                        <p>Adjust the current filters.</p>
                      </>
                    ) : (
                      <>
                        <h3>No services made</h3>
                        <div className="catalog-empty-state-action">
                          {emptyCreateAction || "Create a service or adjust the current filters."}
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
                  {statusModalService.isActive ? <EyeOff aria-hidden="true" size={15} /> : <Eye aria-hidden="true" size={15} />}
                  {statusModalService.isActive ? "Mark inactive" : "Mark active"}
                </Button>
              </div>
            </form>
          </dialog>
        </>
      ) : null}
    </div>
  );
}
