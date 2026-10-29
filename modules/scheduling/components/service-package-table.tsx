"use client";

import { useMemo, useState } from "react";
import { Boxes, Pencil, Plus, Search, X } from "lucide-react";
import Link from "next/link";
import { Button, ButtonLink } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { SelectMenu, type SelectMenuOption } from "@/components/ui/select-menu";
import { Tooltip } from "@/components/ui/tooltip";
import { useCatalogTablePagination } from "./use-catalog-table-pagination";

export type ServicePackageTablePackage = {
  bookingPath: string;
  categories: string[];
  description: string;
  durationMinutes: number;
  id: string;
  isActive: boolean;
  itemCount: number;
  name: string;
  serviceNames: string[];
  sortOrder: number;
  tags: string[];
};

type ServicePackageTableProps = {
  categoryOptions: SelectMenuOption[];
  packages: ServicePackageTablePackage[];
  tagOptions: SelectMenuOption[];
};

function packageDurationLabel(minutes: number) {
  if (!minutes) return "Not set";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours} hr ${remainder} min` : `${hours} hr`;
}

function packageMatchesSearch(servicePackage: ServicePackageTablePackage, searchQuery: string) {
  if (!searchQuery) return true;
  const haystack = [
    servicePackage.name,
    servicePackage.bookingPath,
    servicePackage.description,
    ...servicePackage.categories,
    ...servicePackage.tags,
    ...servicePackage.serviceNames
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(searchQuery.toLowerCase());
}

export function ServicePackageTable({ categoryOptions, packages, tagOptions }: ServicePackageTableProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [tagFilter, setTagFilter] = useState("all");
  const normalizedSearch = searchQuery.trim().slice(0, 120);
  const filtersActive = Boolean(normalizedSearch || categoryFilter !== "all" || tagFilter !== "all");
  const filteredPackages = useMemo(
    () =>
      packages.filter((servicePackage) => {
        if (categoryFilter !== "all" && !servicePackage.categories.includes(categoryFilter)) return false;
        if (tagFilter !== "all" && !servicePackage.tags.includes(tagFilter)) return false;
        return packageMatchesSearch(servicePackage, normalizedSearch);
      }),
    [categoryFilter, normalizedSearch, packages, tagFilter]
  );
  const {
    currentPage,
    endIndex,
    firstPage,
    nextPage,
    pageCount,
    previousPage,
    startIndex
  } = useCatalogTablePagination(filteredPackages.length);
  const pagedPackages = filteredPackages.slice(startIndex, endIndex);
  const rangeStart = filteredPackages.length ? startIndex + 1 : 0;
  const rangeEnd = endIndex;
  const hasPackages = Boolean(packages.length);

  const resetFilters = () => {
    setSearchQuery("");
    setCategoryFilter("all");
    setTagFilter("all");
    firstPage();
  };

  return (
    <div className="service-catalog-folder-panel" aria-labelledby="packages-board-title">
      <div className="catalog-board-header">
        <div>
          <h2 id="packages-board-title">Service bundles</h2>
          <p>
            {filteredPackages.length ? `${rangeStart}-${rangeEnd}` : "0"} of {filteredPackages.length || packages.length}
            {normalizedSearch ? ` matching "${normalizedSearch}"` : " bundles"}
          </p>
        </div>
        <div className="catalog-board-actions">
          <ButtonLink href="/admin/modules/services/packages/new" size="sm">
            <Plus size={15} />
            New service bundle
          </ButtonLink>
        </div>
      </div>

      <p className="muted-text">Bundles combine separate services. For package choices within one session type, open Session types and edit its packages.</p>
      <div className="ui-table-filter-bar catalog-board-filters">
        <div className="ui-table-filter-search" role="search">
          <label className="ui-sr-only" htmlFor="packages-search">
            Search bundle, service, category, tag
          </label>
          <span className="ui-table-filter-input">
            <Search aria-hidden="true" size={15} />
            <input
              id="packages-search"
              onChange={(event) => {
                setSearchQuery(event.currentTarget.value);
                firstPage();
              }}
              placeholder="Search bundle, service, category, tag"
              value={searchQuery}
            />
          </span>
          <SelectMenu
            className="ui-table-filter-select"
            id="packages-category-filter"
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
            id="packages-tag-filter"
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

      <div className="catalog-table-scroll catalog-viewport-table">
        <table className="catalog-product-table service-package-table">
          <thead>
            <tr>
              <th>Bundle</th>
              <th>Status</th>
              <th>Services</th>
              <th>Duration</th>
              <th>Tags</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {pagedPackages.map((servicePackage) => {
              const tagsLabel = servicePackage.tags.join(", ") || "No tags";
              const servicesLabel = servicePackage.serviceNames.join(", ") || "No services";
              return (
                <tr key={servicePackage.id}>
                  <td data-label="Bundle">
                    <div className="catalog-product-cell">
                      <div className="catalog-row-thumb">
                        <span>
                          <Boxes size={17} />
                        </span>
                      </div>
                      <div className="catalog-row-copy">
                        <Link href={`/admin/modules/services/packages/${servicePackage.id}`} title={servicePackage.name}>{servicePackage.name}</Link>
                        <small title={servicePackage.description || servicesLabel}>{servicePackage.description || servicesLabel}</small>
                      </div>
                    </div>
                  </td>
                  <td data-label="Status">
                    <span className={servicePackage.isActive ? "catalog-status is-active" : "catalog-status"}>
                      {servicePackage.isActive ? "active" : "draft"}
                    </span>
                  </td>
                  <td data-label="Services">
                    <span className="catalog-cell-text" title={servicesLabel}>
                      {servicePackage.itemCount} svc
                    </span>
                  </td>
                  <td data-label="Duration">
                    <strong className="catalog-price-cell">{packageDurationLabel(servicePackage.durationMinutes)}</strong>
                  </td>
                  <td data-label="Tags">
                    <span className="catalog-cell-text" title={tagsLabel}>{tagsLabel}</span>
                  </td>
                  <td data-label="Actions">
                    <div className="catalog-row-actions">
                      <Tooltip content="Edit bundle" focusable={false}>
                        <ButtonLink
                          aria-label={`Edit ${servicePackage.name}`}
                          className="catalog-icon-button"
                          href={`/admin/modules/services/packages/${servicePackage.id}`}
                          size="sm"
                          title="Edit bundle"
                          variant="secondary">
                          <Pencil aria-hidden="true" size={15} />
                        </ButtonLink>
                      </Tooltip>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!filteredPackages.length ? (
              <tr
                className="catalog-table-empty-state-row"
                >
                <td colSpan={6}>
                  <div className="catalog-empty-state">
                    {hasPackages ? (
                      <>
                        <h3>No bundles found</h3>
                        <p>Adjust the current filters.</p>
                      </>
                    ) : (
                      <>
                        <h3>No service bundles yet</h3>
                        <p>
                          <Link className="catalog-empty-state-link" href="/admin/modules/services/packages/new">
                            Create your first service bundle
                          </Link>
                        </p>
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
        label="Service bundle catalog pages"
        onNext={nextPage}
        onPrevious={previousPage}
        page={currentPage}
        pageCount={pageCount}
      />
    </div>
  );
}
