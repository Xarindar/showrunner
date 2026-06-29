"use client";

import { useMemo, useState } from "react";
import { Boxes, Plus, Search, X } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui";

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

  return (
    <div className="service-catalog-folder-panel" aria-labelledby="packages-board-title">
      <div className="catalog-board-header">
        <div>
          <p className="catalog-rail-label">Catalog</p>
          <h2 id="packages-board-title">Package catalog</h2>
          <p>
            {filteredPackages.length} of {packages.length}
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
              onChange={(event) => setSearchQuery(event.currentTarget.value)}
              placeholder="Search package, service, tag"
              value={searchQuery}
            />
          </span>
          {normalizedSearch ? (
            <Button onClick={() => setSearchQuery("")} size="sm" type="button" variant="ghost">
              <X size={15} />
              Reset
            </Button>
          ) : null}
        </div>
      </div>

      <div className="catalog-table-scroll">
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
            {filteredPackages.map((servicePackage) => {
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
            {!filteredPackages.length ? (
              <tr>
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
    </div>
  );
}
