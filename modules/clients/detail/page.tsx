import Link from "next/link";
import { notFound } from "next/navigation";
import { BookingStatus, ClientPipelineStage, MediaDriver, MediaVariantType, type Prisma } from "@prisma/client";
import { GitMerge, Save, Search } from "lucide-react";
import { getAccessibleClientWhere, requireAdmin } from "@/lib/auth";
import { clientStatusLabel, clientStatusOptions, defaultClientStatus, normalizeClientStatus } from "@/lib/clients/status";
import { prisma } from "@/lib/prisma";
import { enumLabel, formatDateTime, stringArrayCsv, stringArrayFromUnknown } from "@/lib/format";
import { isMediaUploadDriverConfigured, mediaAssetDisplayUrl, privateMediaUploadMimeTypes, supportsPrivateMediaDriver } from "@/lib/media";
import { isRecord } from "@/lib/objects";
import { getSiteSettings } from "@/lib/site";
import { addDaysToDateKey, getZonedDateKey } from "@/lib/timezone";
import {
  addClientFileAction,
  addClientNoteAction,
  deleteClientFileAction,
  deleteClientNoteAction,
  mergeClientsAction,
  updateClientAction } from "../actions";
import { Button, ButtonLink, Card, EqualGrid, Pagination, Switch, Table, UploadField } from "@/components/ui";
import { ModuleActionModals } from "@/components/ui/module-action-modals";
import { ClientNotesDocumentsCard } from "./client-notes-documents-card";
import { ClientProfileCard } from "./client-profile-card";

export const dynamic = "force-dynamic";

type ClientDetailPageProps = {
  params: Promise<{id: string;}>;
  searchParams: Promise<{
    documentsPage?: string;
    error?: string;
    merge?: string;
    mergeSearch?: string;
    notesPage?: string;
    recordsTab?: string;
    saved?: string;
  }>;
};

type ClientMergeCandidate = {
  _count: {
    billingDocuments: number;
    bookings: number;
    formSubmissions: number;
    notes: number;
    orders: number;
  };
  companyName: string;
  email: string;
  familyName: string;
  id: string;
  name: string;
  phone: string | null;
  updatedAt: Date;
};

type ProfileDetailItem = {
  href?: string;
  label: string;
  value: string;
};

type ProfileDetailSection = {
  items: ProfileDetailItem[];
  title: string;
};

type ClientCommunicationEmailOutbox = {
  createdAt: Date;
  id: string;
  purpose: string;
  recipientEmail: string;
  relatedId: string;
  relatedType: string;
  sentAt: Date | null;
  subject: string;
  template: { key: string | null; name: string; purpose: string } | null;
  templateKey: string;
  updatedAt: Date;
};

type ClientCommunicationMessageLog = {
  bodyPreview: string;
  channel: string;
  createdAt: Date;
  id: string;
  purpose: string;
  recipientEmail: string;
  recipientPhone: string;
  relatedId: string;
  relatedType: string;
  sentAt: Date | null;
  subject: string;
  template: { name: string; purpose: string } | null;
};

type ClientCommunicationRow = {
  contact: string;
  detail: string;
  id: string;
  occurredAt: Date;
  relatedId: string;
  relatedType: string;
  title: string;
  typeLabel: string;
};

type ClientDetailPaginationKey = "documentsPage" | "notesPage";
type ClientDetailRecordsTab = "documents" | "notes";

const mergeCandidateSelect = {
  _count: { select: { billingDocuments: true, bookings: true, formSubmissions: true, notes: true, orders: true } },
  companyName: true,
  email: true,
  familyName: true,
  id: true,
  name: true,
  phone: true,
  updatedAt: true
} satisfies Prisma.ClientSelect;

function truncate(value: string, length = 140) {
  return value.length > length ? `${value.slice(0, length - 1)}...` : value;
}

function dateInputValue(value: Date | null | undefined) {
  return value ? value.toISOString().slice(0, 10) : "";
}

function pageNumber(value: string | undefined) {
  const page = Number(value);
  return Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
}

function clampPage(page: number, pageCount: number) {
  return Math.min(Math.max(1, page), Math.max(1, pageCount));
}

function clientDetailPageHref(
  clientId: string,
  queryParams: Awaited<ClientDetailPageProps["searchParams"]>,
  key: ClientDetailPaginationKey,
  page: number
) {
  const params = new URLSearchParams();
  const otherKey = key === "notesPage" ? "documentsPage" : "notesPage";
  const otherPage = pageNumber(queryParams[otherKey]);
  const recordsTab: ClientDetailRecordsTab = key === "documentsPage" ? "documents" : "notes";

  if (queryParams.merge) params.set("merge", queryParams.merge);
  if (queryParams.mergeSearch) params.set("mergeSearch", queryParams.mergeSearch);
  params.set("recordsTab", recordsTab);
  if (otherPage > 1) params.set(otherKey, String(otherPage));
  if (page > 1) params.set(key, String(page));

  const queryString = params.toString();
  return `/admin/clients/${clientId}${queryString ? `?${queryString}` : ""}#client-notes-documents`;
}

