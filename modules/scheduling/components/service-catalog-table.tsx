"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Boxes, CalendarCheck, ExternalLink, Search, X } from "lucide-react";
import { Button, ButtonLink, SelectMenu, type SelectMenuOption } from "@/components/ui";

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
  activePackages: number;
  activeServices: number;
  categoryOptions: SelectMenuOption[];
  createAction: ReactNode;
  initialCategory: string;
  initialSearch: string;
  initialTag: string;
  services: ServiceCatalogTableService[];
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
  return isActive ? "catalog-status is-active" : "catalog-status is-draft";
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
  activePackages,
  activeServices,
  categoryOptions,
  createAction,
  initialCategory,
  initialSearch,
  initialTag,
  services,
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

  const resetFilters = () => {
    setSearchQuery("");
    setCategoryFilter("all");
    setTagFilter("all");
  };

  return (
    <div className="service-catalog-folder-panel" aria-labelledby="services-board-title">
      <div className="catalog-board-header">
        <div>
          <p className="catalog-rail-label">Catalog</p>
          <h2 id="services-board-title">Service catalog</h2>
          <p>
            {filteredServices.length} of {services.length}
            {normalizedSearch ? ` matching "${normalizedSearch}"` : " services"}
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
              onChange={(event) => setSearchQuery(event.currentTarget.value)}
              placeholder="Search service, category, tag"
              value={searchQuery}
            />
          </span>

          <SelectMenu
            className="ui-table-filter-select"
            id="services-category-filter"
            label="Category"
            name="category"
            onValueChange={setCategoryFilter}
            options={categoryOptions}
            value={categoryFilter}
          />
          <SelectMenu
            className="ui-table-filter-select"
            id="services-tag-filter"
            label="Tag"
            name="tag"
            onValueChange={setTagFilter}
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

      <div className="catalog-table-scroll">
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
            {filteredServices.map((service) => {
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
                    <span className={serviceStatusClass(service.isActive)}>{service.isActive ? "active" : "draft"}</span>
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
                      <ButtonLink href={`/admin/modules/services/${service.id}`} size="sm" variant="secondary">
                        Edit
                      </ButtonLink>
                      <form action={toggleServiceAction} className="ui-inline-form">
                        <input name="id" type="hidden" value={service.id} />
                        <input name="isActive" type="hidden" value={service.isActive ? "false" : "true"} />
                        <Button size="sm" type="submit" variant={service.isActive ? "ghost" : "primary"}>
                          {service.isActive ? "Draft" : "Activate"}
                        </Button>
                      </form>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!filteredServices.length ? (
              <tr>
                <td colSpan={8}>
                  <div className="catalog-empty-state">
                    <CalendarCheck size={30} />
                    <h3>No services found</h3>
                    <p>Create a service or adjust the current filters.</p>
                  </div>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
