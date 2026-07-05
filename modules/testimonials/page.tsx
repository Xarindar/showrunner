import Link from "next/link";
import { TestimonialStatus } from "@prisma/client";
import { MessageSquare, Plus, ShieldCheck, Star } from "lucide-react";
import { getAccessibleTestimonialWhere, requireAdmin } from "@/lib/auth";
import { enumLabel, formatDateTime } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { getSiteSettings } from "@/lib/site";
import { createTestimonialAction, deleteTestimonialAction, updateTestimonialModerationAction } from "./actions";
import { Button, Card, EqualGrid, Pagination, Switch, Table } from "@/components/ui";
import { ModuleActionModals } from "@/components/ui/module-action-modals";

export const dynamic = "force-dynamic";

const pageSize = 25;
const statusFilters = ["all", ...Object.values(TestimonialStatus).map((status) => status.toLowerCase())] as const;

type TestimonialsPageProps = {
  searchParams: Promise<{saved?: string;error?: string;page?: string;status?: string;}>;
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
  })]
  );
  const pageCount = Math.max(1, Math.ceil(testimonialCount / pageSize));
  const savedMessage = params.saved ? "Testimonial changes saved." : null;
  const errorMessage = params.error || null;
  const addTestimonialForm = (
    <form action={createTestimonialAction} className="form-grid">
      <EqualGrid>
        <div className="ui-field">
          <label htmlFor="testimonial-authorName">Author name</label>
          <input id="testimonial-authorName" name="authorName" required />
        </div>
        <div className="ui-field">
          <label htmlFor="testimonial-authorEmail">Author email</label>
          <input id="testimonial-authorEmail" name="authorEmail" type="email" />
        </div>
      </EqualGrid>
      <EqualGrid>
        <div className="ui-field">
          <label htmlFor="testimonial-authorRole">Role or context</label>
          <input id="testimonial-authorRole" name="authorRole" placeholder="Client, buyer, parent, venue owner" />
        </div>
        <div className="ui-field">
          <label htmlFor="testimonial-serviceName">Service or product</label>
          <input id="testimonial-serviceName" name="serviceName" />
        </div>
      </EqualGrid>
      <div className="ui-field">
        <label htmlFor="testimonial-quote">Quote</label>
        <textarea id="testimonial-quote" name="quote" required />
      </div>
      <EqualGrid min="220px">
        <div className="ui-field">
          <label htmlFor="testimonial-rating">Rating</label>
          <input id="testimonial-rating" name="rating" type="number" min="1" max="5" defaultValue="5" />
        </div>
        <div className="ui-field">
          <label htmlFor="testimonial-source">Source</label>
          <input id="testimonial-source" name="source" defaultValue="first-party" />
        </div>
        <div className="ui-field">
          <label htmlFor="testimonial-status">Status</label>
          <select id="testimonial-status" name="status" defaultValue={TestimonialStatus.PENDING}>
            {Object.values(TestimonialStatus).map((status) => (
              <option key={status} value={status}>
                {enumLabel(status)}
              </option>
            ))}
          </select>
        </div>
      </EqualGrid>
      <EqualGrid>
        <div className="ui-field">
          <label htmlFor="testimonial-sourceUrl">Source URL</label>
          <input id="testimonial-sourceUrl" name="sourceUrl" />
        </div>
        <div className="ui-field">
          <label htmlFor="testimonial-productName">Product</label>
          <input id="testimonial-productName" name="productName" />
        </div>
      </EqualGrid>
      <div className="module-check-grid">
        <Switch label="Permission granted" name="permissionGranted" variant="inline" />
        <Switch label="Featured" name="featured" variant="inline" />
      </div>
      <div className="module-modal-actions">
        <Button type="submit">
          <Plus size={18} />
          Add testimonial
        </Button>
      </div>
    </form>
  );

  return (
    <div className="stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">Testimonials</p>
          <h1>Reviews and social proof</h1>
          <p>Collect first-party quotes, moderate submissions, and prepare approved testimonials for the rebuilt client surface.</p>
        </div>
      </header>

      {savedMessage ? <div className="success-message">{savedMessage}</div> : null}
      {errorMessage ? <div className="error">{errorMessage}</div> : null}

      <EqualGrid as="section" min="220px">
        <Card>
          <ShieldCheck size={22} />
          <h3>{approvedCount} approved</h3>
          <p className="lead lead-compact">
            Quotes cleared for public display.
          </p>
        </Card>
        <Card>
          <MessageSquare size={22} />
          <h3>{pendingCount} pending</h3>
          <p className="lead lead-compact">
            New submissions waiting for moderation.
          </p>
        </Card>
        <Card>
          <Star size={22} />
          <h3>{featuredCount} featured</h3>
          <p className="lead lead-compact">
            Approved quotes shown in the homepage proof block.
          </p>
        </Card>
      </EqualGrid>

      <Card as="section">
          <div className="page-header compact-header">
            <div>
              <h2 className="section-title">Moderation queue</h2>
              <p>{testimonialCount} matching testimonials</p>
            </div>
            <div className="module-card-header-actions">
              <ModuleActionModals
                items={[
                  {
                    content: addTestimonialForm,
                    icon: "plus",
                    id: "add",
                    label: "Add",
                    title: "Add testimonial",
                    variant: "primary"
                  }
                ]}
                toolbarLabel="Testimonial tools"
              />
            </div>
            <div className="ui-zero">
              {statusFilters.map((filter) =>
              <Link
                className={filter === statusFilter ? "ui-button" : "ui-button ui-button-secondary"}
                href={`/admin/modules/testimonials?status=${filter}`}
                key={filter}>
                
                  {filter}
                </Link>
              )}
            </div>
          </div>
          <Table>
            <thead>
              <tr>
                <th>Author</th>
                <th>Quote</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {testimonials.map((testimonial) =>
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
                      {testimonial.permissionGrantedAt ?
                    formatDateTime(testimonial.permissionGrantedAt, settings.timezone) :
                    testimonial.permissionGranted ?
                    "recorded before snapshots" :
                    "missing"}
                    </span>
                    {testimonial.client ?
                  <>
                        <br />
                        <Link href={`/admin/clients/${testimonial.client.id}`}>Client record</Link>
                      </> :
                  null}
                  </td>
                  <td>
                    {testimonial.quote}
                    <br />
                    <span className="muted-text">{formatDateTime(testimonial.submittedAt, settings.timezone)}</span>
                  </td>
                  <td>
                    <span className={statusClass(testimonial.status)}>{enumLabel(testimonial.status)}</span>{" "}
                    {testimonial.featured ? <span className="ui-badge ui-badge-success">featured</span> : null}
                    {!testimonial.permissionGranted ?
                  <>
                        {" "}
                        <span className="ui-badge ui-badge-danger">needs permission</span>
                      </> :
                  null}
                  </td>
                  <td>
                    <div className="ui-zero">
                      <form action={updateTestimonialModerationAction}>
                        <input type="hidden" name="id" value={testimonial.id} />
                        <input type="hidden" name="status" value={TestimonialStatus.APPROVED} />
                        <Button disabled={!testimonial.permissionGranted} type="submit" variant="secondary">
                          Approve
                        </Button>
                      </form>
                      <form action={updateTestimonialModerationAction}>
                        <input type="hidden" name="id" value={testimonial.id} />
                        <input type="hidden" name="status" value={TestimonialStatus.REJECTED} />
                        <Button type="submit" variant="secondary">
                          Reject
                        </Button>
                      </form>
                      <form action={updateTestimonialModerationAction}>
                        <input type="hidden" name="id" value={testimonial.id} />
                        <input type="hidden" name="featured" value={testimonial.featured ? "false" : "true"} />
                        <Button

                        disabled={!testimonial.featured && (!testimonial.permissionGranted || testimonial.status !== TestimonialStatus.APPROVED)}
                        type="submit" variant="secondary">
                        
                          {testimonial.featured ? "Unfeature" : "Feature"}
                        </Button>
                      </form>
                      <form action={updateTestimonialModerationAction}>
                        <input type="hidden" name="id" value={testimonial.id} />
                        <input type="hidden" name="status" value={TestimonialStatus.ARCHIVED} />
                        <Button type="submit" variant="secondary">
                          Archive
                        </Button>
                      </form>
                      <form action={deleteTestimonialAction} className="form-grid">
                        <input type="hidden" name="id" value={testimonial.id} />
                        <Switch label="Delete" name="confirmDelete" required variant="inline" />
                        <Button type="submit" variant="danger">
                          Delete
                        </Button>
                      </form>
                    </div>
                  </td>
                </tr>
              )}
              {!testimonials.length ?
              <tr>
                  <td colSpan={4}>No testimonials yet.</td>
                </tr> :
              null}
            </tbody>
          </Table>
          <Pagination
            label="Testimonial pages"
            nextHref={`/admin/modules/testimonials?status=${statusFilter}&page=${Math.min(pageCount, page + 1)}`}
            page={page}
            pageCount={pageCount}
            previousHref={`/admin/modules/testimonials?status=${statusFilter}&page=${Math.max(1, page - 1)}`}
          />
        </Card>
    </div>);

}
