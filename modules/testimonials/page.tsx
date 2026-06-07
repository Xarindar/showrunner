import Link from "next/link";
import { TestimonialStatus } from "@prisma/client";
import { MessageSquare, Plus, ShieldCheck, Star } from "lucide-react";
import { formatDateTime } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { getSiteSettings } from "@/lib/site";
import { createTestimonialAction, deleteTestimonialAction, updateTestimonialModerationAction } from "./actions";

export const dynamic = "force-dynamic";

const pageSize = 25;
const statusFilters = ["all", ...Object.values(TestimonialStatus).map((status) => status.toLowerCase())] as const;

type TestimonialsPageProps = {
  searchParams: Promise<{ saved?: string; error?: string; page?: string; status?: string }>;
};

function enumLabel(value: string) {
  return value.toLowerCase().split("_").join(" ");
}

function normalizeStatusFilter(value?: string) {
  return statusFilters.includes(value as (typeof statusFilters)[number]) ? value || "all" : "all";
}

function statusClass(status: TestimonialStatus) {
  if (status === TestimonialStatus.APPROVED) return "pill success";
  if (status === TestimonialStatus.REJECTED || status === TestimonialStatus.ARCHIVED) return "pill danger";
  return "pill";
}

export default async function TestimonialsPage({ searchParams }: TestimonialsPageProps) {
  const [params, settings] = await Promise.all([searchParams, getSiteSettings()]);
  const page = Math.max(1, Number(params.page || 1) || 1);
  const statusFilter = normalizeStatusFilter(params.status);
  const testimonialWhere = statusFilter === "all" ? {} : { status: statusFilter.toUpperCase() as TestimonialStatus };

  const [testimonials, testimonialCount, approvedCount, pendingCount, featuredCount] = await Promise.all([
    prisma.testimonial.findMany({
      where: testimonialWhere,
      include: { client: true },
      orderBy: [{ status: "asc" }, { submittedAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize
    }),
    prisma.testimonial.count({ where: testimonialWhere }),
    prisma.testimonial.count({ where: { status: TestimonialStatus.APPROVED } }),
    prisma.testimonial.count({ where: { status: TestimonialStatus.PENDING } }),
    prisma.testimonial.count({ where: { status: TestimonialStatus.APPROVED, featured: true } })
  ]);
  const pageCount = Math.max(1, Math.ceil(testimonialCount / pageSize));
  const savedMessage = params.saved ? "Testimonial changes saved." : null;
  const errorMessage = params.error || null;

  return (
    <div className="stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">Testimonials</p>
          <h1 style={{ fontSize: "2.4rem" }}>Reviews and social proof</h1>
          <p>Collect first-party quotes, moderate submissions, and feature approved testimonials on the public site.</p>
        </div>
        <Link className="button secondary" href="/testimonials">
          <MessageSquare size={18} />
          Public page
        </Link>
      </header>

      {savedMessage ? <div className="success-message">{savedMessage}</div> : null}
      {errorMessage ? <div className="error">{errorMessage}</div> : null}

      <section className="grid-3">
        <div className="card">
          <ShieldCheck size={22} />
          <h3>{approvedCount} approved</h3>
          <p className="lead" style={{ fontSize: "0.95rem" }}>
            Quotes cleared for public display.
          </p>
        </div>
        <div className="card">
          <MessageSquare size={22} />
          <h3>{pendingCount} pending</h3>
          <p className="lead" style={{ fontSize: "0.95rem" }}>
            New submissions waiting for moderation.
          </p>
        </div>
        <div className="card">
          <Star size={22} />
          <h3>{featuredCount} featured</h3>
          <p className="lead" style={{ fontSize: "0.95rem" }}>
            Approved quotes shown in the homepage proof block.
          </p>
        </div>
      </section>

      <section className="grid-2">
        <form action={createTestimonialAction} className="card form-grid">
          <h2 style={{ fontSize: "1.35rem" }}>Add testimonial</h2>
          <div className="grid-2">
            <div className="field">
              <label htmlFor="authorName">Author name</label>
              <input id="authorName" name="authorName" required />
            </div>
            <div className="field">
              <label htmlFor="authorEmail">Author email</label>
              <input id="authorEmail" name="authorEmail" type="email" />
            </div>
          </div>
          <div className="grid-2">
            <div className="field">
              <label htmlFor="authorRole">Role or context</label>
              <input id="authorRole" name="authorRole" placeholder="Client, buyer, parent, venue owner" />
            </div>
            <div className="field">
              <label htmlFor="serviceName">Service or product</label>
              <input id="serviceName" name="serviceName" />
            </div>
          </div>
          <div className="field">
            <label htmlFor="quote">Quote</label>
            <textarea id="quote" name="quote" required />
          </div>
          <div className="grid-3">
            <div className="field">
              <label htmlFor="rating">Rating</label>
              <input id="rating" name="rating" type="number" min="1" max="5" defaultValue="5" />
            </div>
            <div className="field">
              <label htmlFor="source">Source</label>
              <input id="source" name="source" defaultValue="first-party" />
            </div>
            <div className="field">
              <label htmlFor="status">Status</label>
              <select id="status" name="status" defaultValue={TestimonialStatus.PENDING}>
                {Object.values(TestimonialStatus).map((status) => (
                  <option key={status} value={status}>
                    {enumLabel(status)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid-2">
            <div className="field">
              <label htmlFor="sourceUrl">Source URL</label>
              <input id="sourceUrl" name="sourceUrl" />
            </div>
            <div className="field">
              <label htmlFor="productName">Product</label>
              <input id="productName" name="productName" />
            </div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
            <label style={{ alignItems: "center", display: "flex", gap: 8 }}>
              <input name="permissionGranted" type="checkbox" />
              Permission granted
            </label>
            <label style={{ alignItems: "center", display: "flex", gap: 8 }}>
              <input name="featured" type="checkbox" />
              Featured
            </label>
          </div>
          <button className="button" type="submit">
            <Plus size={18} />
            Add testimonial
          </button>
        </form>

        <div className="card">
          <div className="page-header" style={{ marginBottom: 16 }}>
            <div>
              <h2 style={{ fontSize: "1.35rem" }}>Moderation queue</h2>
              <p>{testimonialCount} matching testimonials</p>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {statusFilters.map((filter) => (
                <Link
                  className={filter === statusFilter ? "button" : "button secondary"}
                  href={`/admin/modules/testimonials?status=${filter}`}
                  key={filter}
                >
                  {filter}
                </Link>
              ))}
            </div>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>Author</th>
                <th>Quote</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {testimonials.map((testimonial) => (
                <tr key={testimonial.id}>
                  <td>
                    <strong>{testimonial.authorName}</strong>
                    <br />
                    <span style={{ color: "var(--muted)" }}>
                      {testimonial.authorRole || testimonial.serviceName || "No context"} · {testimonial.rating}/5
                    </span>
                    {testimonial.client ? (
                      <>
                        <br />
                        <Link href={`/admin/clients/${testimonial.client.id}`}>Client record</Link>
                      </>
                    ) : null}
                  </td>
                  <td>
                    {testimonial.quote}
                    <br />
                    <span style={{ color: "var(--muted)" }}>{formatDateTime(testimonial.submittedAt, settings.timezone)}</span>
                  </td>
                  <td>
                    <span className={statusClass(testimonial.status)}>{enumLabel(testimonial.status)}</span>{" "}
                    {testimonial.featured ? <span className="pill success">featured</span> : null}
                    {!testimonial.permissionGranted ? (
                      <>
                        {" "}
                        <span className="pill danger">needs permission</span>
                      </>
                    ) : null}
                  </td>
                  <td>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      <form action={updateTestimonialModerationAction}>
                        <input type="hidden" name="id" value={testimonial.id} />
                        <input type="hidden" name="status" value={TestimonialStatus.APPROVED} />
                        <button className="button secondary" type="submit">
                          Approve
                        </button>
                      </form>
                      <form action={updateTestimonialModerationAction}>
                        <input type="hidden" name="id" value={testimonial.id} />
                        <input type="hidden" name="status" value={TestimonialStatus.REJECTED} />
                        <button className="button secondary" type="submit">
                          Reject
                        </button>
                      </form>
                      <form action={updateTestimonialModerationAction}>
                        <input type="hidden" name="id" value={testimonial.id} />
                        <input type="hidden" name="featured" value={testimonial.featured ? "false" : "true"} />
                        <button className="button secondary" type="submit">
                          {testimonial.featured ? "Unfeature" : "Feature"}
                        </button>
                      </form>
                      <form action={updateTestimonialModerationAction}>
                        <input type="hidden" name="id" value={testimonial.id} />
                        <input type="hidden" name="status" value={TestimonialStatus.ARCHIVED} />
                        <button className="button secondary" type="submit">
                          Archive
                        </button>
                      </form>
                      <form action={deleteTestimonialAction} className="form-grid">
                        <input type="hidden" name="id" value={testimonial.id} />
                        <label style={{ alignItems: "center", display: "flex", gap: 8 }}>
                          <input name="confirmDelete" type="checkbox" required />
                          Delete
                        </label>
                        <button className="button danger" type="submit">
                          Delete
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
              {!testimonials.length ? (
                <tr>
                  <td colSpan={4}>No testimonials yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
            <Link
              className="button secondary"
              href={`/admin/modules/testimonials?status=${statusFilter}&page=${Math.max(1, page - 1)}`}
              aria-disabled={page <= 1}
            >
              Previous
            </Link>
            <span className="pill">
              Page {Math.min(page, pageCount)} of {pageCount}
            </span>
            <Link
              className="button secondary"
              href={`/admin/modules/testimonials?status=${statusFilter}&page=${Math.min(pageCount, page + 1)}`}
              aria-disabled={page >= pageCount}
            >
              Next
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
