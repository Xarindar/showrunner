import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, FileText, Image as ImageIcon, MessageSquare, ShoppingBag, Star } from "lucide-react";
import { FormStatus, PortfolioGalleryStatus, PortfolioGalleryVisibility, TestimonialStatus } from "@prisma/client";
import { JsonLd } from "@/components/structured-data";
import { TestimonialAvatar } from "@/components/testimonial-avatar";
import { ButtonLink, Card, EmptyState, EqualGrid } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import { buildImageObjectJsonLd, buildLocalBusinessJsonLd, buildPageMetadata, buildWebSiteJsonLd, getCanonicalBaseUrl } from "@/lib/seo";
import { getSiteSettings } from "@/lib/site";
import { themeToCssVars } from "@/lib/theme/tokens";
import { getHeroPresentationForSite } from "@/modules/content/hero-presentation.server";
import { PublicHeroPresentation } from "@/modules/content/public-hero";

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
  const heroPresentation = await getHeroPresentationForSite(settings.siteId, settings);
  const primaryHeroSlide = heroPresentation.slides[0];
  const baseUrl = await getCanonicalBaseUrl(settings.siteId);
  const formsEnabled = settings.enabledModuleIds.includes("forms");
  const portfolioEnabled = settings.enabledModuleIds.includes("portfolio");
  const productsEnabled = settings.enabledModuleIds.includes("products");
  const testimonialsEnabled = settings.enabledModuleIds.includes("testimonials");
  const [forms, publicGalleries, testimonials] = await Promise.all([
  formsEnabled ?
  prisma.form.findMany({
    where: { siteId: settings.siteId, status: FormStatus.ACTIVE },
    orderBy: { updatedAt: "desc" },
    take: 3
  }) :
  Promise.resolve([]),
  portfolioEnabled ?
  prisma.portfolioGallery.findMany({
    where: {
      siteId: settings.siteId,
      status: PortfolioGalleryStatus.PUBLISHED,
      visibility: PortfolioGalleryVisibility.PUBLIC
    },
    orderBy: [{ sortOrder: "asc" }, { updatedAt: "desc" }],
    take: 3
  }) :
  Promise.resolve([]),
  testimonialsEnabled ?
  prisma.testimonial.findMany({
    where: {
      siteId: settings.siteId,
      status: TestimonialStatus.APPROVED,
      permissionGranted: true,
      featured: true
    },
    orderBy: { submittedAt: "desc" },
    take: 3
  }) :
  Promise.resolve([])]
  );

  return (
    <main className="site-shell" style={themeToCssVars(settings)}>
      <JsonLd
        data={[
        buildLocalBusinessJsonLd(settings, baseUrl),
        buildWebSiteJsonLd(settings, baseUrl),
        buildImageObjectJsonLd({
          baseUrl,
          description: primaryHeroSlide.caption,
          name: `${settings.businessName} hero image`,
          url: primaryHeroSlide.imageUrl
        })]
        } />
      
      <nav className="site-nav">
        <Link href="/" className="brand">
          <span className="brand-mark" />
          <span>{settings.businessName}</span>
        </Link>
        <div className="site-nav-links">
          <ButtonLink href="/book">
            <CalendarDays size={18} />
            Book
          </ButtonLink>
          {productsEnabled ?
          <ButtonLink href="/shop" variant="secondary">
              <ShoppingBag size={18} />
              Shop
            </ButtonLink> :
          null}
          <ButtonLink href="/admin" variant="secondary">
            Admin
          </ButtonLink>
        </div>
      </nav>

      <PublicHeroPresentation presentation={heroPresentation} />

      <section className="section">
        <EqualGrid className="align-start">
          <div>
            <p className="eyebrow">Editable content</p>
            <h2>{settings.introTitle}</h2>
            <p className="lead">{settings.introBody}</p>
          </div>
          <EqualGrid className="feature-grid-single">
            <Card>
              <CalendarDays size={22} />
              <h3>Scheduling</h3>
              <p>Services, weekly availability, blockouts, booking requests, and admin status updates.</p>
            </Card>
            <Card>
              <ImageIcon size={22} />
              <h3>Media</h3>
              <p>Use stable repo assets or turn on R2 uploads for image-heavy clients.</p>
            </Card>
            {portfolioEnabled ?
            <Card>
                <ImageIcon size={22} />
                <h3>Galleries</h3>
                <p>Publish portfolio collections with proofing, favorites, and private access links.</p>
              </Card> :
            null}
            {formsEnabled ?
            <Card>
                <FileText size={22} />
                <h3>Forms</h3>
                <p>Publish contact, intake, lead, and questionnaire forms from the admin shell.</p>
              </Card> :
            null}
          </EqualGrid>
        </EqualGrid>
      </section>

      {formsEnabled || portfolioEnabled || testimonialsEnabled ?
      <section className="section section-flush-top">
          <EqualGrid className="align-start">
            {formsEnabled ?
          <div>
                <p className="eyebrow">Forms</p>
                <h2>Public intake examples</h2>
                <EqualGrid className="feature-grid-single section-list">
                  {forms.map((form) =>
              <Link className="card" href={`/forms/${form.slug}`} key={form.id}>
                      <FileText size={22} />
                      <h3>{form.name}</h3>
                      <p>{form.description || "Open this active form on the example front end."}</p>
                    </Link>
              )}
                  {!forms.length ? <EmptyState title="No active forms" description="Published intake forms will keep this slot size stable." /> : null}
                </EqualGrid>
              </div> :
          null}

            {portfolioEnabled ?
          <div>
                <p className="eyebrow">Portfolio</p>
                <h2>Public galleries</h2>
                <EqualGrid className="feature-grid-single section-list">
                  {publicGalleries.map((gallery) =>
              <Link className="card" href={`/galleries/${gallery.slug}`} key={gallery.id}>
                      <ImageIcon size={22} />
                      <h3>{gallery.title}</h3>
                      <p>{gallery.description || gallery.category || "Open this published gallery."}</p>
                    </Link>
              )}
                  {!publicGalleries.length ? <EmptyState title="No public galleries" description="Published collections will appear in this reserved list." /> : null}
                </EqualGrid>
              </div> :
          null}

            {testimonialsEnabled ?
          <div>
                <p className="eyebrow">Social proof</p>
                <h2>Featured testimonials</h2>
                <EqualGrid className="feature-grid-single section-list">
                  {testimonials.map((testimonial) =>
              <Card key={testimonial.id} as="article">
                      <Star size={22} />
                      <p className="testimonial-quote">&quot;{testimonial.quote}&quot;</p>
                      <div className="testimonial-author-row">
                        <TestimonialAvatar imageUrl={testimonial.imageUrl} name={testimonial.authorName} />
                        <div className="testimonial-author-meta">
                          <strong>{testimonial.authorName}</strong>
                          <span className="muted-text">
                            {testimonial.authorRole || testimonial.serviceName || testimonial.source} - {testimonial.rating}/5
                          </span>
                        </div>
                      </div>
                    </Card>
              )}
                  {!testimonials.length ? <EmptyState title="No featured testimonials" description="Approved reviews will reserve the same card rhythm." /> : null}
                  <ButtonLink href="/testimonials" variant="secondary" className="justify-start">
                    <MessageSquare size={18} />
                    View all reviews
                  </ButtonLink>
                </EqualGrid>
              </div> :
          null}
          </EqualGrid>
        </section> :
      null}
    </main>);

}
