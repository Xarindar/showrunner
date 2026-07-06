import NextImage from "next/image";
import { ImageIcon, Plus, Save, X } from "lucide-react";
import { AssetPicker, Button, type AssetPickerAsset } from "@/components/ui";
import {
  attachServiceCategoryImageAction,
  createServiceCategoryAction,
  removeServiceCategoryImageAction,
  updateServiceCategoryAction,
  uploadServiceCategoryImageAction
} from "../actions";

export type ServiceCategoryManagerCategory = {
  description: string;
  id: string;
  imageUrl: string;
  name: string;
  serviceCount: number;
  slug: string;
  sortOrder: number;
};

type ServiceCategoryManagerProps = {
  canUpload: boolean;
  categories: ServiceCategoryManagerCategory[];
  mediaAssets: AssetPickerAsset[];
};

export function ServiceCategoryManager({ canUpload, categories, mediaAssets }: ServiceCategoryManagerProps) {
  return (
    <div className="service-category-manager">
      <section className="studio-panel service-category-create-panel">
        <div className="studio-section-head">
          <div>
            <p className="catalog-rail-label">Categories</p>
            <h2>Add category</h2>
          </div>
        </div>
        <form action={createServiceCategoryAction} className="service-category-create-form">
          <div className="catalog-form-grid is-two">
            <div className="ui-field">
              <label htmlFor="service-category-name">Name</label>
              <input id="service-category-name" name="name" placeholder="Events" required />
            </div>
            <div className="ui-field">
              <label htmlFor="service-category-slug">Slug</label>
              <input id="service-category-slug" name="slug" placeholder="events" />
            </div>
          </div>
          <div className="catalog-form-grid is-two">
            <div className="ui-field">
              <label htmlFor="service-category-description">Description</label>
              <input id="service-category-description" name="description" placeholder="Shown on booking category cards" />
            </div>
            <div className="ui-field">
              <label htmlFor="service-category-sort">Sort</label>
              <input defaultValue={categories.length} id="service-category-sort" name="sortOrder" type="number" />
            </div>
          </div>
          <Button type="submit" variant="secondary">
            <Plus size={16} />
            Add category
          </Button>
        </form>
      </section>

      <div className="service-category-grid">
        {categories.map((category) => {
          const uploadFormId = `service-category-${category.id}-image-upload`;
          const attachFormId = `service-category-${category.id}-image-attach`;
          const removeFormId = `service-category-${category.id}-image-remove`;
          const updateFormId = `service-category-${category.id}-metadata`;
          const imageAlt = `${category.name} booking category image`;

          return (
            <article className="service-category-card" key={category.id}>
              <AssetPicker
                assets={mediaAssets}
                attachFields={{ categoryId: category.id }}
                attachFormId={attachFormId}
                canUpload={canUpload}
                defaultAlt={imageAlt}
                emptyLibraryMessage="No reusable category images yet."
                title={`${category.name} image`}
                triggerClassName={category.imageUrl ? "service-category-image-trigger has-image" : "service-category-image-trigger"}
                triggerHint={category.imageUrl ? "Replace image" : "Add image"}
                uploadFields={{ categoryId: category.id }}
                uploadFormId={uploadFormId}
                uploadUnavailableMessage="Uploads need Server asset folder, Railway/S3 bucket, R2, or Cloudflare Images. You can still choose from the library.">
                <span className="service-category-image-preview">
                  {category.imageUrl ? (
                    <NextImage alt={imageAlt} fill sizes="(max-width: 760px) 100vw, 320px" src={category.imageUrl} unoptimized />
                  ) : (
                    <span className="studio-media-empty">
                      <ImageIcon size={24} />
                      <span>No image</span>
                    </span>
                  )}
                </span>
              </AssetPicker>

              <div className="service-category-card-copy">
                <div>
                  <p className="catalog-rail-label">{category.slug}</p>
                  <h3>{category.name}</h3>
                  <span className="ui-badge">{category.serviceCount} services</span>
                </div>
                {category.imageUrl ? (
                  <Button aria-label={`Remove ${category.name} image`} form={removeFormId} size="sm" title="Remove image" type="submit" variant="ghost">
                    <X size={15} />
                  </Button>
                ) : null}
              </div>

              <form action={updateServiceCategoryAction} className="service-category-meta-form" id={updateFormId}>
                <input name="id" type="hidden" value={category.id} />
                <div className="ui-field">
                  <label htmlFor={`service-category-${category.id}-description`}>Booking card copy</label>
                  <textarea
                    defaultValue={category.description}
                    id={`service-category-${category.id}-description`}
                    name="description"
                    placeholder="Describe what belongs in this category."
                  />
                </div>
                <div className="service-category-form-row">
                  <div className="ui-field">
                    <label htmlFor={`service-category-${category.id}-sort`}>Sort</label>
                    <input defaultValue={category.sortOrder} id={`service-category-${category.id}-sort`} name="sortOrder" type="number" />
                  </div>
                  <Button form={updateFormId} type="submit" variant="secondary">
                    <Save size={15} />
                    Save
                  </Button>
                </div>
              </form>

              <form action={uploadServiceCategoryImageAction} id={uploadFormId} />
              <form action={attachServiceCategoryImageAction} id={attachFormId} />
              <form action={removeServiceCategoryImageAction} id={removeFormId}>
                <input name="categoryId" type="hidden" value={category.id} />
              </form>
            </article>
          );
        })}
      </div>

      {!categories.length ? (
        <div className="catalog-empty-state">
          <ImageIcon size={28} />
          <h3>No service categories yet</h3>
          <p>Create a category here, or choose a category when creating a service.</p>
        </div>
      ) : null}
    </div>
  );
}