function clientRecordsTabFromQuery(queryParams: Awaited<ClientDetailPageProps["searchParams"]>): ClientDetailRecordsTab {
  if (queryParams.recordsTab === "documents") return "documents";
  if (queryParams.recordsTab === "notes") return "notes";
  return pageNumber(queryParams.documentsPage) > 1 && pageNumber(queryParams.notesPage) <= 1 ? "documents" : "notes";
}

function canUploadClientDocuments(driver: MediaDriver) {
  return supportsPrivateMediaDriver(driver) && isMediaUploadDriverConfigured(driver);
}

function formatDateOnly(value: Date | null | undefined) {
  return value ? new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" }).format(value) : "";
}

function formatTimeOnly(value: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en", { timeStyle: "short", timeZone }).format(value);
}

function formatAppointmentActivityDate(value: Date, now: Date, timeZone: string) {
  const todayKey = getZonedDateKey(now, timeZone);
  const appointmentKey = getZonedDateKey(value, timeZone);
  const time = formatTimeOnly(value, timeZone);

  if (appointmentKey === todayKey) return `Today, ${time}`;
  if (appointmentKey === addDaysToDateKey(todayKey, 1)) return `Tomorrow, ${time}`;
  if (appointmentKey === addDaysToDateKey(todayKey, -1)) return `Yesterday, ${time}`;

  return formatDateTime(value, timeZone);
}

function profileDetailItem(label: string, value: string | null | undefined, href?: string): ProfileDetailItem | null {
  if (!value) return null;
  return href ? { href, label, value } : { label, value };
}

function profileDetailItems(items: Array<ProfileDetailItem | null>): ProfileDetailItem[] {
  return items.filter((item): item is ProfileDetailItem => Boolean(item));
}

function profileDetailSections(sections: ProfileDetailSection[]): ProfileDetailSection[] {
  return sections.filter((section) => section.items.length);
}

function preferencesNotes(value: unknown) {
  return isRecord(value) && typeof value.notes === "string" ? value.notes : "";
}

function formattedAddress(client: {
  addressLine1: string;
  addressLine2: string;
  city: string;
  country: string;
  postalCode: string;
  region: string;
}) {
  const locality = [client.city, client.region, client.postalCode].filter(Boolean).join(", ");
  return [client.addressLine1, client.addressLine2, locality, client.country].filter(Boolean).join(", ");
}

function mergeCandidateSearchFilter(query: string): Prisma.ClientWhereInput {
  const value = query.trim();
  if (!value) return {};

  return {
    OR: [
      { name: { contains: value, mode: "insensitive" } },
      { email: { contains: value, mode: "insensitive" } },
      { phone: { contains: value, mode: "insensitive" } },
      { companyName: { contains: value, mode: "insensitive" } },
      { familyName: { contains: value, mode: "insensitive" } },
      { tags: { some: { label: { contains: value.toLowerCase(), mode: "insensitive" } } } }
    ]
  };
}

function candidateContext(candidate: ClientMergeCandidate) {
  return candidate.companyName || candidate.familyName || candidate.phone || "Individual client";
}

function clientEmailSet(client: {alternateEmails: unknown;email: string;}) {
  return [...new Set([client.email, ...stringArrayFromUnknown(client.alternateEmails)].map((email) => email.trim().toLowerCase()).filter(Boolean))];
}

function clientPhoneSet(client: {alternatePhones: unknown;phone: string | null;}) {
  return [...new Set([client.phone || "", ...stringArrayFromUnknown(client.alternatePhones)].map((phone) => phone.trim()).filter(Boolean))];
}

function manualCommunicationTypeLabel(channel: string) {
  if (channel === "PHONE") return "Phone Call";
  if (channel === "SMS") return "Text Message";
  return "Manual Email";
}

function communicationRows(input: {
  emailOutboxRows: ClientCommunicationEmailOutbox[];
  messageLogs: ClientCommunicationMessageLog[];
}): ClientCommunicationRow[] {
  return [
    ...input.emailOutboxRows.map((row) => ({
      contact: row.recipientEmail,
      detail: row.template?.name || row.templateKey || enumLabel(row.purpose),
      id: `email-${row.id}`,
      occurredAt: row.sentAt || row.createdAt,
      relatedId: row.relatedId,
      relatedType: row.relatedType,
      title: row.subject || row.template?.name || row.templateKey || "Automated email",
      typeLabel: "Auto Email"
    })),
    ...input.messageLogs.map((log) => ({
      contact: log.recipientEmail || log.recipientPhone,
      detail: log.bodyPreview || log.template?.name || enumLabel(log.purpose),
      id: `message-${log.id}`,
      occurredAt: log.sentAt || log.createdAt,
      relatedId: log.relatedId,
      relatedType: log.relatedType,
      title: log.subject || log.template?.name || (log.channel === "PHONE" ? "Phone call" : enumLabel(log.purpose)),
      typeLabel: manualCommunicationTypeLabel(log.channel)
    }))
  ].sort((first, second) => second.occurredAt.getTime() - first.occurredAt.getTime());
}

