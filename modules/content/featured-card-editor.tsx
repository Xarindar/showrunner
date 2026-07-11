"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Image as ImageIcon, Save } from "lucide-react";
import { AssetPicker, Button, Card, Field, Select, Switch, type AssetPickerAsset } from "@/components/ui";
import type { ContentProfileDraft, ContentProfileKey, FeaturedBookingTargetType } from "./content-profiles";

type FeaturedAction = (formData: FormData) => void | Promise<void>;

export type FeaturedCategoryOption = {
  description: string;
  imageUrl: string;
  name: string;
  slug: string;
};

export type FeaturedServiceOption = {
  category: string;
  description: string;
  id: string;
  imageUrl: string;
  name: string;
};

export type FeaturedPackageOption = {
  description: string;
  id: string;
  imageUrl: string;
  itemCount: number;
  name: string;
};

type FeaturedCardEditorProps = {
  action: FeaturedAction;
  canUploadImage: boolean;
  categories: FeaturedCategoryOption[];
  featured: ContentProfileDraft["featured"];
  mediaAssets: AssetPickerAsset[];
  packages: FeaturedPackageOption[];
  profileKey: ContentProfileKey;
  services: FeaturedServiceOption[];
  venueLabel: string;
};

const targetTypeOptions: Array<{ label: string; value: FeaturedBookingTargetType }> = [
  { label: "Category", value: "CATEGORY" },
  { label: "Service", value: "SERVICE" },
  { label: "Package", value: "PACKAGE" },
  { label: "Hidden", value: "NONE" }
];

