"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { Boxes, Plus, Search, X } from "lucide-react";
import { Button, ButtonLink, Pagination } from "@/components/ui";
import { useCatalogTablePagination } from "./use-catalog-table-pagination";

export type ServicePackageTablePackage = {
  bookingPath: string;
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
  activePackages: number;
  packages: ServicePackageTablePackage[];
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
    ...servicePackage.tags,
    ...servicePackage.serviceNames
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(searchQuery.toLowerCase());
}

export function ServicePackageTable({ activePackages, packages }: ServicePackageTableProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const normalizedSearch = searchQuery.trim().slice(0, 120);
  const filteredPackages = useMemo(
    () => packages.filter((servicePackage) => packageMatchesSearch(servicePackage, normalizedSearch)),
    [normalizedSearch, packages]
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
  } = useCatalogTablePagination(filteredPackages.length);
  const pagedPackages = filteredPackages.slice(startIndex, endIndex);
  const rangeStart = filteredPackages.length ? startIndex + 1 : 0;
  const rangeEnd = endIndex;

  return (
    <div className="service-catalog-folder-panel" aria-labelledby="packages-board-title">
      <div className="catalog-board-header">
        <div>
          <p className="catalog-rail-label">Catalog</p>
          <h2 id="packages-board-title">Package catalog</h2>
          <p>
            {filteredPackages.length ? `${rangeStart}-${rangeEnd}` : "0"} of {filteredPackages.length || packages.length}
            {normalizedSearch ? ` matching "${normalizedSearch}"` : " packages"}
          </p>
        </div>
        <div className="catalog-board-actions">
          <span className="catalog-pill is-blue">
            <Boxes size={15} />
            {activePackages} active
          </span>
          <ButtonLink href="/admin/modules/services/packages/new" size="sm">
            <Plus size={15} />
            New package
          </ButtonLink>
        </div>
      </div>

      <div className="ui-table-filter-bar catalog-board-filters">
        <div className="ui-table-filter-search" role="search">
          <label className="ui-sr-only" htmlFor="packages-search">
            Search package, service, tag
          </label>
          <span className="ui-table-filter-input">
            <Search aria-hidden="true" size={15} />
            <input
              id="packages-search"
              onChange={(event) => {
                setSearchQuery(event.currentTarget.value);
                firstPage();
              }}
              placeholder="Search package, service, tag"
              value={searchQuery}
            />
          </span>
          {normalizedSearch ? (
            <Button
              onClick={() => {
                setSearchQuery("");
                firstPage();
              }}
              size="sm"
              type="button"
              variant="ghost">
              <X size={15} />
              Reset
            </Button>
          ) : null}
        </div>
      </div>

      <div className="catalog-table-scroll catalog-viewport-table" ref={setTableFrameRef}>
        <table className="catalog-product-table service-package-table">
          <thead>
            <tr>
              <th>Package</th>
              <th>Status</th>
              <th>Services</th>
              <th>Duration</th>
              <th>Tags</th>
              <th>Booking</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {pagedPackages.map((servicePackage) => {
              const tagsLabel = servicePackage.tags.join(", ") || "No tags";
              const servicesLabel = servicePackage.serviceNames.join(", ") || "No services";
              return (
                <tr key={servicePackage.id}>
                  <td>
                    <div className="catalog-product-cell">
                      <div className="catalog-row-thumb">
                        <span>
                          <Boxes size={17} />
                        </span>
                      </div>
                      <div className="catalog-row-copy">
                        <strong title={servicePackage.name}>{servicePackage.name}</strong>
                        <small title={servicePackage.description || servicesLabel}>{servicePackage.description || servicesLabel}</small>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className={servicePackage.isActive ? "catalog-status is-active" : "catalog-status is-draft"}>
                      {servicePackage.isActive ? "active" : "draft"}
                    </span>
                  </td>
                  <td>
                    <span className="catalog-cell-text" title={servicesLabel}>
                      {servicePackage.itemCount} svc
                    </span>
                  </td>
                  <td>
                    <strong className="catalog-price-cell">{packageDurationLabel(servicePackage.durationMinutes)}</strong>
                  </td>
                  <td>
                    <span className="catalog-cell-text" title={tagsLabel}>{tagsLabel}</span>
                  </td>
                  <td>
                    <span className="catalog-cell-text" title={servicePackage.bookingPath}>{servicePackage.bookingPath}</span>
                  </td>
                  <td>
                    <div className="catalog-row-actions">
                      <ButtonLink href={`/admin/modules/services/packages/${servicePackage.id}`} size="sm" variant="secondary">
                        Edit
                      </ButtonLink>
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
                <td colSpan={7} />
              </tr>
            ) : null}
            {!filteredPackages.length ? (
              <tr
                className="catalog-table-empty-state-row"
                style={{ "--catalog-table-empty-rows": emptyRowCount } as CSSProperties}>
                <td colSpan={7}>
                  <div className="catalog-empty-state">
                    <Boxes size={30} />
                    <h3>No packages found</h3>
                    <p>Create a package or adjust the current search.</p>
                  </div>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <Pagination
        className="ui-pagination-round catalog-table-pagination"
        label="Package catalog pages"
        onNext={nextPage}
        onPrevious={previousPage}
        page={currentPage}
        pageCount={pageCount}
      />
    </div>
  );
}