function relatedRecordHref(type: string, id: string) {
  if (!type || !id) return "";
  if (type === "booking") return `/admin/appointments/${id}`;
  if (type === "order") return `/admin/modules/products?order=${encodeURIComponent(id)}`;
  if (type === "billingDocument") return `/admin/modules/billing?document=${encodeURIComponent(id)}`;
  if (type === "formSubmission" || type === "form_submission") return `/admin/modules/forms`;
  return "";
}

function relatedRecordLabel(type: string, id: string) {
  if (!type || !id) return "None";
  return `${type} ${id.slice(0, 8)}`;
}

export default async function ClientDetailPage({ params, searchParams }: ClientDetailPageProps) {
  const [{ id }, queryParams] = await Promise.all([params, searchParams]);
  const { saved, error } = queryParams;
  const mergeSearch = String(queryParams.mergeSearch || "").trim();
  const openMergeModal = queryParams.merge === "1" || Boolean(mergeSearch);
  const user = await requireAdmin("clients:manage");
  const settings = await getSiteSettings();
  const client = await prisma.client.findFirst({
    where: await getAccessibleClientWhere(user, settings.siteId, { id }),
    include: {
      tags: { orderBy: { label: "asc" } },
      files: {
        include: {
          mediaAsset: {
            select: {
              driver: true,
              id: true,
              isPrivate: true,
              key: true,
              storageProviderId: true,
              url: true
            }
          }
        },
        orderBy: { uploadedAt: "desc" },
        take: 40
      },
      notes: { orderBy: { createdAt: "desc" } },
      bookings: {
        include: { service: true },
        orderBy: { startsAt: "desc" },
        take: 40
      },
      formSubmissions: {
        select: { id: true },
        orderBy: { createdAt: "desc" },
        take: 40
      },
      billingDocuments: {
        select: { id: true },
        orderBy: { updatedAt: "desc" },
        take: 40
      },
      orders: {
        select: { id: true },
        orderBy: { updatedAt: "desc" },
        take: 20
      }
    }
  });

  if (!client) notFound();

  const clientEmails = clientEmailSet(client);
  const clientPhones = clientPhoneSet(client);
  const bookingIds = client.bookings.map((booking) => booking.id);
  const orderIds = client.orders.map((order) => order.id);
  const billingDocumentIds = client.billingDocuments.map((document) => document.id);
  const formSubmissionIds = client.formSubmissions.map((submission) => submission.id);
  const relatedOutboxFilters: Prisma.EmailOutboxWhereInput[] = [];
  const relatedMessageLogFilters: Prisma.MessageLogWhereInput[] = [];
  if (bookingIds.length) {
    relatedOutboxFilters.push({ relatedType: "booking", relatedId: { in: bookingIds } });
    relatedMessageLogFilters.push({ relatedType: "booking", relatedId: { in: bookingIds } });
  }
  if (orderIds.length) {
    relatedOutboxFilters.push({ relatedType: "order", relatedId: { in: orderIds } });
    relatedMessageLogFilters.push({ relatedType: "order", relatedId: { in: orderIds } });
  }
  if (billingDocumentIds.length) {
    relatedOutboxFilters.push({ relatedType: "billingDocument", relatedId: { in: billingDocumentIds } });
    relatedMessageLogFilters.push({ relatedType: "billingDocument", relatedId: { in: billingDocumentIds } });
  }
  if (formSubmissionIds.length) {
    relatedOutboxFilters.push({ relatedType: "formSubmission", relatedId: { in: formSubmissionIds } });
    relatedOutboxFilters.push({ relatedType: "form_submission", relatedId: { in: formSubmissionIds } });
    relatedMessageLogFilters.push({ relatedType: "formSubmission", relatedId: { in: formSubmissionIds } });
    relatedMessageLogFilters.push({ relatedType: "form_submission", relatedId: { in: formSubmissionIds } });
  }

  const [exactMergeWhere, searchedMergeWhere] = await Promise.all([
    getAccessibleClientWhere(user, settings.siteId, {
      id: { not: client.id },
      name: { equals: client.name, mode: "insensitive" }
    }),
    mergeSearch
      ? getAccessibleClientWhere(user, settings.siteId, {
          id: { not: client.id },
          ...mergeCandidateSearchFilter(mergeSearch)
        })
      : Promise.resolve(null)
  ]);

  const [emailOutboxRows, communicationMessageLogs, exactMergeCandidates, searchedMergeCandidates] = await Promise.all([
  prisma.emailOutbox.findMany({
    where: {
      siteId: settings.siteId,
      OR: [{ recipientEmail: { in: clientEmails } }, ...relatedOutboxFilters]
    },
    include: { template: { select: { name: true, key: true, purpose: true } } },
    orderBy: { createdAt: "desc" },
    take: 80
  }),
  prisma.messageLog.findMany({
    where: {
      siteId: settings.siteId,
      OR: [
        { clientId: client.id },
        ...(clientEmails.length ? [{ recipientEmail: { in: clientEmails } }] : []),
        ...(clientPhones.length ? [{ recipientPhone: { in: clientPhones } }] : []),
        ...relatedMessageLogFilters
      ]
    },
    include: { template: { select: { name: true, purpose: true } } },
    orderBy: { createdAt: "desc" },
    take: 80
  }),
  prisma.client.findMany({
    where: exactMergeWhere,
    orderBy: { updatedAt: "desc" },
    select: mergeCandidateSelect,
    take: 20
  }),
  searchedMergeWhere
    ? prisma.client.findMany({
        where: searchedMergeWhere,
        orderBy: { updatedAt: "desc" },
        select: mergeCandidateSelect,
        take: 50
      })
    : Promise.resolve([])]
  );

  const mergeCandidateMap = new Map<string, ClientMergeCandidate & { matchLabel: string }>();
  exactMergeCandidates.forEach((candidate) => {
    mergeCandidateMap.set(candidate.id, { ...candidate, matchLabel: "Exact name match" });
  });
  searchedMergeCandidates.forEach((candidate) => {
    if (!mergeCandidateMap.has(candidate.id)) {
      mergeCandidateMap.set(candidate.id, { ...candidate, matchLabel: "Search result" });
    }
  });
  const mergeCandidates = Array.from(mergeCandidateMap.values());
  const clientCommunicationRows = communicationRows({ emailOutboxRows, messageLogs: communicationMessageLogs });

  const savedMessage = saved === "merged" ? "Client records merged." : saved ? "Client record updated." : "";
  const now = new Date();
  const address = formattedAddress(client);
  const alternateEmails = stringArrayCsv(client.alternateEmails);
  const alternatePhones = stringArrayCsv(client.alternatePhones);
  const clientAffiliation = client.companyName || client.familyName || "Individual client";
  const clientDocumentAccept = privateMediaUploadMimeTypes.join(",");
  const clientDocumentUploadEnabled = canUploadClientDocuments(settings.mediaDriver);
  const currentAppointment = client.bookings
    .filter(
      (booking) =>
        booking.startsAt >= now && (booking.status === BookingStatus.PENDING || booking.status === BookingStatus.CONFIRMED)
    )
    .sort((first, second) => first.startsAt.getTime() - second.startsAt.getTime())[0];
  const recentAppointments = client.bookings.filter((booking) => booking.id !== currentAppointment?.id).slice(0, 4);
  const activityAppointments = [...(currentAppointment ? [currentAppointment] : []), ...recentAppointments];
  const recordsPageSize = 5;
  const initialRecordsTab = clientRecordsTabFromQuery(queryParams);
  const notesPageCount = Math.max(1, Math.ceil(client.notes.length / recordsPageSize));
  const documentsPageCount = Math.max(1, Math.ceil(client.files.length / recordsPageSize));
  const notesPage = clampPage(pageNumber(queryParams.notesPage), notesPageCount);
  const documentsPage = clampPage(pageNumber(queryParams.documentsPage), documentsPageCount);
  const visibleNotes = client.notes.slice((notesPage - 1) * recordsPageSize, notesPage * recordsPageSize);
  const visibleDocuments = client.files.slice((documentsPage - 1) * recordsPageSize, documentsPage * recordsPageSize);
  const profileSections = profileDetailSections([
    {
      title: "Additional contact",
      items: profileDetailItems([
        profileDetailItem("Alternate emails", alternateEmails),
        profileDetailItem("Alternate phones", alternatePhones)
      ])
    },
    {
      title: "Record",
      items: profileDetailItems([
        profileDetailItem("Company", client.companyName),
        profileDetailItem("Family or household", client.familyName)
      ])
    },
    {
      title: "Profile",
      items: profileDetailItems([
        profileDetailItem("Address", address),
        profileDetailItem("Timezone", client.timezone),
        profileDetailItem("Pronouns", client.pronouns),
        profileDetailItem("Birthday", formatDateOnly(client.birthday)),
        profileDetailItem("Anniversary", formatDateOnly(client.anniversary))
      ])
    }
  ]);
  const consentBadges = [
    client.emailOptIn ? "Email opt-in" : "",
    client.smsOptIn ? "SMS opt-in" : "",
    client.photoUsageRelease ? "Photo release" : "",
    client.dataExportRequestedAt ? "Export requested" : "",
    client.dataDeletionRequestedAt ? "Deletion requested" : ""
  ].filter(Boolean);
  const profileForm = (
    <form action={updateClientAction} className="form-grid">
      <input type="hidden" name="id" value={client.id} />
      <EqualGrid>
        <div className="ui-field">
          <label htmlFor="name">Name</label>
          <input id="name" name="name" defaultValue={client.name} required />
        </div>
        <div className="ui-field">
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" defaultValue={client.email} required />
        </div>
      </EqualGrid>
      <div className="ui-field">
        <label htmlFor="photoUrl">Client photo URL</label>
        <input id="photoUrl" name="photoUrl" defaultValue={client.photoUrl} placeholder="/uploads/client-photo.jpg" />
      </div>
      <EqualGrid>
        <div className="ui-field">
          <label htmlFor="companyName">Company</label>
          <input id="companyName" name="companyName" defaultValue={client.companyName} />
        </div>
        <div className="ui-field">
          <label htmlFor="familyName">Family or household</label>
          <input id="familyName" name="familyName" defaultValue={client.familyName} />
        </div>
      </EqualGrid>
      <EqualGrid>
        <div className="ui-field">
          <label htmlFor="phone">Phone</label>
          <input id="phone" name="phone" defaultValue={client.phone || ""} />
        </div>
        <div className="ui-field">
          <label htmlFor="status">Status</label>
          <select id="status" name="status" defaultValue={normalizeClientStatus(client.status) || defaultClientStatus}>
            {clientStatusOptions.map((status) =>
            <option key={status.value} value={status.value}>
                {status.label}
              </option>
            )}
          </select>
        </div>
      </EqualGrid>
      <EqualGrid>
        <div className="ui-field">
          <label htmlFor="pipelineStage">Pipeline</label>
          <select id="pipelineStage" name="pipelineStage" defaultValue={client.pipelineStage}>
            {Object.values(ClientPipelineStage).map((stage) =>
            <option key={stage} value={stage}>
                {enumLabel(stage)}
              </option>
            )}
          </select>
        </div>
        <div className="ui-field">
          <label htmlFor="tags">Tags</label>
          <input id="tags" name="tags" defaultValue={client.tags.map((tag) => tag.label).join(", ")} />
        </div>
      </EqualGrid>
      <EqualGrid>
        <div className="ui-field">
          <label htmlFor="alternateEmails">Alternate emails</label>
          <input id="alternateEmails" name="alternateEmails" defaultValue={stringArrayCsv(client.alternateEmails)} />
        </div>
        <div className="ui-field">
          <label htmlFor="alternatePhones">Alternate phones</label>
          <input id="alternatePhones" name="alternatePhones" defaultValue={stringArrayCsv(client.alternatePhones)} />
        </div>
      </EqualGrid>
      <EqualGrid>
        <div className="ui-field">
          <label htmlFor="addressLine1">Address</label>
          <input id="addressLine1" name="addressLine1" defaultValue={client.addressLine1} />
        </div>
        <div className="ui-field">
          <label htmlFor="addressLine2">Address 2</label>
          <input id="addressLine2" name="addressLine2" defaultValue={client.addressLine2} />
        </div>
      </EqualGrid>
      <EqualGrid min="220px">
        <div className="ui-field">
          <label htmlFor="city">City</label>
          <input id="city" name="city" defaultValue={client.city} />
        </div>
        <div className="ui-field">
          <label htmlFor="region">State/region</label>
          <input id="region" name="region" defaultValue={client.region} />
        </div>
        <div className="ui-field">
          <label htmlFor="postalCode">Postal code</label>
          <input id="postalCode" name="postalCode" defaultValue={client.postalCode} />
        </div>
      </EqualGrid>
      <EqualGrid min="220px">
        <div className="ui-field">
          <label htmlFor="country">Country</label>
          <input id="country" name="country" defaultValue={client.country} />
        </div>
        <div className="ui-field">
          <label htmlFor="timezone">Timezone</label>
          <input id="timezone" name="timezone" defaultValue={client.timezone} placeholder={settings.timezone} />
        </div>
        <div className="ui-field">
          <label htmlFor="pronouns">Pronouns</label>
          <input id="pronouns" name="pronouns" defaultValue={client.pronouns} />
        </div>
      </EqualGrid>
      <EqualGrid>
        <div className="ui-field">
          <label htmlFor="birthday">Birthday</label>
          <input id="birthday" name="birthday" type="date" defaultValue={dateInputValue(client.birthday)} />
        </div>
        <div className="ui-field">
          <label htmlFor="anniversary">Anniversary</label>
          <input id="anniversary" name="anniversary" type="date" defaultValue={dateInputValue(client.anniversary)} />
        </div>
      </EqualGrid>
      <div className="ui-field">
        <label htmlFor="preferences">Preferences</label>
        <textarea id="preferences" name="preferences" defaultValue={preferencesNotes(client.preferences)} />
      </div>
      <EqualGrid min="220px">
        <Switch defaultChecked={client.emailOptIn} label="Email opt-in" name="emailOptIn" variant="inline" />
        <Switch defaultChecked={client.smsOptIn} label="SMS opt-in" name="smsOptIn" variant="inline" />
        <Switch defaultChecked={client.photoUsageRelease} label="Photo release" name="photoUsageRelease" variant="inline" />
      </EqualGrid>
      <EqualGrid min="220px">
        <Switch label="Record policy acceptance" name="policyAccepted" variant="inline" />
        <Switch defaultChecked={Boolean(client.dataExportRequestedAt)} label="Data export requested" name="dataExportRequested" variant="inline" />
        <Switch defaultChecked={Boolean(client.dataDeletionRequestedAt)} label="Deletion requested" name="dataDeletionRequested" variant="inline" />
      </EqualGrid>
      <div className="ui-field">
        <label htmlFor="privateNotes">Private summary</label>
        <textarea id="privateNotes" name="privateNotes" defaultValue={client.privateNotes || ""} />
      </div>
      <Button type="submit">
        <Save size={18} />
        Save profile
      </Button>
    </form>
  );
  const profileDetails = (
    <div className="clients-profile-detail-panel" aria-label="Client profile details">
      {profileSections.map((section) => (
        <section className="clients-profile-detail-section" key={section.title}>
          <h3>{section.title}</h3>
          <dl className="clients-profile-detail-list">
            {section.items.map((item) => (
              <div key={item.label}>
                <dt>{item.label}</dt>
                <dd>{item.href ? <a href={item.href}>{item.value}</a> : item.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
      {client.tags.length ? (
        <section className="clients-profile-detail-section">
          <h3>Tags</h3>
          <div className="clients-profile-badge-list">
            {client.tags.map((tag) => (
              <span className="ui-badge" key={tag.id}>
                {tag.label}
              </span>
            ))}
          </div>
        </section>
      ) : null}
      {consentBadges.length ? (
        <section className="clients-profile-detail-section">
          <h3>Permissions</h3>
          <div className="clients-profile-badge-list">
            {consentBadges.map((badge) => (
              <span className={badge.includes("requested") ? "ui-badge ui-badge-danger" : "ui-badge ui-badge-success"} key={badge}>
                {badge}
              </span>
            ))}
          </div>
        </section>
      ) : null}
      {client.privateNotes ? (
        <section className="clients-profile-detail-section clients-profile-note-section">
          <h3>Private summary</h3>
          <p className="ui-zero">{client.privateNotes}</p>
        </section>
      ) : null}
    </div>
  );
  const noteForm = (
    <form action={addClientNoteAction} className="clients-tab-form form-grid">
      <input type="hidden" name="clientId" value={client.id} />
      <div className="ui-field">
        <label htmlFor="client-note-content">Note</label>
        <textarea id="client-note-content" name="content" required />
      </div>
      <Button type="submit">
        <Save size={18} />
        Save note
      </Button>
    </form>
  );
  const documentForm = (
    <form action={addClientFileAction} className="clients-tab-form form-grid" encType="multipart/form-data">
      <input type="hidden" name="clientId" value={client.id} />
      <EqualGrid>
        <div className="ui-field">
          <label htmlFor="client-document-title">Title</label>
          <input id="client-document-title" name="title" required />
        </div>
        <div className="ui-field">
          <label htmlFor="client-document-category">Category</label>
          <input id="client-document-category" name="category" placeholder="contract, release, gallery" />
        </div>
      </EqualGrid>
      <UploadField
        id="client-document-file"
        name="file"
        accept={clientDocumentAccept}
        required
        disabled={!clientDocumentUploadEnabled}
        label="Choose a document or drop it here"
        variant="document"
      />
      {!clientDocumentUploadEnabled ? (
        <p className="muted-text ui-zero">Document uploads need Server asset folder, S3, or R2 media storage configured.</p>
      ) : null}
      <div className="ui-field">
        <label htmlFor="client-document-notes">Notes</label>
        <textarea id="client-document-notes" name="notes" />
      </div>
      <Button type="submit" variant="secondary" disabled={!clientDocumentUploadEnabled}>
        <Save size={18} />
        Upload document
      </Button>
    </form>
  );
  const notesTable = (
    <Table className="clients-records-table-wrap" tableClassName="ui-data-table clients-records-table">
      <thead>
        <tr>
          <th>Note</th>
          <th>Created</th>
          <th>Action</th>
        </tr>
      </thead>
      <tbody>
        {visibleNotes.map((note) => (
          <tr key={note.id}>
            <td>
              <p className="clients-records-text">{note.content}</p>
            </td>
            <td>{formatDateTime(note.createdAt, settings.timezone)}</td>
            <td className="clients-records-action-cell">
              <form action={deleteClientNoteAction} className="clients-records-action-form">
                <input type="hidden" name="id" value={note.id} />
                <input type="hidden" name="clientId" value={client.id} />
                <Switch label="Confirm" name="confirmDelete" variant="inline" />
                <Button size="sm" type="submit" variant="secondary">
                  Delete
                </Button>
              </form>
            </td>
          </tr>
        ))}
        {!client.notes.length ? (
          <tr>
            <td className="ui-data-table-empty" colSpan={3}>
              No notes yet.
            </td>
          </tr>
        ) : null}
      </tbody>
    </Table>
  );
  const documentsTable = (
    <Table className="clients-records-table-wrap" tableClassName="ui-data-table clients-records-table">
      <thead>
        <tr>
          <th>Document</th>
          <th>Category</th>
          <th>Uploaded</th>
          <th>Action</th>
        </tr>
      </thead>
      <tbody>
        {visibleDocuments.map((file) => {
          const documentHref = file.mediaAsset ? mediaAssetDisplayUrl(file.mediaAsset, MediaVariantType.DOWNLOAD) : file.url;

          return (
            <tr key={file.id}>
              <td>
                <a href={documentHref}>
                  <strong>{file.title}</strong>
                </a>
                {file.notes ? <p className="clients-records-text muted-text">{truncate(file.notes, 84)}</p> : null}
              </td>
              <td>{file.category || "document"}</td>
              <td>{formatDateTime(file.uploadedAt, settings.timezone)}</td>
              <td className="clients-records-action-cell">
                <form action={deleteClientFileAction} className="clients-records-action-form">
                  <input type="hidden" name="id" value={file.id} />
                  <input type="hidden" name="clientId" value={client.id} />
                  <Switch label="Confirm" name="confirmDelete" variant="inline" />
                  <Button size="sm" type="submit" variant="secondary">
                    Delete
                  </Button>
                </form>
              </td>
            </tr>
          );
        })}
        {!client.files.length ? (
          <tr>
            <td className="ui-data-table-empty" colSpan={4}>
              No documents yet.
            </td>
          </tr>
        ) : null}
      </tbody>
    </Table>
  );
  const notesPagination = (
    <Pagination
      className="ui-pagination-round clients-records-pagination"
      label="Notes pagination"
      nextHref={clientDetailPageHref(client.id, queryParams, "notesPage", notesPage + 1)}
      page={notesPage}
      pageCount={notesPageCount}
      previousHref={clientDetailPageHref(client.id, queryParams, "notesPage", notesPage - 1)}
    />
  );
  const documentsPagination = (
    <Pagination
      className="ui-pagination-round clients-records-pagination"
      label="Documents pagination"
      nextHref={clientDetailPageHref(client.id, queryParams, "documentsPage", documentsPage + 1)}
      page={documentsPage}
      pageCount={documentsPageCount}
      previousHref={clientDetailPageHref(client.id, queryParams, "documentsPage", documentsPage - 1)}
    />
  );
  const mergeClientModal = (
    <div className="form-grid">
      <div className="subpanel">
        <span className="ui-badge ui-badge-success">Keeping</span>
        <h3 className="ui-title-tight">{client.name}</h3>
        <p className="ui-zero">{client.email}</p>
      </div>

      <form action={`/admin/clients/${client.id}`} className="clients-search-form">
        <input name="merge" type="hidden" value="1" />
        <input
          aria-label="Search client merge candidates"
          id="client-merge-search"
          name="mergeSearch"
          placeholder="Search all clients"
          defaultValue={mergeSearch}
        />
        <Button size="sm" type="submit" variant="secondary">
          <Search size={15} />
          Search
        </Button>
        {mergeSearch ? (
          <ButtonLink href={`/admin/clients/${client.id}?merge=1`} size="sm" variant="ghost">
            Clear
          </ButtonLink>
        ) : null}
      </form>

      <form action={mergeClientsAction} className="form-grid">
        <input name="survivorId" type="hidden" value={client.id} />
        <div className="ui-field">
          <label>Duplicate to merge into this client</label>
          <div className="stack">
            {mergeCandidates.map((candidate) => (
              <label className="subpanel ui-check-row" key={candidate.id}>
                <input
                  aria-label={`Merge ${candidate.name} into ${client.name}`}
                  name="duplicateId"
                  required
                  type="radio"
                  value={candidate.id}
                />
                <span className="ui-stack ui-gap-2 ui-min-0">
                  <span className="ui-inline-actions">
                    <strong>{candidate.name}</strong>
                    <span className={candidate.matchLabel === "Exact name match" ? "ui-badge ui-badge-success" : "ui-badge"}>
                      {candidate.matchLabel}
                    </span>
                  </span>
                  <span className="muted-text">
                    {candidate.email}
                    {candidate.phone ? ` | ${candidate.phone}` : ""}
                  </span>
                  <span className="muted-text">
                    {candidateContext(candidate)} | Updated {formatDateTime(candidate.updatedAt, settings.timezone)}
                  </span>
                  <span className="ui-inline-actions">
                    <span className="ui-badge">{candidate._count.bookings} appts</span>
                    <span className="ui-badge">{candidate._count.orders} orders</span>
                    <span className="ui-badge">{candidate._count.billingDocuments} docs</span>
                    <span className="ui-badge">
                      {candidate._count.formSubmissions} forms, {candidate._count.notes} notes
                    </span>
                  </span>
                </span>
              </label>
            ))}
            {!mergeCandidates.length ? (
              <div className="empty-state">
                {mergeSearch ? "No clients matched that search." : "No exact name matches. Search all clients for another record."}
              </div>
            ) : null}
          </div>
        </div>
        <Switch label="Confirm duplicate merge" name="confirmMerge" variant="inline" />
        <div className="module-modal-actions">
          <Button disabled={!mergeCandidates.length} type="submit" variant="secondary">
            <GitMerge size={16} />
            Merge records
          </Button>
        </div>
      </form>
    </div>
  );

  return (
    <div className="stack">
      <header className="page-header">
        <div>
          <h1>Client Details</h1>
        </div>
        <div className="module-card-header-actions">
          <ButtonLink href="/admin/modules/clients" variant="secondary">
            Back to clients
          </ButtonLink>
          <ModuleActionModals
            className="clients-detail-overflow-actions"
            initialActiveId={openMergeModal ? "merge" : undefined}
            items={[
              {
                content: mergeClientModal,
                icon: "more",
                id: "merge",
                label: "More",
                title: "Client actions",
                variant: "ghost"
              }
            ]}
            toolbarLabel="Client actions"
          />
        </div>
      </header>

      {savedMessage ? <div className="success-message">{savedMessage}</div> : null}
      {error ? <div className="error">{error}</div> : null}

      <section className="clients-detail-card-grid">
        <ClientProfileCard
          affiliation={clientAffiliation}
          details={profileDetails}
          editForm={profileForm}
          email={client.email}
          name={client.name}
          phone={client.phone || ""}
          photoUrl={client.photoUrl}
          pipeline={enumLabel(client.pipelineStage)}
          status={clientStatusLabel(client.status)}
        />
        <Card
          as="section"
          className="clients-detail-grid-card clients-detail-activity-card"
          minHeight="none"
          bodyClassName="clients-activity-card-body">
          <div className="clients-activity-header">
            <div>
              <h2 className="section-title">Client activity</h2>
              <p className="ui-zero">Current and recent appointments.</p>
            </div>
          </div>
          <div className="clients-recent-appointments">
            <div className="clients-activity-subhead">
              <h3>Appointments</h3>
              <span>{client.bookings.length} total</span>
            </div>
            {activityAppointments.length ? (
              <ul className="clients-activity-list">
                {activityAppointments.map((booking) => {
                  const isCurrent = booking.id === currentAppointment?.id;

                  return (
                    <li className={isCurrent ? "clients-activity-row is-current" : "clients-activity-row"} key={booking.id}>
                      <Link href={`/admin/appointments/${booking.id}`}>
                        <span className="clients-activity-date">
                          <strong>{formatAppointmentActivityDate(booking.startsAt, now, settings.timezone)}</strong>
                          {isCurrent ? <small>Current appointment</small> : null}
                        </span>
                        <span>
                          <strong>{booking.service.name}</strong>
                        </span>
                        {isCurrent ? (
                          <span className="ui-badge clients-activity-current-badge">Current</span>
                        ) : (
                          <span className="ui-badge">{enumLabel(booking.status)}</span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="ui-zero muted-text">No appointments yet.</p>
            )}
          </div>
        </Card>
        <ClientNotesDocumentsCard
          documentCount={client.files.length}
          documentForm={documentForm}
          documentsPagination={documentsPagination}
          documentsTable={documentsTable}
          initialActiveTab={initialRecordsTab}
          key={`client-records-${initialRecordsTab}`}
          noteForm={noteForm}
          noteCount={client.notes.length}
          notesPagination={notesPagination}
          notesTable={notesTable}
        />

      </section>

      <Card as="section" bodyClassName="ui-stack">
        <div className="page-header compact-header">
          <div>
            <h2 className="section-title">Communication</h2>
            <p className="ui-zero">Emails, texts, and phone calls matched to this client.</p>
          </div>
        </div>
        <Table>
          <thead>
            <tr>
              <th>Type</th>
              <th>Contact</th>
              <th>Summary</th>
              <th>Related</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {clientCommunicationRows.map((row) => {
              const relatedHref = relatedRecordHref(row.relatedType, row.relatedId);
              const relatedLabel = relatedRecordLabel(row.relatedType, row.relatedId);

              return (
                <tr key={row.id}>
                  <td>
                    <span className="ui-badge">{row.typeLabel}</span>
                  </td>
                  <td>
                    {row.contact ? <strong>{row.contact}</strong> : <span className="muted-text">No contact recorded</span>}
                  </td>
                  <td>
                    <strong>{row.title}</strong>
                    {row.detail && row.detail !== row.title ? (
                      <>
                        <br />
                        <span className="muted-text">{truncate(row.detail, 96)}</span>
                      </>
                    ) : null}
                  </td>
                  <td>{relatedHref ? <Link href={relatedHref}>{relatedLabel}</Link> : relatedLabel}</td>
                  <td>{formatDateTime(row.occurredAt, settings.timezone)}</td>
                </tr>
              );
            })}
            {!clientCommunicationRows.length ? (
              <tr>
                <td colSpan={5}>No communication records for this client yet.</td>
              </tr>
            ) : null}
          </tbody>
        </Table>
      </Card>

    </div>);

}
