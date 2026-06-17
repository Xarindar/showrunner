import Link from "next/link";
import { TestimonialStatus } from "@prisma/client";
import { MessageSquare, Plus, ShieldCheck, Star } from "lucide-react";
import { getAccessibleTestimonialWhere, requireAdmin } from "@/lib/auth";
import { enumLabel, formatDateTime } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { getSiteSettings } from "@/lib/site";
import { createTestimonialAction, deleteTestimonialAction, updateTestimonialModerationAction } from "./actions";

export const dynamic = "force-dynamic";

const pageSize = 25;
const statusFilters = ["all", ...Object.values(TestimonialStatus).map((status) => status.toLowerCase())] as const;

type TestimonialsPageProps = {
  searchParams: Promise<{ saved?: string; error?: string; page?: string; status?: string }>;
};

function normalizeStatusFilter(value?: string) {
  return statusFilters.includes(value as (typeof statusFilters)[number]) ? value || "all" : "all";
}

function statusClass(status: TestimonialStatus) {
  if (status === TestimonialStatus.APPROVED) return "ui-badge ui-badge-success";
  if (status === TestimonialStatus.REJECTED || status === TestimonialStatus.ARCHIVED) return "ui-badge ui-badge-danger";
  return "ui-badge";
}

export default async function TestimonialsPage({ searchParams }: TestimonialsPageProps) {
  const user = await requireAdmin("testimonials:manage");
  const [params, settings] = await Promise.all([searchParams, getSiteSettings()]);
  const page = Math.max(1, Number(params.page || 1) || 1);
  const statusFilter = normalizeStatusFilter(params.status);
  const statusExtra = statusFilter === "all" ? {} : { status: statusFilter.toUpperCase() as TestimonialStatus };
  const testimonialWhere = await getAccessibleTestimonialWhere(user, settings.siteId, statusExtra);

  const [testimonials, testimonialCount, approvedCount, pendingCount, featuredCount] = await Promise.all([
    prisma.testimonial.findMany({
      where: testimonialWhere,
      include: { client: true },
      orderBy: [{ status: "asc" }, { submittedAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize
    }),
    prisma.testimonial.count({ where: testimonialWhere }),
    prisma.testimonial.count({ where: await getAccessibleTestimonialWhere(user, settings.siteId, { status: TestimonialStatus.APPROVED }) }),
    prisma.testimonial.count({ where: await getAccessibleTestimonialWhere(user, settings.siteId, { status: TestimonialStatus.PENDING }) }),
    prisma.testimonial.count({
      where: await getAccessibleTestimonialWhere(user, settings.siteId, { status: TestimonialStatus.APPROVED, featured: true })
    })
  ]);
  const pageCount = Math.max(1, Math.ceil(testimonialCount / pageSize));
  const savedMessage = params.saved ? "Testimonial changes saved." : null;
  const errorMessage = params.error || null;

  return (
    <div className="stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">Testimonials</p>
          <h1>Reviews and social proof</h1>
          <p>Collect first-party quotes, moderate submissions, and feature approved testimonials on the public site.</p>
        </div>
        <Link className="ui-button ui-button-secondary" href="/testimonials">
          <MessageSquare size={18} />
          Public page
        </Link>
      </header>

      {savedMessage ? <div className="success-message">{savedMessage}</div> : null}
      {errorMessage ? <div className="error">{errorMessage}</div> : null}

      <section className="grid-3">
        <div className="ui-card ui-card-density-normal ui-card-min-md">
          <ShieldCheck size={22} />
          <h3>{approvedCount} approved</h3>
          <p className="lead lead-compact">
            Quotes cleared for public display.
          </p>
        </div>
        <div className="ui-card ui-card-density-normal ui-card-min-md">
          <MessageSquare size={22} />
          <h3>{pendingCount} pending</h3>
          <p className="lead lead-compact">
            New submissions waiting for moderation.
          </p>
        </div>
        <div className="ui-card ui-card-density-normal ui-card-min-md">
          <Star size={22} />
          <h3>{featuredCount} featured</h3>
          <p className="lead lead-compact">
            Approved quotes shown in the homepage proof block.
          </p>
        </div>
      </section>

      <section className="grid-2">
        <form action={createTestimonialAction} className="ui-card ui-card-density-normal ui-card-min-none form-grid">
          <h2 className="section-title">Add testimonial</h2>
          <div className="grid-2">
            <div className="ui-field">
              <label htmlFor="authorName">Author name</label>
              <input id="authorName" name="authorName" required />
            </div>
            <div className="ui-field">
              <label htmlFor="authorEmail">Author email</label>
              <input id="authorEmail" name="authorEmail" type="email" />
            </div>
          </div>
          <div className="grid-2">
            <div className="ui-field">
              <label htmlFor="authorRole">Role or context</label>
              <input id="authorRole" name="authorRole" placeholder="Client, buyer, parent, venue owner" />
            </div>
            <div className="ui-field">
              <label htmlFor="serviceName">Service or product</label>
              <input id="serviceName" name="serviceName" />
            </div>
          </div>
          <div className="ui-field">
            <label htmlFor="quote">Quote</label>
            <textarea id="quote" name="quote" required />
          </div>
          <div className="grid-3">
            <div className="ui-field">
              <label htmlFor="rating">Rating</label>
              <input id="rating" name="rating" type="number" min="1" max="5" defaultValue="5" />
            </div>
            <div className="ui-field">
              <label htmlFor="source">Source</label>
              <input id="source" name="source" defaultValue="first-party" />
            </div>
            <div className="ui-field">
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
            <div className="ui-field">
              <label htmlFor="sourceUrl">Source URL</label>
              <input id="sourceUrl" name="sourceUrl" />
            </div>
            <div className="ui-field">
              <label htmlFor="productName">Product</label>
              <input id="productName" name="productName" />
            </div>
          </div>
          <div className="ui-zero">
            <label className="ui-zero">
              <input name="permissionGranted" type="checkbox" />
              Permission granted
            </label>
            <label className="ui-zero">
              <input name="featured" type="checkbox" />
              Featured
            </label>
          </div>
          <button className="ui-button" type="submit">
            <Plus size={18} />
            Add testimonial
          </button>
        </form>

        <div className="ui-card ui-card-density-normal ui-card-min-md">
          <div className="page-header compact-header">
            <div>
              <h2 className="section-title">Moderation queue</h2>
              <p>{testimonialCount} matching testimonials</p>
            </div>
            <div className="ui-zero">
              {statusFilters.map((filter) => (
                <Link
                  className={filter === statusFilter ? "ui-button" : "ui-button ui-button-secondary"}
                  href={`/admin/modules/testimonials?status=${filter}`}
                  key={filter}
                >
                  {filter}
                </Link>
              ))}
            </div>
          </div>
          <table className="ui-table">
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
                    <span className="muted-text">
                      {testimonial.authorRole || testimonial.serviceName || "No context"} · {testimonial.rating}/5
                    </span>
                    <br />
                    <span className="muted-text">
                      Consent:{" "}
                      {testimonial.permissionGrantedAt
                        ? formatDateTime(testimonial.permissionGrantedAt, settings.timezone)
                        : testimonial.permissionGranted
                          ? "recorded before snapshots"
                          : "missing"}
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
                    <span className="muted-text">{formatDateTime(testimonial.submittedAt, settings.timezone)}</span>
                  </td>
                  <td>
                    <span className={statusClass(testimonial.status)}>{enumLabel(testimonial.status)}</span>{" "}
                    {testimonial.featured ? <span className="ui-badge ui-badge-success">featured</span> : null}
                    {!testimonial.permissionGranted ? (
                      <>
                        {" "}
                        <span className="ui-badge ui-badge-danger">needs permission</span>
                      </>
                    ) : null}
                  </td>
                  <td>
                    <div className="ui-zero">
                      <form action={updateTestimonialModerationAction}>
                        <input type="hidden" name="id" value={testimonial.id} />
                        <input type="hidden" name="status" value={TestimonialStatus.APPROVED} />
                        <button className="ui-button ui-button-secondary" disabled={!testimonial.permissionGranted} type="submit">
                          Approve
                        </button>
                      </form>
                      <form action={updateTestimonialModerationAction}>
                        <input type="hidden" name="id" value={testimonial.id} />
                        <input type="hidden" name="status" value={TestimonialStatus.REJECTED} />
                        <button className="ui-button ui-button-secondary" type="submit">
                          Reject
                        </button>
                      </form>
                      <form action={updateTestimonialModerationAction}>
                        <input type="hidden" name="id" value={testimonial.id} />
                        <input type="hidden" name="featured" value={testimonial.featured ? "false" : "true"} />
                        <button
                          className="ui-button ui-button-secondary"
                          disabled={!testimonial.featured && (!testimonial.permissionGranted || testimonial.status !== TestimonialStatus.APPROVED)}
                          type="submit"
                        >
                          {testimonial.featured ? "Unfeature" : "Feature"}
                        </button>
                      </form>
                      <form action={updateTestimonialModerationAction}>
                        <input type="hidden" name="id" value={testimonial.id} />
                        <input type="hidden" name="status" value={TestimonialStatus.ARCHIVED} />
                        <button className="ui-button ui-button-secondary" type="submit">
                          Archive
                        </button>
                      </form>
                      <form action={deleteTestimonialAction} className="form-grid">
                        <input type="hidden" name="id" value={testimonial.id} />
                        <label className="ui-zero">
                          <input name="confirmDelete" type="checkbox" required />
                          Delete
                        </label>
                        <button className="ui-button ui-button-danger" type="submit">
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
          <div className="ui-zero">
            <Link
              className="ui-button ui-button-secondary"
              href={`/admin/modules/testimonials?status=${statusFilter}&page=${Math.max(1, page - 1)}`}
              aria-disabled={page <= 1}
            >
              Previous
            </Link>
            <span className="ui-badge">
              Page {Math.min(page, pageCount)} of {pageCount}
            </span>
            <Link
              className="ui-button ui-button-secondary"
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
