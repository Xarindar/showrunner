import type { Metadata } from "next";
import Link from "next/link";
import NextImage from "next/image";
import { CalendarDays, FileText, Image as ImageIcon, LockKeyhole, MessageSquare, ShoppingBag, Star } from "lucide-react";
import { FormStatus, PortfolioGalleryStatus, PortfolioGalleryVisibility, TestimonialStatus } from "@prisma/client";
import { JsonLd } from "@/components/structured-data";
import { prisma } from "@/lib/prisma";
import { buildImageObjectJsonLd, buildLocalBusinessJsonLd, buildPageMetadata, buildWebSiteJsonLd, getCanonicalBaseUrl } from "@/lib/seo";
import { getSiteSettings } from "@/lib/site";
import { themeToCssVars } from "@/lib/theme/tokens";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSiteSettings();
  return buildPageMetadata(settings, {
    canonicalPath: "/",
    description: settings.heroSubheadline,
    image: settings.heroImageUrl,
    title: settings.businessName
  });
}

export default async function HomePage() {
  const settings = await getSiteSettings();
  const baseUrl = await getCanonicalBaseUrl(settings.siteId);
  const formsEnabled = settings.enabledModuleIds.includes("forms");
  const portfolioEnabled = settings.enabledModuleIds.includes("portfolio");
  const productsEnabled = settings.enabledModuleIds.includes("products");
  const testimonialsEnabled = settings.enabledModuleIds.includes("testimonials");
  const [forms, publicGalleries, testimonials] = await Promise.all([
    formsEnabled
      ? prisma.form.findMany({
          where: { siteId: settings.siteId, status: FormStatus.ACTIVE },
          orderBy: { updatedAt: "desc" },
          take: 3
        })
      : Promise.resolve([]),
    portfolioEnabled
      ? prisma.portfolioGallery.findMany({
          where: {
            siteId: settings.siteId,
            status: PortfolioGalleryStatus.PUBLISHED,
            visibility: PortfolioGalleryVisibility.PUBLIC
          },
          orderBy: [{ sortOrder: "asc" }, { updatedAt: "desc" }],
          take: 3
        })
      : Promise.resolve([]),
    testimonialsEnabled
      ? prisma.testimonial.findMany({
          where: {
            siteId: settings.siteId,
            status: TestimonialStatus.APPROVED,
            permissionGranted: true,
            featured: true
          },
          orderBy: { submittedAt: "desc" },
          take: 3
        })
      : Promise.resolve([])
  ]);

  return (
    <main className="site-shell" style={themeToCssVars(settings)}>
      <JsonLd
        data={[
          buildLocalBusinessJsonLd(settings, baseUrl),
          buildWebSiteJsonLd(settings, baseUrl),
          buildImageObjectJsonLd({
            baseUrl,
            description: settings.heroSubheadline,
            name: `${settings.businessName} hero image`,
            url: settings.heroImageUrl
          })
        ]}
      />
      <nav className="site-nav">
        <Link href="/" className="brand">
          <span className="brand-mark" />
          <span>{settings.businessName}</span>
        </Link>
        <div className="site-nav-links">
          <Link href="/book" className="button">
            <CalendarDays size={18} />
            Book
          </Link>
          {productsEnabled ? (
            <Link href="/shop" className="button secondary">
              <ShoppingBag size={18} />
              Shop
            </Link>
          ) : null}
          <Link href="/admin" className="button secondary">
            Admin
          </Link>
        </div>
      </nav>

      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Showrunner</p>
          <h1>{settings.heroHeadline}</h1>
          <p className="lead">{settings.heroSubheadline}</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 28 }}>
            <Link href="/book" className="button">
              <CalendarDays size={18} />
              Book an appointment
            </Link>
            <Link href="/admin/login" className="button secondary">
              <LockKeyhole size={18} />
              Admin login
            </Link>
            {testimonialsEnabled ? (
              <Link href="/testimonials" className="button secondary">
                <MessageSquare size={18} />
                Reviews
              </Link>
            ) : null}
            {productsEnabled ? (
              <Link href="/shop" className="button secondary">
                <ShoppingBag size={18} />
                Shop
              </Link>
            ) : null}
          </div>
        </div>
        <div className="hero-media">
          <NextImage src={settings.heroImageUrl} alt="" width={900} height={1000} priority unoptimized />
        </div>
      </section>

      <section className="section">
        <div className="grid-2" style={{ alignItems: "start" }}>
          <div>
            <p className="eyebrow">Editable content</p>
            <h2>{settings.introTitle}</h2>
            <p className="lead">{settings.introBody}</p>
          </div>
          <div className="feature-grid" style={{ gridTemplateColumns: "1fr" }}>
            <div className="card">
              <CalendarDays size={22} />
              <h3>Scheduling</h3>
              <p>Services, weekly availability, blockouts, booking requests, and admin status updates.</p>
            </div>
            <div className="card">
              <ImageIcon size={22} />
              <h3>Media</h3>
              <p>Use stable repo assets or turn on R2 uploads for image-heavy clients.</p>
            </div>
            {portfolioEnabled ? (
              <div className="card">
                <ImageIcon size={22} />
                <h3>Galleries</h3>
                <p>Publish portfolio collections with proofing, favorites, and private access links.</p>
              </div>
            ) : null}
            {formsEnabled ? (
              <div className="card">
                <FileText size={22} />
                <h3>Forms</h3>
                <p>Publish contact, intake, lead, and questionnaire forms from the admin shell.</p>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      {formsEnabled || portfolioEnabled || testimonialsEnabled ? (
        <section className="section" style={{ paddingTop: 0 }}>
          <div className="grid-2" style={{ alignItems: "start" }}>
            {formsEnabled ? (
              <div>
                <p className="eyebrow">Forms</p>
                <h2>Public intake examples</h2>
                <div className="feature-grid" style={{ gridTemplateColumns: "1fr", marginTop: 18 }}>
                  {forms.map((form) => (
                    <Link className="card" href={`/forms/${form.slug}`} key={form.id}>
                      <FileText size={22} />
                      <h3>{form.name}</h3>
                      <p>{form.description || "Open this active form on the example front end."}</p>
                    </Link>
                  ))}
                  {!forms.length ? <p className="empty-state">No active forms yet.</p> : null}
                </div>
              </div>
            ) : null}

            {portfolioEnabled ? (
              <div>
                <p className="eyebrow">Portfolio</p>
                <h2>Public galleries</h2>
                <div className="feature-grid" style={{ gridTemplateColumns: "1fr", marginTop: 18 }}>
                  {publicGalleries.map((gallery) => (
                    <Link className="card" href={`/galleries/${gallery.slug}`} key={gallery.id}>
                      <ImageIcon size={22} />
                      <h3>{gallery.title}</h3>
                      <p>{gallery.description || gallery.category || "Open this published gallery."}</p>
                    </Link>
                  ))}
                  {!publicGalleries.length ? <p className="empty-state">No public galleries yet.</p> : null}
                </div>
              </div>
            ) : null}

            {testimonialsEnabled ? (
              <div>
                <p className="eyebrow">Social proof</p>
                <h2>Featured testimonials</h2>
                <div className="feature-grid" style={{ gridTemplateColumns: "1fr", marginTop: 18 }}>
                  {testimonials.map((testimonial) => (
                    <article className="card" key={testimonial.id}>
                      <Star size={22} />
                      <p style={{ lineHeight: 1.7 }}>&quot;{testimonial.quote}&quot;</p>
                      <strong>{testimonial.authorName}</strong>
                      <span style={{ color: "var(--muted)" }}>
                        {testimonial.authorRole || testimonial.serviceName || testimonial.source} - {testimonial.rating}/5
                      </span>
                    </article>
                  ))}
                  {!testimonials.length ? <p className="empty-state">No featured testimonials yet.</p> : null}
                  <Link href="/testimonials" className="button secondary" style={{ justifySelf: "start" }}>
                    <MessageSquare size={18} />
                    View all reviews
                  </Link>
                </div>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}
    </main>
  );
}
