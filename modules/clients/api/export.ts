import { NextResponse } from "next/server";
import { recordAuditLog } from "@/lib/audit";
import { getAccessibleClientWhere, requireAdmin } from "@/lib/auth";
import { csvDocument } from "@/lib/api/csv";
import { formatMoney, stringArrayCsv } from "@/lib/format";
import { isRecord } from "@/lib/objects";
import { prisma } from "@/lib/prisma";
import { getSiteSettings } from "@/lib/site";

function preferencesNotes(value: unknown) {
  return isRecord(value) && typeof value.notes === "string" ? value.notes : "";
}

function isoDate(value: Date | null | undefined) {
  return value ? value.toISOString() : "";
}

export async function GET(request: Request) {
  const user = await requireAdmin("clients:export");
  const settings = await getSiteSettings();
  const clientWhere = await getAccessibleClientWhere(user, settings.siteId);
  const clients = await prisma.client.findMany({
    where: clientWhere,
    include: {
      tags: { orderBy: { label: "asc" } },
      files: { orderBy: { uploadedAt: "desc" } },
      notes: { orderBy: { createdAt: "desc" } },
      bookings: { orderBy: { startsAt: "desc" } },
      formSubmissions: { orderBy: { createdAt: "desc" } },
      orders: { orderBy: { createdAt: "desc" } },
      billingDocuments: { orderBy: { updatedAt: "desc" } },
      messageLogs: { orderBy: { createdAt: "desc" } },
      testimonials: { orderBy: { createdAt: "desc" } }
    },
    orderBy: { updatedAt: "desc" }
  });
  const clientIds = clients.map((client) => client.id);
  const [galleryAccesses, galleryFavorites, proofComments, proofApprovals, proofDecisions] = await Promise.all([
    prisma.portfolioGalleryAccess.groupBy({
      by: ["clientId"],
      where: { siteId: settings.siteId, clientId: { in: clientIds } },
      _count: { _all: true }
    }),
    prisma.portfolioGalleryFavorite.groupBy({
      by: ["clientId"],
      where: { clientId: { in: clientIds } },
      _count: { _all: true }
    }),
    prisma.portfolioProofComment.groupBy({
      by: ["clientId"],
      where: { siteId: settings.siteId, clientId: { in: clientIds } },
      _count: { _all: true }
    }),
    prisma.portfolioProofApproval.groupBy({
      by: ["clientId"],
      where: { siteId: settings.siteId, clientId: { in: clientIds } },
      _count: { _all: true }
    }),
    prisma.portfolioProofItemDecision.groupBy({
      by: ["clientId"],
      where: { siteId: settings.siteId, clientId: { in: clientIds } },
      _count: { _all: true }
    })
  ]);
  const countByClient = (items: Array<{ clientId: string | null; _count: { _all: number } }>) =>
    new Map(items.filter((item) => item.clientId).map((item) => [item.clientId as string, item._count._all]));
  const accessCounts = countByClient(galleryAccesses);
  const favoriteCounts = countByClient(galleryFavorites);
  const commentCounts = countByClient(proofComments);
  const approvalCounts = countByClient(proofApprovals);
  const decisionCounts = countByClient(proofDecisions);

  const header = [
    "ID",
    "Name",
    "Email",
    "Phone",
    "Status",
    "Pipeline Stage",
    "Company",
    "Family/Household",
    "Alternate Emails",
    "Alternate Phones",
    "Address 1",
    "Address 2",
    "City",
    "Region",
    "Postal Code",
    "Country",
    "Timezone",
    "Pronouns",
    "Birthday",
    "Anniversary",
    "Tags",
    "Preferences",
    "Email Opt In",
    "SMS Opt In",
    "Photo Usage Release",
    "Data Export Requested At",
    "Data Deletion Requested At",
    "Private Notes",
    "Bookings",
    "Orders",
    "Order Total",
    "Billing Documents",
    "Forms",
    "Emails",
    "Testimonials",
    "Gallery Accesses",
    "Gallery Favorites",
    "Proof Comments",
    "Proof Approvals",
    "Proof Decisions",
    "Notes",
    "Files",
    "Created At",
    "Updated At"
  ];

  const rows = clients.map((client) => [
    client.id,
    client.name,
    client.email,
    client.phone || "",
    client.status,
    client.pipelineStage,
    client.companyName,
    client.familyName,
    stringArrayCsv(client.alternateEmails),
    stringArrayCsv(client.alternatePhones),
    client.addressLine1,
    client.addressLine2,
    client.city,
    client.region,
    client.postalCode,
    client.country,
    client.timezone,
    client.pronouns,
    isoDate(client.birthday),
    isoDate(client.anniversary),
    client.tags.map((tag) => tag.label).join(", "),
    preferencesNotes(client.preferences),
    client.emailOptIn ? "yes" : "no",
    client.smsOptIn ? "yes" : "no",
    client.photoUsageRelease ? "yes" : "no",
    isoDate(client.dataExportRequestedAt),
    isoDate(client.dataDeletionRequestedAt),
    client.privateNotes || "",
    client.bookings.length,
    client.orders.length,
    formatMoney(
      client.orders.reduce((total, order) => total + order.totalCents, 0),
      client.orders[0]?.currency || "USD"
    ),
    client.billingDocuments.length,
    client.formSubmissions.length,
    client.messageLogs.length,
    client.testimonials.length,
    accessCounts.get(client.id) || 0,
    favoriteCounts.get(client.id) || 0,
    commentCounts.get(client.id) || 0,
    approvalCounts.get(client.id) || 0,
    decisionCounts.get(client.id) || 0,
    client.notes.length,
    client.files.length,
    client.createdAt.toISOString(),
    client.updatedAt.toISOString()
  ]);
  const csv = csvDocument([header, ...rows], { preventFormulaInjection: true });
  await recordAuditLog({
    action: "client.exported",
    actor: user,
    metadata: {
      after: {
        clientIds: clientIds.slice(0, 100),
        truncatedClientIds: clientIds.length > 100
      },
      before: null,
      rowCount: clients.length
    },
    request,
    siteId: settings.siteId,
    targetId: settings.siteId,
    targetLabel: `${clients.length} clients exported`,
    targetType: "client_export"
  });

  return new NextResponse(csv, {
    headers: {
      "Content-Disposition": `attachment; filename="clients-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Content-Type": "text/csv; charset=utf-8"
    }
  });
}
