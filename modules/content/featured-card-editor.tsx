"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import NextImage from "next/image";
import { Image as ImageIcon, Save, Upload } from "lucide-react";
import { Button, Card, Field, Input, Modal, Select, Switch, Textarea } from "@/components/ui";
import type { ContentProfileDraft, ContentProfileKey, FeaturedBookingTargetType } from "./content-profiles";
import type { HeroMediaAssetOption } from "./hero-content-editor";

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
  mediaAssets: HeroMediaAssetOption[];
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
  const [imageModalOpen, setImageModalOpen] = useState(false);
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

  function selectImage(asset: HeroMediaAssetOption) {
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl("");
    setUploadName("");
    update("imageUrl", asset.url);
    setImageModalOpen(false);
  }

  function clearImage() {
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl("");
    setUploadName("");
    update("imageUrl", "");
    setImageModalOpen(false);
  }

  function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(file));
    setUploadName(file.name);
    // Clear the picked media URL so the server stores the uploaded file.
    update("imageUrl", "");
    setImageModalOpen(false);
  }

  const toolbar = (
    <div className="content-hero-toolbar">
      <div className="content-hero-toolbar-left">
        <span className="content-section-eyebrow">Featured booking card</span>
        {uploadName ? <span className="ui-badge">{uploadName}</span> : null}
      </div>
      <div className="content-hero-toolbar-actions">
        <Button aria-label="Choose card image" onClick={() => setImageModalOpen(true)} size="sm" type="button" variant="secondary">
          <ImageIcon size={16} aria-hidden="true" />
          Image
        </Button>
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
      encType="multipart/form-data"
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
        <span className="content-compose-label">Booking page preview</span>
        <div
          className="content-promo-preview"
          data-hidden={hidden}
          style={previewImage ? { ["--promo-image" as string]: `url("${previewImage.replace(/"/g, "%22")}")` } : undefined}
        >
          <span>
            <strong>{previewTitle}</strong>
            <small>{previewCopy}</small>
          </span>
          <em>{previewCta}</em>
        </div>
        <p className="content-hero-hint" aria-hidden="true">
          {hidden
            ? `The promo card is hidden on the ${venueLabel} booking page.`
            : `This card appears at the top of the ${venueLabel} booking page and opens the target below.`}
        </p>
      </div>

      <div className="content-featured-fields">
        <Switch
          checked={draft.enabled}
          description="Show the promo card on the booking page."
          label="Show card"
          name="featuredEnabled"
          onChange={(event) => update("enabled", event.target.checked)}
        />

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

        <Field label="Title">
          <Input
            name="featuredTitle"
            onChange={(event) => update("title", event.target.value)}
            placeholder={target?.name || "Let's get this party started"}
            value={draft.title}
          />
        </Field>
        <Field label="Copy">
          <Textarea
            name="featuredCopy"
            onChange={(event) => update("copy", event.target.value)}
            placeholder={target?.copy || "Find a time that works for you."}
            rows={2}
            value={draft.copy}
          />
        </Field>
        <Field label="Button label">
          <Input
            name="featuredCta"
            onChange={(event) => update("cta", event.target.value)}
            placeholder="Book now"
            value={draft.cta}
          />
        </Field>
      </div>

      <Modal className="content-asset-modal" onClose={() => setImageModalOpen(false)} open={imageModalOpen} title="Card image">
        <div className="content-modal-actions">
          <Button disabled={!canUploadImage} onClick={() => fileInputRef.current?.click()} type="button">
            <Upload size={18} aria-hidden="true" />
            Upload image
          </Button>
          <Button onClick={clearImage} type="button" variant="ghost">
            Use target image
          </Button>
          {!canUploadImage ? <span className="muted-text">Uploads need Server asset folder, Railway/S3 bucket, R2, or Cloudflare Images.</span> : null}
        </div>
        <div className="content-asset-grid">
          {mediaAssets.map((asset) => (
            <button className="content-asset-option" key={asset.id} onClick={() => selectImage(asset)} type="button">
              <NextImage src={asset.thumbnailUrl} alt={asset.alt} width={320} height={220} unoptimized />
              <span>{asset.filename}</span>
            </button>
          ))}
        </div>
      </Modal>
    </Card>
  );
}
