import Link from "next/link";
import { TestimonialStatus } from "@prisma/client";
import { CalendarDays, MessageSquare, Star } from "lucide-react";
import { notFound } from "next/navigation";
import { getSiteSettings } from "@/lib/site";
import { themeToCssVars } from "@/lib/theme/tokens";
import { prisma } from "@/lib/prisma";
import { createPublicTestimonialAction } from "@/modules/testimonials/actions";

export const dynamic = "force-dynamic";

type TestimonialsPublicPageProps = {
  searchParams: Promise<{ submitted?: string; error?: string }>;
};

export default async function TestimonialsPublicPage({ searchParams }: TestimonialsPublicPageProps) {
  const [settings, query] = await Promise.all([getSiteSettings(), searchParams]);

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
      <nav className="site-nav">
        <Link href="/" className="brand">
          <span className="brand-mark" />
          <span>{settings.businessName}</span>
        </Link>
        <div className="site-nav-links">
          <Link href="/book" className="button secondary">
            <CalendarDays size={18} />
            Book
          </Link>
          <Link href="/admin" className="button secondary">
            Admin
          </Link>
        </div>
      </nav>

      <section className="section">
        <div className="booking-intro">
          <p className="eyebrow">Testimonials</p>
          <h1>Client proof</h1>
          <p className="lead">Approved first-party quotes and a collection form for new reviews.</p>
        </div>

        <div className="grid-2" style={{ alignItems: "start" }}>
          <div className="stack">
            {testimonials.map((testimonial) => (
              <article className="card" key={testimonial.id}>
                <Star size={20} />
                <p style={{ fontSize: "1.08rem", lineHeight: 1.7 }}>&quot;{testimonial.quote}&quot;</p>
                <strong>{testimonial.authorName}</strong>
                <span style={{ color: "var(--muted)" }}>
                  {testimonial.authorRole || testimonial.serviceName || testimonial.source} · {testimonial.rating}/5
                </span>
              </article>
            ))}
            {!testimonials.length ? <p className="empty-state">No approved testimonials yet.</p> : null}
          </div>

          <form action={createPublicTestimonialAction} className="card form-grid">
            <input
              aria-hidden="true"
              autoComplete="off"
              name="companyWebsite"
              style={{ display: "none" }}
              tabIndex={-1}
              type="text"
            />
            <div>
              <MessageSquare size={22} />
              <h2 style={{ fontSize: "1.35rem", marginTop: 12 }}>Share a testimonial</h2>
              <p className="lead" style={{ fontSize: "0.95rem" }}>
                New submissions go to the admin queue before public display.
              </p>
            </div>
            {query.submitted ? <div className="success-message">Thanks. Your testimonial is waiting for review.</div> : null}
            {query.error ? <div className="error">{decodeURIComponent(query.error)}</div> : null}
            <div className="grid-2">
              <div className="field">
                <label htmlFor="authorName">Name</label>
                <input id="authorName" name="authorName" required />
              </div>
              <div className="field">
                <label htmlFor="authorEmail">Email</label>
                <input id="authorEmail" name="authorEmail" type="email" />
              </div>
            </div>
            <div className="grid-2">
              <div className="field">
                <label htmlFor="authorRole">Context</label>
                <input id="authorRole" name="authorRole" placeholder="Client, buyer, parent" />
              </div>
              <div className="field">
                <label htmlFor="serviceName">Service or product</label>
                <input id="serviceName" name="serviceName" />
              </div>
            </div>
            <div className="field">
              <label htmlFor="quote">Testimonial</label>
              <textarea id="quote" name="quote" required />
            </div>
            <div className="field">
              <label htmlFor="rating">Rating</label>
              <input id="rating" name="rating" type="number" min="1" max="5" defaultValue="5" />
            </div>
            <label style={{ alignItems: "flex-start", display: "flex", gap: 10, lineHeight: 1.5 }}>
              <input name="permissionGranted" required type="checkbox" />
              I give permission to display this testimonial publicly after review.
            </label>
            <button className="button" type="submit">
              Submit testimonial
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
