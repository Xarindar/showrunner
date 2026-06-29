"use client";

import { useCallback, useRef, useState, type DragEvent } from "react";
import { Boxes, Clock3, GripVertical, Layers3, Plus, Tag, Trash2 } from "lucide-react";
import { Button, Switch } from "@/components/ui";
import { cx } from "@/components/ui/utils";

type ServerAction = (formData: FormData) => void | Promise<void>;

export type PackageBuilderService = {
  category: string;
  description: string;
  durationMinutes: number;
  id: string;
  isActive: boolean;
  name: string;
  tags: string[];
};

export type PackageBuilderPackageItem = {
  id: string;
  quantity: number;
  service: PackageBuilderService;
  sortOrder: number;
};

export type PackageBuilderPackage = {
  description: string;
  id: string;
  isActive: boolean;
  items: PackageBuilderPackageItem[];
  name: string;
  slug: string;
  sortOrder: number;
  tags: string[];
};

type PackageBuilderProps = {
  addPackageItemAction: ServerAction;
  packages: PackageBuilderPackage[];
  removePackageItemAction: ServerAction;
  services: PackageBuilderService[];
  updatePackageAction: ServerAction;
};

function serviceDurationLabel(minutes: number) {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

function packageDuration(items: PackageBuilderPackageItem[]) {
  return items.reduce((total, item) => total + item.service.durationMinutes * item.quantity, 0);
}

export function PackageBuilder({
  addPackageItemAction,
  packages,
  removePackageItemAction,
  services,
  updatePackageAction
}: PackageBuilderProps) {
  const [selectedPackageId, setSelectedPackageId] = useState(packages[0]?.id || "");
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const addForms = useRef<Record<string, HTMLFormElement | null>>({});

  const setAddFormRef = useCallback(
    (packageId: string) => (node: HTMLFormElement | null) => {
      addForms.current[packageId] = node;
    },
    []
  );

  const submitService = useCallback((packageId: string, serviceId: string) => {
    const form = addForms.current[packageId];
    if (!form) return;
    const input = form?.elements.namedItem("serviceId");
    if (!(input instanceof HTMLInputElement)) return;
    input.value = serviceId;
    form.requestSubmit();
  }, []);

  const handleDragStart = (event: DragEvent<HTMLElement>, serviceId: string) => {
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData("application/x-service-id", serviceId);
    event.dataTransfer.setData("text/plain", serviceId);
  };

  const handleDrop = (event: DragEvent<HTMLElement>, packageId: string) => {
    event.preventDefault();
    const serviceId = event.dataTransfer.getData("application/x-service-id") || event.dataTransfer.getData("text/plain");
    setDropTargetId(null);
    if (serviceId) submitService(packageId, serviceId);
  };

  const selectedPackage = packages.find((item) => item.id === selectedPackageId) || packages[0] || null;

  return (
    <div className="service-package-builder">
      <section className="service-library-panel" aria-labelledby="service-library-title">
        <div className="studio-section-head">
          <div>
            <p className="catalog-rail-label">Base services</p>
            <h2 id="service-library-title">Service tiles</h2>
          </div>
          <span className="catalog-pill is-blue">
            <Layers3 size={14} />
            {services.length} available
          </span>
        </div>

        {packages.length > 1 ? (
          <label className="service-package-target-select" htmlFor="package-add-target">
            <span>Add buttons target</span>
            <select id="package-add-target" value={selectedPackage?.id || ""} onChange={(event) => setSelectedPackageId(event.target.value)}>
              {packages.map((servicePackage) => (
                <option key={servicePackage.id} value={servicePackage.id}>
                  {servicePackage.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {services.length ? (
          <div className="service-card-grid">
            {services.map((service) => {
              const alreadyInSelected = Boolean(selectedPackage?.items.some((item) => item.service.id === service.id));
              return (
                <article
                  aria-label={`Drag ${service.name} into a package`}
                  className={cx("service-tile", !service.isActive && "is-muted")}
                  draggable
                  key={service.id}
                  onDragStart={(event) => handleDragStart(event, service.id)}>
                  <div className="service-tile-mark" aria-hidden="true">
                    <GripVertical size={17} />
                  </div>
                  <div className="service-tile-copy">
                    <div>
                      <strong>{service.name}</strong>
                      <small>{service.category || "Uncategorized"}</small>
                    </div>
                    <p>{service.description || "No description yet."}</p>
                    <div className="service-tile-meta">
                      <span>
                        <Clock3 size={13} />
                        {serviceDurationLabel(service.durationMinutes)}
                      </span>
                      <span>{service.isActive ? "Active" : "Draft"}</span>
                    </div>
                    <div className="service-tag-row">
                      {service.tags.slice(0, 3).map((tag) => (
                        <span key={tag}>
                          <Tag size={11} />
                          {tag}
                        </span>
                      ))}
                      {!service.tags.length ? <span>No tags</span> : null}
                    </div>
                  </div>
                  <Button
                    disabled={!selectedPackage || alreadyInSelected}
                    onClick={() => selectedPackage && submitService(selectedPackage.id, service.id)}
                    size="sm"
                    type="button"
                    variant="secondary">
                    <Plus size={14} />
                    {alreadyInSelected ? "Added" : "Add"}
                  </Button>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="catalog-empty-state">
            <Layers3 size={28} />
            <h3>No services match</h3>
            <p>Clear filters or add a base service before building packages.</p>
          </div>
        )}
      </section>

      <section className="service-package-rail" aria-labelledby="service-packages-title">
        <div className="studio-section-head">
          <div>
            <p className="catalog-rail-label">Packages</p>
            <h2 id="service-packages-title">Package builder</h2>
          </div>
          <span className="catalog-pill is-green">
            <Boxes size={14} />
            {packages.length} package{packages.length === 1 ? "" : "s"}
          </span>
        </div>

        {packages.length ? (
          <div className="service-package-list">
            {packages.map((servicePackage) => {
              const totalDuration = packageDuration(servicePackage.items);
              return (
                <section
                  className={cx("service-package-box", dropTargetId === servicePackage.id && "is-drop-target")}
                  key={servicePackage.id}
                  onDragLeave={() => setDropTargetId(null)}
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "copy";
                    setDropTargetId(servicePackage.id);
                  }}
                  onDrop={(event) => handleDrop(event, servicePackage.id)}>
                  <div className="service-package-head">
                    <div>
                      <strong>{servicePackage.name}</strong>
                      <small>/book/packages/{servicePackage.slug}</small>
                    </div>
                    <span className={servicePackage.isActive ? "catalog-status is-active" : "catalog-status is-draft"}>
                      {servicePackage.isActive ? "active" : "draft"}
                    </span>
                  </div>

                  <dl className="service-package-stats">
                    <div>
                      <dt>Services</dt>
                      <dd>{servicePackage.items.length}</dd>
                    </div>
                    <div>
                      <dt>Duration</dt>
                      <dd>{serviceDurationLabel(totalDuration)}</dd>
                    </div>
                  </dl>

                  <div className="service-package-drop-hint">
                    <Plus size={15} />
                    Drop services here
                  </div>

                  {servicePackage.items.length ? (
                    <div className="service-package-items">
                      {servicePackage.items.map((item) => (
                        <div className="service-package-item" key={item.id}>
                          <span>
                            <strong>{item.service.name}</strong>
                            <small>{item.quantity > 1 ? `${item.quantity}x ` : ""}{serviceDurationLabel(item.service.durationMinutes)}</small>
                          </span>
                          <form action={removePackageItemAction}>
                            <input name="id" type="hidden" value={item.id} />
                            <input name="packageId" type="hidden" value={servicePackage.id} />
                            <Button aria-label={`Remove ${item.service.name}`} size="sm" type="submit" variant="ghost">
                              <Trash2 size={14} />
                            </Button>
                          </form>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="muted-text">Drag a service tile into this package to start composing it.</p>
                  )}

                  <details className="product-editor-advanced">
                    <summary>
                      <span>Package details</span>
                      <small>{servicePackage.tags.length ? servicePackage.tags.join(", ") : "No tags"}</small>
                    </summary>
                    <form action={updatePackageAction} className="studio-action-form">
                      <input name="id" type="hidden" value={servicePackage.id} />
                      <div className="catalog-form-grid is-two">
                        <div className="ui-field">
                          <label htmlFor={`package-${servicePackage.id}-name`}>Name</label>
                          <input defaultValue={servicePackage.name} id={`package-${servicePackage.id}-name`} name="name" required />
                        </div>
                        <div className="ui-field">
                          <label htmlFor={`package-${servicePackage.id}-slug`}>Slug</label>
                          <input defaultValue={servicePackage.slug} id={`package-${servicePackage.id}-slug`} name="slug" />
                        </div>
                      </div>
                      <div className="ui-field">
                        <label htmlFor={`package-${servicePackage.id}-description`}>Description</label>
                        <textarea defaultValue={servicePackage.description} id={`package-${servicePackage.id}-description`} name="description" />
                      </div>
                      <div className="catalog-form-grid is-two">
                        <div className="ui-field">
                          <label htmlFor={`package-${servicePackage.id}-tags`}>Tags</label>
                          <input defaultValue={servicePackage.tags.join(", ")} id={`package-${servicePackage.id}-tags`} name="tags" />
                        </div>
                        <div className="ui-field">
                          <label htmlFor={`package-${servicePackage.id}-sort`}>Sort</label>
                          <input defaultValue={servicePackage.sortOrder} id={`package-${servicePackage.id}-sort`} name="sortOrder" type="number" />
                        </div>
                      </div>
                      <Switch defaultChecked={servicePackage.isActive} label="Active package" name="isActive" variant="inline" />
                      <Button type="submit" variant="secondary">
                        Save package
                      </Button>
                    </form>
                  </details>

                  <form action={addPackageItemAction} className="service-package-hidden-form" ref={setAddFormRef(servicePackage.id)}>
                    <input name="packageId" type="hidden" value={servicePackage.id} />
                    <input name="serviceId" type="hidden" />
                    <input name="quantity" type="hidden" value="1" />
                  </form>
                </section>
              );
            })}
          </div>
        ) : (
          <div className="catalog-empty-state">
            <Boxes size={28} />
            <h3>No packages yet</h3>
            <p>Create a package, then drag base services into it.</p>
          </div>
        )}
      </section>
    </div>
  );
}
