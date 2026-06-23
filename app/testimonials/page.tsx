import type { Metadata } from "next";
import Link from "next/link";
import { TestimonialStatus } from "@prisma/client";
import { CalendarDays, MessageSquare, Star } from "lucide-react";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/structured-data";
import { buildBreadcrumbJsonLd, buildPageMetadata, getCanonicalBaseUrl } from "@/lib/seo";
import { getSiteSettings } from "@/lib/site";
import { themeToCssVars } from "@/lib/theme/tokens";
import { prisma } from "@/lib/prisma";
import { createPublicTestimonialAction } from "@/modules/testimonials/actions";
import { TestimonialAvatar } from "@/components/testimonial-avatar";
import { Button, ButtonLink, Card, EqualGrid } from "@/components/ui";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSiteSettings();
  return buildPageMetadata(settings, {
    canonicalPath: "/testimonials",
    description: `Client testimonials and reviews for ${settings.businessName}.`,
    title: "Testimonials"
  });
}

type TestimonialsPublicPageProps = {
  searchParams: Promise<{submitted?: string;error?: string;}>;
};

export default async function TestimonialsPublicPage({ searchParams }: TestimonialsPublicPageProps) {
  const [settings, query] = await Promise.all([getSiteSettings(), searchParams]);
  const baseUrl = await getCanonicalBaseUrl(settings.siteId);

  if (!settings.enabledModuleIds.includes("testimonials")) {
    notFound();
  }

  const testimonials = await prisma.testimonial.findMany({
    where: {
      siteId: settings.siteId,
      status: TestimonialStatus.APPROVED,
      permissionGranted: true
    },
    orderBy: [{ featured: "desc" }, { submittedAt: "desc" }],
    take: 18
  });

  return (
    <main className="site-shell" style={themeToCssVars(settings)}>
      <JsonLd
        data={buildBreadcrumbJsonLd(
          [
          { name: "Home", path: "/" },
          { name: "Testimonials", path: "/testimonials" }],

          baseUrl
        )} />
      
      <nav className="site-nav">
        <Link href="/" className="brand">
          <span className="brand-mark" />
          <span>{settings.businessName}</span>
        </Link>
        <div className="site-nav-links">
          <ButtonLink href="/book" variant="secondary">
            <CalendarDays size={18} />
            Book
          </ButtonLink>
          <ButtonLink href="/admin" variant="secondary">
            Admin
          </ButtonLink>
        </div>
      </nav>

      <section className="section">
        <div className="booking-intro">
          <p className="eyebrow">Testimonials</p>
          <h1>Client proof</h1>
          <p className="lead">Approved first-party quotes and a collection form for new reviews.</p>
        </div>

        <EqualGrid className="ui-align-start">
          <div className="stack">
            {testimonials.map((testimonial) =>
            <Card key={testimonial.id} as="article">
                <Star size={20} />
                <p className="testimonial-quote">&quot;{testimonial.quote}&quot;</p>
                <div className="testimonial-author-row">
                  <TestimonialAvatar imageUrl={testimonial.imageUrl} name={testimonial.authorName} />
                  <div className="testimonial-author-meta">
                    <strong>{testimonial.authorName}</strong>
                    <span className="muted-text">
                      {testimonial.authorRole || testimonial.serviceName || testimonial.source} · {testimonial.rating}/5
                    </span>
                  </div>
                </div>
              </Card>
            )}
            {!testimonials.length ? <p className="empty-state">No approved testimonials yet.</p> : null}
          </div>

          <Card action={createPublicTestimonialAction} as="form" bodyClassName="form-grid">
            <input
              aria-hidden="true"
              autoComplete="off"
              name="companyWebsite"
              className="ui-hidden"
              tabIndex={-1}
              type="text" />
            
            <div>
              <MessageSquare size={22} />
              <h2 className="section-title ui-title-tight">Share a testimonial</h2>
              <p className="lead lead-compact">
                New submissions go to the admin queue before public display.
              </p>
            </div>
            {query.submitted ?
            <div className="success-message" role="status" aria-live="polite">
                Thanks. Your testimonial is waiting for review.
              </div> :
            null}
            {query.error ?
            <div className="error" role="alert">
                {decodeURIComponent(query.error)}
              </div> :
            null}
            <EqualGrid>
              <div className="field">
                <label htmlFor="authorName">
                  Name <span aria-hidden="true">*</span>
                </label>
                <input id="authorName" name="authorName" required aria-required="true" />
              </div>
              <div className="field">
                <label htmlFor="authorEmail">Email</label>
                <input id="authorEmail" name="authorEmail" type="email" />
              </div>
            </EqualGrid>
            <EqualGrid>
              <div className="field">
                <label htmlFor="authorRole">Context</label>
                <input id="authorRole" name="authorRole" placeholder="Client, buyer, parent" />
              </div>
              <div className="field">
                <label htmlFor="serviceName">Service or product</label>
                <input id="serviceName" name="serviceName" />
              </div>
            </EqualGrid>
            <div className="field">
              <label htmlFor="quote">
                Testimonial <span aria-hidden="true">*</span>
              </label>
              <textarea id="quote" name="quote" required aria-required="true" />
            </div>
            <div className="field">
              <label htmlFor="rating">Rating</label>
              <input id="rating" name="rating" type="number" min="1" max="5" defaultValue="5" />
            </div>
            <label className="ui-check-row">
              <input name="permissionGranted" required aria-required="true" type="checkbox" />
              <span>
                I give permission to display this testimonial publicly after review. <span aria-hidden="true">*</span>
              </span>
            </label>
            <Button type="submit">
              Submit testimonial
            </Button>
          </Card>
        </EqualGrid>
      </section>
    </main>);

}