export function FeaturedCardEditor({
  action,
  canUploadImage,
  categories,
  featured,
  mediaAssets,
  packages,
  profileKey,
  services,
  venueLabel
}: FeaturedCardEditorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(featured);
  const [previewUrl, setPreviewUrl] = useState("");
  const [uploadName, setUploadName] = useState("");

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const target = useMemo(() => {
    if (draft.targetType === "SERVICE") {
      const service = services.find((option) => option.id === draft.serviceId);
      return service ? { copy: service.description, imageUrl: service.imageUrl, name: service.name } : null;
    }
    if (draft.targetType === "PACKAGE") {
      const servicePackage = packages.find((option) => option.id === draft.packageId);
      return servicePackage ? { copy: servicePackage.description, imageUrl: servicePackage.imageUrl, name: servicePackage.name } : null;
    }
    const category = categories.find((option) => option.slug === draft.categoryId);
    return category ? { copy: category.description, imageUrl: category.imageUrl, name: category.name } : null;
  }, [categories, draft.categoryId, draft.packageId, draft.serviceId, draft.targetType, packages, services]);

  const previewImage = previewUrl || draft.imageUrl || target?.imageUrl || "";
  const previewTitle = draft.title.trim() || target?.name || "Book your next visit";
  const previewCopy = draft.copy.trim() || target?.copy || "Find a time that works for you.";
  const previewCta = draft.cta.trim() || "Book now";
  const hidden = draft.targetType === "NONE" || !draft.enabled;

  function update<Key extends keyof ContentProfileDraft["featured"]>(key: Key, value: ContentProfileDraft["featured"][Key]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function selectImage(asset: AssetPickerAsset) {
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl("");
    setUploadName("");
    update("imageUrl", asset.url || asset.thumbnailUrl);
  }

  function clearImage() {
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl("");
    setUploadName("");
    update("imageUrl", "");
  }

  function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(file));
    setUploadName(file.name);
    // Clear the picked media URL so the server stores the uploaded file.
    update("imageUrl", "");
  }

  const toolbar = (
    <div className="content-hero-toolbar">
      <div className="content-hero-toolbar-left">
        <span className="content-section-eyebrow">Featured booking card</span>
        {uploadName ? <span className="ui-badge">{uploadName}</span> : null}
      </div>
      <div className="content-hero-toolbar-actions">
        <AssetPicker
          assets={mediaAssets}
          canUpload={canUploadImage}
          confirmLabel="Use card image"
          onSelectAsset={selectImage}
          onUploadRequest={() => fileInputRef.current?.click()}
          title="Card image"
          triggerClassName="ui-button ui-button-secondary ui-button-sm">
          <ImageIcon size={16} aria-hidden="true" />
          Image
        </AssetPicker>
        <Button onClick={clearImage} size="sm" type="button" variant="ghost">Use target image</Button>
        <Button size="sm" type="submit">
          <Save size={16} aria-hidden="true" />
          Save
        </Button>
      </div>
    </div>
  );

  return (
    <Card
      action={action}
      as="form"
      bodyClassName="content-featured-editor"
      className="content-featured-editor-card"
      minHeight="none"
      reservedHeader={toolbar}
    >
      <input name="profileKey" type="hidden" value={profileKey} readOnly />
      <input name="featuredTargetType" type="hidden" value={draft.targetType} readOnly />
      <input name="featuredImageUrl" type="hidden" value={draft.imageUrl} readOnly />
      <input
        accept="image/*"
        className="ui-hidden"
        name="featuredImageUpload"
        onChange={handleUpload}
        ref={fileInputRef}
        type="file"
      />

      <div className="content-featured-preview-panel">
        <div className="content-featured-preview-heading">
          <span className="content-compose-label">Booking page preview</span>
          <span className="muted-text">Edit the words directly on the card.</span>
        </div>
        <div
          className="content-promo-preview"
          data-hidden={hidden}
          style={previewImage ? { ["--promo-image" as string]: `url("${previewImage.replace(/"/g, "%22")}")` } : undefined}
        >
          <div className="content-promo-preview-copy">
            <textarea
              aria-label="Featured card title"
              className="content-promo-inline-title"
              name="featuredTitle"
              onChange={(event) => update("title", event.target.value)}
              placeholder={previewTitle}
              rows={1}
              value={draft.title}
            />
            <textarea
              aria-label="Featured card copy"
              className="content-promo-inline-copy"
              name="featuredCopy"
              onChange={(event) => update("copy", event.target.value)}
              placeholder={previewCopy}
              rows={2}
              value={draft.copy}
            />
          </div>
          <input
            aria-label="Featured card button label"
            className="content-promo-inline-cta"
            name="featuredCta"
            onChange={(event) => update("cta", event.target.value)}
            placeholder={previewCta}
            value={draft.cta}
          />
        </div>
        <p className="content-hero-hint" aria-hidden="true">
          {hidden
            ? `The promo card is hidden on the ${venueLabel} booking page.`
            : `This card appears at the top of the ${venueLabel} booking page and opens the target below.`}
        </p>
      </div>

      <div className="content-featured-settings">
        <Switch
          checked={draft.enabled}
          description="Show the promo card on the booking page."
          label="Show card"
          name="featuredEnabled"
          onChange={(event) => update("enabled", event.target.checked)}
        />

        <div className="content-featured-target-settings">
          <div className="content-featured-target-copy">
            <span className="content-section-eyebrow">Button destination</span>
            <span className="muted-text">Choose what opens when a guest selects this card.</span>
          </div>

          <div className="content-featured-target-row" role="group" aria-label="Promo target type">
            {targetTypeOptions.map((option) => (
              <button
                aria-pressed={draft.targetType === option.value}
                className="content-featured-target-pill"
                data-on={draft.targetType === option.value}
                key={option.value}
                onClick={() => update("targetType", option.value)}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="content-featured-target-select">
            {draft.targetType === "CATEGORY" ? (
              <Field label="Category">
                <Select
                  name="featuredCategoryId"
                  onChange={(event) => update("categoryId", event.target.value)}
                  value={draft.categoryId}
                >
                  <option value="">Choose a category</option>
                  {categories.map((category) => (
                    <option key={category.slug} value={category.slug}>
                      {category.name}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : (
              <input name="featuredCategoryId" type="hidden" value={draft.categoryId} readOnly />
            )}

            {draft.targetType === "SERVICE" ? (
              <Field label="Service">
                <Select
                  name="featuredServiceId"
                  onChange={(event) => update("serviceId", event.target.value)}
                  value={draft.serviceId}
                >
                  <option value="">Choose a service</option>
                  {services.map((service) => (
                    <option key={service.id} value={service.id}>
                      {service.name}
                      {service.category ? ` - ${service.category}` : ""}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}

            {draft.targetType === "PACKAGE" ? (
              <Field label="Package">
                <Select
                  name="featuredPackageId"
                  onChange={(event) => update("packageId", event.target.value)}
                  value={draft.packageId}
                >
                  <option value="">Choose a package</option>
                  {packages.map((servicePackage) => (
                    <option key={servicePackage.id} value={servicePackage.id}>
                      {servicePackage.name}
                      {servicePackage.itemCount ? ` - ${servicePackage.itemCount} services` : ""}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}
          </div>
        </div>
      </div>

    </Card>
  );
}
