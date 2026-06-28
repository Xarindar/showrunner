"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import NextImage from "next/image";
import { ChevronLeft, ChevronRight, Image as ImageIcon, MessageSquareQuote, Plus, Save, Star, Trash2, Upload } from "lucide-react";
import { Button, Card, Modal, Switch } from "@/components/ui";
import type { HeroMediaAssetOption } from "./hero-content-editor";
import type { ContentTestimonial } from "./testimonials-data";

type TestimonialAction = (formData: FormData) => void | Promise<void>;

type TestimonialsEditorProps = {
  canUploadImage: boolean;
  createAction: TestimonialAction;
  mediaAssets: HeroMediaAssetOption[];
  removeAction: TestimonialAction;
  testimonials: ContentTestimonial[];
  updateAction: TestimonialAction;
};

type ComposeView = "compose" | "image";

type TestimonialDraft = {
  featured: boolean;
  id: string;
  imageUrl: string;
  name: string;
  quote: string;
  rating: number;
  role: string;
};

const emptyDraft: TestimonialDraft = {
  featured: true,
  id: "",
  imageUrl: "",
  name: "",
  quote: "",
  rating: 5,
  role: ""
};

const minQuoteLength = 10;

export function TestimonialsEditor({
  canUploadImage,
  createAction,
  mediaAssets,
  removeAction,
  testimonials,
  updateAction
}: TestimonialsEditorProps) {
  const railRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<ComposeView>("compose");
  const [draft, setDraft] = useState<TestimonialDraft>(emptyDraft);
  const [previewUrl, setPreviewUrl] = useState("");
  const [uploadName, setUploadName] = useState("");
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const previewImageSrc = previewUrl || draft.imageUrl;
  const isEditing = Boolean(draft.id);
  const canSubmit = draft.name.trim().length > 0 && draft.quote.trim().length >= minQuoteLength;

  const updateScrollState = useCallback(() => {
    const rail = railRef.current;
    if (!rail) return;
    setCanScrollLeft(rail.scrollLeft > 4);
    setCanScrollRight(rail.scrollLeft + rail.clientWidth < rail.scrollWidth - 4);
  }, []);

  useEffect(() => {
    updateScrollState();
    const rail = railRef.current;
    if (!rail) return;
    rail.addEventListener("scroll", updateScrollState, { passive: true });
    window.addEventListener("resize", updateScrollState);
    return () => {
      rail.removeEventListener("scroll", updateScrollState);
      window.removeEventListener("resize", updateScrollState);
    };
  }, [updateScrollState, testimonials.length]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function scrollByCards(direction: 1 | -1) {
    const rail = railRef.current;
    if (!rail) return;
    const card = rail.querySelector<HTMLElement>(".content-testimonial-card");
    const amount = card ? card.offsetWidth + 16 : rail.clientWidth * 0.8;
    rail.scrollBy({ behavior: "smooth", left: direction * amount });
  }

  function resetDraft() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setPreviewUrl("");
    setUploadName("");
    setDraft(emptyDraft);
    setView("compose");
  }

  function openAdd() {
    resetDraft();
    setOpen(true);
  }

  function openEdit(testimonial: ContentTestimonial) {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setPreviewUrl("");
    setUploadName("");
    setDraft({
      featured: testimonial.featured,
      id: testimonial.id,
      imageUrl: testimonial.imageUrl,
      name: testimonial.authorName,
      quote: testimonial.quote,
      rating: testimonial.rating,
      role: testimonial.authorRole || testimonial.serviceName
    });
    setView("compose");
    setOpen(true);
  }

  function closeModal() {
    setOpen(false);
    resetDraft();
  }

  function selectImage(asset: HeroMediaAssetOption) {
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl("");
    setUploadName("");
    setDraft((current) => ({ ...current, imageUrl: asset.url }));
    setView("compose");
  }

  function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    setUploadName(file.name);
    // Clear any picked media URL so the server uses the freshly uploaded file.
    setDraft((current) => ({ ...current, imageUrl: "" }));
    setView("compose");
  }

  const toolbar = (
    <div className="content-hero-toolbar">
      <div className="content-hero-toolbar-left">
        <span className="content-section-eyebrow">Testimonials</span>
        <span className="ui-badge">{testimonials.length}</span>
      </div>
      <div className="content-hero-toolbar-actions">
        <Button onClick={openAdd} size="sm" type="button">
          <Plus size={16} aria-hidden="true" />
          Add testimonial
        </Button>
      </div>
    </div>
  );

  return (
    <Card className="content-testimonial-shell" minHeight="none" reservedHeader={toolbar}>
      <div className="content-proof-rail">
        <button
          aria-label="Scroll testimonials left"
          className="content-rail-arrow"
          data-side="left"
          disabled={!canScrollLeft}
          onClick={() => scrollByCards(-1)}
          type="button"
        >
          <ChevronLeft size={20} aria-hidden="true" />
        </button>

        <div className="content-proof-rail-viewport" ref={railRef}>
          {testimonials.map((testimonial) => (
            <div className="content-testimonial-rail-item" key={testimonial.id}>
              <TestimonialPreviewCard
                featured={testimonial.featured}
                imageSrc={testimonial.imageUrl}
                name={testimonial.authorName}
                onClick={() => openEdit(testimonial)}
                quote={testimonial.quote}
                rating={testimonial.rating}
                role={testimonial.authorRole || testimonial.serviceName}
              />
              <form action={removeAction} className="content-testimonial-remove">
                <input name="id" type="hidden" value={testimonial.id} />
                <button aria-label={`Remove ${testimonial.authorName}'s testimonial`} type="submit">
                  <Trash2 size={14} aria-hidden="true" />
                </button>
              </form>
            </div>
          ))}

          {testimonials.length === 0 ? (
            <button className="content-testimonial-empty" onClick={openAdd} type="button">
              <MessageSquareQuote size={26} aria-hidden="true" />
              <strong>Add your first testimonial</strong>
              <span>Pick a photo, write the quote, and preview the card before it goes live.</span>
            </button>
          ) : null}
        </div>

        <button
          aria-label="Scroll testimonials right"
          className="content-rail-arrow"
          data-side="right"
          disabled={!canScrollRight}
          onClick={() => scrollByCards(1)}
          type="button"
        >
          <ChevronRight size={20} aria-hidden="true" />
        </button>
      </div>
      <p className="content-hero-hint" aria-hidden="true">
        Approved testimonials show here and on the public site. Use the arrows to browse, select a card to edit it, or hover a card to remove it.
      </p>

      <Modal
        className="content-testimonial-modal"
        onClose={closeModal}
        open={open}
        title={view === "image" ? "Choose a photo" : isEditing ? "Edit testimonial" : "Add testimonial"}
      >
        <form action={isEditing ? updateAction : createAction} className="content-testimonial-compose" data-view={view}>
          {isEditing ? <input name="id" readOnly type="hidden" value={draft.id} /> : null}
          <input name="imageUrl" readOnly type="hidden" value={draft.imageUrl} />
          <input name="rating" readOnly type="hidden" value={draft.rating} />
          <input
            accept="image/*"
            className="ui-hidden"
            name="testimonialImageUpload"
            onChange={handleUpload}
            ref={fileInputRef}
            type="file"
          />

          {view === "compose" ? (
            <>
              <div className="content-testimonial-compose-preview">
                <span className="content-compose-label">Live preview</span>
                <TestimonialPreviewCard
                  featured={draft.featured}
                  imageSrc={previewImageSrc}
                  name={draft.name}
                  placeholder
                  quote={draft.quote}
                  rating={draft.rating}
                  role={draft.role}
                />
              </div>

              <div className="content-testimonial-compose-fields">
                <div className="content-testimonial-image-row">
                  <Button onClick={() => setView("image")} size="sm" type="button" variant="secondary">
                    <ImageIcon size={16} aria-hidden="true" />
                    {previewImageSrc ? "Change photo" : "Choose photo"}
                  </Button>
                  {uploadName ? <span className="ui-badge">{uploadName}</span> : null}
                </div>

                <div className="ui-field">
                  <label htmlFor="content-testimonial-name">Author name</label>
                  <input
                    id="content-testimonial-name"
                    name="authorName"
                    onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                    placeholder="Jordan Avery"
                    required
                    value={draft.name}
                  />
                </div>

                <div className="ui-field">
                  <label htmlFor="content-testimonial-role">Role or context</label>
                  <input
                    id="content-testimonial-role"
                    name="authorRole"
                    onChange={(event) => setDraft((current) => ({ ...current, role: event.target.value }))}
                    placeholder="Wedding client"
                    value={draft.role}
                  />
                </div>

                <div className="ui-field">
                  <label htmlFor="content-testimonial-quote">Quote</label>
                  <textarea
                    id="content-testimonial-quote"
                    name="quote"
                    onChange={(event) => setDraft((current) => ({ ...current, quote: event.target.value }))}
                    placeholder="Share what they loved in their own words."
                    required
                    rows={4}
                    value={draft.quote}
                  />
                  <span className="content-field-hint" data-warn={draft.quote.trim().length > 0 && draft.quote.trim().length < minQuoteLength}>
                    {draft.quote.trim().length < minQuoteLength
                      ? `At least ${minQuoteLength} characters.`
                      : `${draft.quote.trim().length} characters.`}
                  </span>
                </div>

                <div className="ui-field">
                  <span className="content-rating-label">Rating</span>
                  <div aria-label="Rating" className="content-rating-input" role="group">
                    {[1, 2, 3, 4, 5].map((value) => (
                      <button
                        aria-label={`${value} star${value > 1 ? "s" : ""}`}
                        aria-pressed={value === draft.rating}
                        className="content-rating-star"
                        data-on={value <= draft.rating}
                        key={value}
                        onClick={() => setDraft((current) => ({ ...current, rating: value }))}
                        type="button"
                      >
                        <Star size={20} aria-hidden="true" />
                      </button>
                    ))}
                  </div>
                </div>

                <Switch
                  checked={draft.featured}
                  description="Show this testimonial in featured sections."
                  label="Featured"
                  name="featured"
                  onChange={(event) => setDraft((current) => ({ ...current, featured: event.target.checked }))}
                />

                <div className="content-modal-actions">
                  <Button onClick={closeModal} type="button" variant="ghost">
                    Cancel
                  </Button>
                  <Button disabled={!canSubmit} type="submit">
                    {isEditing ? <Save size={16} aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />}
                    {isEditing ? "Save changes" : "Add testimonial"}
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="content-testimonial-image-view">
              <div className="content-modal-actions content-modal-actions-spread">
                <Button onClick={() => setView("compose")} size="sm" type="button" variant="secondary">
                  <ChevronLeft size={16} aria-hidden="true" />
                  Back
                </Button>
                <Button disabled={!canUploadImage} onClick={() => fileInputRef.current?.click()} size="sm" type="button">
                  <Upload size={16} aria-hidden="true" />
                  Upload
                </Button>
              </div>
              {!canUploadImage ? <span className="muted-text">Uploads need Server asset folder, R2, or Cloudflare Images. You can still pick from the library.</span> : null}
              <div className="content-asset-grid">
                {mediaAssets.map((asset) => (
                  <button className="content-asset-option" key={asset.id} onClick={() => selectImage(asset)} type="button">
                    <NextImage alt={asset.alt} height={220} src={asset.thumbnailUrl} unoptimized width={320} />
                    <span>{asset.filename}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </form>
      </Modal>
    </Card>
  );
}

function TestimonialPreviewCard({
  featured,
  imageSrc,
  name,
  onClick,
  placeholder,
  quote,
  rating,
  role
}: {
  featured?: boolean;
  imageSrc: string;
  name: string;
  onClick?: () => void;
  placeholder?: boolean;
  quote: string;
  rating: number;
  role: string;
}) {
  const displayName = name.trim() || (placeholder ? "Client name" : "");
  const displayQuote = quote.trim() || (placeholder ? "Their kind words will appear here." : "");

  return (
    <article
      aria-label={onClick ? `Edit ${displayName || "testimonial"}` : undefined}
      className="content-testimonial-card"
      data-clickable={Boolean(onClick)}
      data-placeholder={placeholder && !quote.trim()}
      onClick={onClick}
      onKeyDown={(event) => {
        if (!onClick || (event.key !== "Enter" && event.key !== " ")) return;
        event.preventDefault();
        onClick();
      }}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {featured ? <Star aria-label="Featured" className="content-testimonial-featured-star" size={18} /> : null}
      <div aria-hidden="true" className="content-testimonial-stars">
        {[1, 2, 3, 4, 5].map((value) => (
          <Star className="content-testimonial-star" data-on={value <= rating} key={value} size={15} />
        ))}
      </div>
      <p className="content-testimonial-quote">{`“${displayQuote}”`}</p>
      <div className="content-testimonial-attribution">
        <span className="content-testimonial-avatar">
          {imageSrc ? <NextImage alt="" height={48} src={imageSrc} unoptimized width={48} /> : <span>{initials(displayName)}</span>}
        </span>
        <div className="content-testimonial-byline">
          <strong>{displayName}</strong>
          {role.trim() ? <span>{role}</span> : null}
        </div>
      </div>
    </article>
  );
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "★";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}
