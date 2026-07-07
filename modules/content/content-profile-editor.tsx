import { Save } from "lucide-react";
import { Button, Card, Field, FolderTabs, Input, Select, Textarea, type FolderTab } from "@/components/ui";
import {
  contentProfileLabels,
  type ContentProfileDraft,
  type ContentProfileKey,
  type FeaturedBookingTargetType
} from "./content-profiles";
import type { ContentTestimonial } from "./testimonials-data";

type ContentProfileServiceOption = {
  category: string;
  id: string;
  name: string;
};

type ContentProfilePackageOption = {
  id: string;
  itemCount: number;
  name: string;
};

type ContentProfileEditorProps = {
  action: (formData: FormData) => void | Promise<void>;
  activeProfile?: string;
  packages: ContentProfilePackageOption[];
  profiles: Record<ContentProfileKey, ContentProfileDraft>;
  services: ContentProfileServiceOption[];
  testimonials: ContentTestimonial[];
};

const targetTypeLabels: Array<{ label: string; value: FeaturedBookingTargetType }> = [
  { label: "Category", value: "CATEGORY" },
  { label: "Service", value: "SERVICE" },
  { label: "Package", value: "PACKAGE" },
  { label: "Hidden", value: "NONE" }
];

export function ContentProfileEditor({
  action,
  activeProfile,
  packages,
  profiles,
  services,
  testimonials
}: ContentProfileEditorProps) {
  const tabs: FolderTab[] = contentProfileLabels().map(({ key, label }) => ({
    id: key,
    label,
    content: (
      <ProfileForm
        action={action}
        key={key}
        packages={packages}
        profile={profiles[key]}
        profileKey={key}
        services={services}
        testimonials={testimonials}
      />
    )
  }));

  return (
    <Card
      as="section"
      className="content-profile-shell"
      minHeight="none"
      reservedHeader={
        <div className="content-hero-toolbar">
          <div className="content-hero-toolbar-left">
            <span className="content-section-eyebrow">Public homepages</span>
          </div>
        </div>
      }>
      <FolderTabs
        ariaLabel="Public homepage profiles"
        className="content-profile-tabs"
        initialTab={activeProfile}
        panelClassName="content-profile-panel"
        tabParamName="profile"
        tabs={tabs}
      />
    </Card>
  );
}

function ProfileForm({
  action,
  packages,
  profile,
  profileKey,
  services,
  testimonials
}: {
  action: ContentProfileEditorProps["action"];
  packages: ContentProfilePackageOption[];
  profile: ContentProfileDraft;
  profileKey: ContentProfileKey;
  services: ContentProfileServiceOption[];
  testimonials: ContentTestimonial[];
}) {
  const selectedTestimonials = new Set(profile.testimonialIds);

  return (
    <form action={action} className="content-profile-form">
      <input name="profileKey" type="hidden" value={profileKey} />

      <section className="subpanel form-grid">
        <div>
          <p className="eyebrow">Header</p>
          <h2>Homepage hero copy</h2>
        </div>
        <div className="catalog-form-grid is-two">
          <Field label="Eyebrow">
            <Input name="headerEyebrow" defaultValue={profile.header.eyebrow} placeholder="Optional small label" />
          </Field>
          <Field label="Headline">
            <Input name="headerHeadline" defaultValue={profile.header.headline} />
          </Field>
        </div>
        <Field label="Intro copy">
          <Textarea name="headerCopy" defaultValue={profile.header.copy} rows={3} />
        </Field>
        <div className="catalog-form-grid is-two">
          <Field label="CTA label">
            <Input name="headerCtaLabel" defaultValue={profile.header.ctaLabel} />
          </Field>
          <Field label="CTA link">
            <Input name="headerCtaHref" defaultValue={profile.header.ctaHref} />
          </Field>
        </div>
      </section>

      <section className="subpanel form-grid">
        <div className="content-profile-section-head">
          <div>
            <p className="eyebrow">Booking feature</p>
            <h2>Hero booking card</h2>
          </div>
          <label className="content-profile-toggle">
            <input defaultChecked={profile.featured.enabled} name="featuredEnabled" type="checkbox" />
            <span>Show card</span>
          </label>
        </div>
        <div className="catalog-form-grid is-three">
          <Field label="Target type">
            <Select name="featuredTargetType" defaultValue={profile.featured.targetType}>
              {targetTypeLabels.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Category slug" hint="Use events or the-hive for current booking categories.">
            <Input name="featuredCategoryId" defaultValue={profile.featured.categoryId} />
          </Field>
          <Field label="CTA label">
            <Input name="featuredCta" defaultValue={profile.featured.cta} />
          </Field>
        </div>
        <div className="catalog-form-grid is-two">
          <Field label="Featured service">
            <Select name="featuredServiceId" defaultValue={profile.featured.serviceId}>
              <option value="">Choose a service</option>
              {services.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.name}
                  {service.category ? ` - ${service.category}` : ""}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Featured package">
            <Select name="featuredPackageId" defaultValue={profile.featured.packageId}>
              <option value="">Choose a package</option>
              {packages.map((servicePackage) => (
                <option key={servicePackage.id} value={servicePackage.id}>
                  {servicePackage.name}
                  {servicePackage.itemCount ? ` - ${servicePackage.itemCount} services` : ""}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="catalog-form-grid is-two">
          <Field label="Card title">
            <Input name="featuredTitle" defaultValue={profile.featured.title} />
          </Field>
          <Field label="Image URL override">
            <Input name="featuredImageUrl" defaultValue={profile.featured.imageUrl} placeholder="Optional media URL" />
          </Field>
        </div>
        <Field label="Card copy">
          <Textarea name="featuredCopy" defaultValue={profile.featured.copy} rows={3} />
        </Field>
      </section>

      <section className="subpanel form-grid">
        <div>
          <p className="eyebrow">Testimonials</p>
          <h2>Homepage quote rail</h2>
        </div>
        <div className="catalog-form-grid is-two">
          <Field label="Section heading">
            <Input name="testimonialHeading" defaultValue={profile.testimonialHeading} />
          </Field>
          <Field label="Intro">
            <Input name="testimonialIntro" defaultValue={profile.testimonialIntro} />
          </Field>
        </div>
        <div className="content-profile-testimonial-grid">
          {testimonials.length ? (
            testimonials.map((testimonial) => (
              <label className="content-profile-testimonial-option" key={testimonial.id}>
                <input
                  defaultChecked={selectedTestimonials.has(testimonial.id)}
                  name="testimonialIds"
                  type="checkbox"
                  value={testimonial.id}
                />
                <span>
                  <strong>{testimonial.authorName}</strong>
                  <small>{testimonial.authorRole || testimonial.serviceName || "Featured testimonial"}</small>
                </span>
              </label>
            ))
          ) : (
            <p className="muted-text">Add approved testimonials below, then assign them to this homepage.</p>
          )}
        </div>
      </section>

      <div className="content-profile-actions">
        <Button type="submit">
          <Save size={16} />
          Save profile
        </Button>
      </div>
    </form>
  );
}
