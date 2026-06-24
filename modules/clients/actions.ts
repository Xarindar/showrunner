"use server";

import { ClientPipelineStage, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { recordAuditLog } from "@/lib/audit";
import { getAccessibleClientWhere, requireAdmin } from "@/lib/auth";
import { normalizeClientStatus, parseClientStatus } from "@/lib/clients/status";
import {
  clientFileFormSchema,
  clientFileDeleteFormSchema,
  clientCsvImportFormSchema,
  clientFormSchema,
  clientMergeFormSchema,
  clientNoteDeleteFormSchema,
  clientNoteFormSchema,
  clientSegmentDeleteFormSchema,
  clientSegmentFormSchema,
  clientUpdateFormSchema,
  parseForm
} from "@/lib/admin-validation";
import { prisma } from "@/lib/prisma";
import { getCurrentSiteId } from "@/lib/site";
import { slugify } from "@/lib/slug";

function preferencesJson(notes: string) {
  return notes ? { notes } : {};
}

function policyHistory(input: { policyAccepted?: "on" }) {
  return input.policyAccepted === "on" ? [{ acceptedAt: new Date().toISOString(), source: "admin" }] : [];
}

function appendPolicyHistory(existing: Prisma.JsonValue, entries: Prisma.InputJsonValue[]) {
  const current = Array.isArray(existing) ? existing : [];
  return [...current, ...entries] as Prisma.InputJsonArray;
}

function clientData(input: Awaited<ReturnType<typeof clientFormSchema.parseAsync>>) {
  const now = new Date();

  return {
    name: input.name,
    email: input.email,
    phone: input.phone,
    status: input.status,
    pipelineStage: input.pipelineStage,
    companyName: input.companyName,
    familyName: input.familyName,
    alternateEmails: input.alternateEmails,
    alternatePhones: input.alternatePhones,
    addressLine1: input.addressLine1,
    addressLine2: input.addressLine2,
    city: input.city,
    region: input.region,
    postalCode: input.postalCode,
    country: input.country,
    timezone: input.timezone,
    pronouns: input.pronouns,
    birthday: input.birthday,
    anniversary: input.anniversary,
    preferences: preferencesJson(input.preferences),
    emailOptIn: input.emailOptIn === "on",
    smsOptIn: input.smsOptIn === "on",
    photoUsageRelease: input.photoUsageRelease === "on",
    dataExportRequestedAt: input.dataExportRequested === "on" ? now : undefined,
    dataDeletionRequestedAt: input.dataDeletionRequested === "on" ? now : undefined,
    privateNotes: input.privateNotes
  };
}

function compactCriteria(input: Record<string, unknown>): Prisma.InputJsonObject {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined && value !== "" && value !== false)
  ) as Prisma.InputJsonObject;
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let cell = "";
  let row: string[] = [];
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (quoted && char === '"' && next === '"') {
      cell += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      quoted = !quoted;
      continue;
    }

    if (!quoted && char === ",") {
      row.push(cell);
      cell = "";
      continue;
    }

    if (!quoted && (char === "\n" || char === "\r")) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

function normalizeHeader(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function rowValue(row: Record<string, string>, aliases: string[]) {
  for (const alias of aliases) {
    const value = row[normalizeHeader(alias)];
    if (value !== undefined) return value.trim();
  }
  return "";
}

function parseBoolean(value: string) {
  return ["1", "true", "yes", "y", "on"].includes(value.trim().toLowerCase());
}

function parseDate(value: string) {
  if (!value) return undefined;
  const date = new Date(value.includes("T") ? value : `${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function parsePipelineStage(value: string) {
  const normalized = value.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  return Object.values(ClientPipelineStage).includes(normalized as ClientPipelineStage)
    ? (normalized as ClientPipelineStage)
    : ClientPipelineStage.INQUIRY;
}

function isImportEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function csvListValue(value: string) {
  return value
    .split(/[;,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function mergeStringArray(first: unknown, second: unknown) {
const values = [...(Array.isArray(first) ? first : []), ...(Array.isArray(second) ? second : [])]
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);

  return [...new Set(values)];
}

function mergeEmailAliases(survivorEmail: string, survivorAlternate: unknown, duplicateEmail: string, duplicateAlternate: unknown) {
  const survivorPrimary = survivorEmail.toLowerCase();
  const aliases = mergeStringArray(survivorAlternate, [duplicateEmail, ...(Array.isArray(duplicateAlternate) ? duplicateAlternate : [])])
    .map((email) => email.toLowerCase())
    .filter((email) => email !== survivorPrimary);
  return [...new Set(aliases)];
}

function mergeJsonArray(first: Prisma.JsonValue, second: Prisma.JsonValue) {
  return [...(Array.isArray(first) ? first : []), ...(Array.isArray(second) ? second : [])] as Prisma.InputJsonArray;
}

function mergePreferences(first: Prisma.JsonValue, second: Prisma.JsonValue) {
  const firstRecord = first && typeof first === "object" && !Array.isArray(first) ? first : {};
  const secondRecord = second && typeof second === "object" && !Array.isArray(second) ? second : {};

  return { ...secondRecord, ...firstRecord } as Prisma.InputJsonObject;
}

function fillBlank(current: string | null | undefined, fallback: string | null | undefined) {
  return current?.trim() ? current : fallback || "";
}

const auditSnapshotLimit = 100;

function clientAuditSnapshot(client: {
  alternateEmails?: unknown;
  email: string;
  familyName?: string | null;
  id: string;
  name: string;
  pipelineStage: ClientPipelineStage;
  status: string;
  tags?: Array<{ label: string }>;
}) {
  return {
    alternateEmails: mergeStringArray(client.alternateEmails, []),
    email: client.email,
    familyName: client.familyName || "",
    id: client.id,
    name: client.name,
    pipelineStage: client.pipelineStage,
    status: client.status,
    tags: client.tags?.map((tag) => tag.label).sort() || []
  };
}

async function syncClientTags(clientId: string, labels: string[], siteId: string) {
  const normalized = [...new Set(labels.map((label) => label.trim().toLowerCase()).filter(Boolean))];
  const existing = await prisma.clientTag.findMany({
    where: { clientId, siteId, source: "admin" },
    select: { id: true, label: true }
  });
  const existingLabels = new Set(existing.map((tag) => tag.label.toLowerCase()));
  const nextLabels = new Set(normalized);

  await prisma.$transaction([
    prisma.clientTag.deleteMany({
      where: {
        clientId,
        siteId,
        source: "admin",
        label: { in: existing.filter((tag) => !nextLabels.has(tag.label.toLowerCase())).map((tag) => tag.label) }
      }
    }),
    ...normalized
      .filter((label) => !existingLabels.has(label))
      .map((label) =>
        prisma.clientTag.create({
          data: {
            siteId,
            clientId,
            label,
            source: "admin"
          }
        })
      )
  ]);
}

async function uniqueSegmentKey(name: string, siteId: string) {
  const base = slugify(name) || "segment";
  let candidate = base;
  let suffix = 2;

  while (
    await prisma.clientSegment.findFirst({
      where: { siteId, key: candidate },
      select: { id: true }
    })
  ) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}

export async function createClientAction(formData: FormData) {
  await requireAdmin("clients:manage");
  const input = await parseForm(clientFormSchema, formData);
  const siteId = await getCurrentSiteId();
  const existing = await prisma.client.findUnique({
    where: { siteId_email: { siteId, email: input.email } },
    select: { id: true }
  });

  if (existing) {
    redirect(`/admin/modules/clients?error=${encodeURIComponent("A client with that email already exists.")}`);
  }

  const client = await prisma.client.create({
    data: {
      siteId,
      ...clientData(input),
      policyAcceptanceHistory: policyHistory(input)
    }
  });

  await syncClientTags(client.id, input.tags, siteId);
  revalidatePath("/admin/modules/clients");
  redirect(`/admin/clients/${client.id}`);
}

export async function updateClientAction(formData: FormData) {
  const user = await requireAdmin("clients:manage");
  const input = await parseForm(clientUpdateFormSchema, formData);
  const siteId = await getCurrentSiteId();
  const accessibleWhere = await getAccessibleClientWhere(user, siteId, { id: input.id });
  const existing = await prisma.client.findFirst({
    where: accessibleWhere,
    select: { id: true, policyAcceptanceHistory: true }
  });

  if (!existing) {
    redirect("/admin/modules/clients?error=Client%20not%20found.");
  }

  const acceptedPolicy = policyHistory(input);

  await prisma.client.updateMany({
    where: accessibleWhere,
    data: {
      ...clientData(input),
      policyAcceptanceHistory: acceptedPolicy.length ? appendPolicyHistory(existing.policyAcceptanceHistory, acceptedPolicy) : undefined
    }
  });

  await syncClientTags(input.id, input.tags, siteId);
  revalidatePath("/admin/modules/clients");
  revalidatePath(`/admin/clients/${input.id}`);
  redirect(`/admin/clients/${input.id}?saved=client`);
}

export async function reissueClientPortalLinkAction(formData: FormData) {
  const user = await requireAdmin("clients:manage");
  const clientId = String(formData.get("clientId") || "").trim();
  const siteId = await getCurrentSiteId();

  if (!clientId) {
    redirect("/admin/modules/clients?error=Client%20not%20found.");
  }

  const accessibleWhere = await getAccessibleClientWhere(user, siteId, { id: clientId });
  const client = await prisma.client.findFirst({
    where: accessibleWhere,
    select: { email: true, id: true, name: true, portalAccessVersion: true }
  });

  if (!client) {
    redirect("/admin/modules/clients?error=Client%20not%20found.");
  }

  const updated = await prisma.client.update({
    where: { id: client.id },
    data: { portalAccessVersion: { increment: 1 } },
    select: { portalAccessVersion: true }
  });

  await recordAuditLog({
    action: "client.portal_link_reissued",
    actor: user,
    metadata: {
      after: { portalAccessVersion: updated.portalAccessVersion },
      before: { portalAccessVersion: client.portalAccessVersion },
      email: client.email
    },
    siteId,
    targetId: client.id,
    targetLabel: client.name,
    targetType: "client"
  });

  revalidatePath("/admin/modules/clients");
  revalidatePath(`/admin/clients/${client.id}`);
  redirect("/admin/modules/clients?saved=portal-link-reissued");
}

export async function addClientNoteAction(formData: FormData) {
  const user = await requireAdmin("clients:manage");
  const input = await parseForm(clientNoteFormSchema, formData);
  const siteId = await getCurrentSiteId();
  const client = await prisma.client.findFirst({
    where: await getAccessibleClientWhere(user, siteId, { id: input.clientId }),
    select: { id: true }
  });

  if (!client) {
    redirect("/admin/modules/clients?error=Client%20not%20found.");
  }

  await prisma.clientNote.create({
    data: {
      clientId: input.clientId,
      content: input.content
    }
  });

  revalidatePath(`/admin/clients/${input.clientId}`);
  redirect(`/admin/clients/${input.clientId}?saved=note`);
}

export async function deleteClientNoteAction(formData: FormData) {
  const user = await requireAdmin("clients:manage");
  const input = await parseForm(clientNoteDeleteFormSchema, formData);
  const siteId = await getCurrentSiteId();

  if (input.confirmDelete !== "on") {
    redirect(`/admin/clients/${input.clientId}?error=${encodeURIComponent("Confirm note delete before removing it.")}`);
  }

  const client = await prisma.client.findFirst({
    where: await getAccessibleClientWhere(user, siteId, { id: input.clientId }),
    select: { id: true }
  });

  if (!client) {
    redirect("/admin/modules/clients?error=Client%20not%20found.");
  }

  const note = await prisma.clientNote.findFirst({
    where: {
      id: input.id,
      clientId: input.clientId,
      client: { siteId }
    },
    select: {
      id: true,
      content: true
    }
  });

  await prisma.clientNote.deleteMany({
    where: {
      id: input.id,
      clientId: input.clientId,
      client: { siteId }
    }
  });
  await recordAuditLog({
    action: "client_note.deleted",
    actor: user,
    metadata: { clientId: input.clientId },
    siteId,
    targetId: input.id,
    targetLabel: note?.content.slice(0, 80) || "",
    targetType: "client_note"
  });

  revalidatePath(`/admin/clients/${input.clientId}`);
  redirect(`/admin/clients/${input.clientId}?saved=note-deleted`);
}

export async function addClientFileAction(formData: FormData) {
  const user = await requireAdmin("clients:manage");
  const input = await parseForm(clientFileFormSchema, formData);
  const siteId = await getCurrentSiteId();
  const client = await prisma.client.findFirst({
    where: await getAccessibleClientWhere(user, siteId, { id: input.clientId }),
    select: { id: true }
  });

  if (!client) {
    redirect("/admin/modules/clients?error=Client%20not%20found.");
  }

  await prisma.clientFile.create({
    data: {
      siteId,
      clientId: input.clientId,
      title: input.title,
      url: input.url,
      category: input.category,
      notes: input.notes
    }
  });

  revalidatePath(`/admin/clients/${input.clientId}`);
  redirect(`/admin/clients/${input.clientId}?saved=file`);
}

export async function deleteClientFileAction(formData: FormData) {
  const user = await requireAdmin("clients:manage");
  const input = await parseForm(clientFileDeleteFormSchema, formData);
  const siteId = await getCurrentSiteId();

  if (input.confirmDelete !== "on") {
    redirect(`/admin/clients/${input.clientId}?error=${encodeURIComponent("Confirm file delete before removing it.")}`);
  }

  const client = await prisma.client.findFirst({
    where: await getAccessibleClientWhere(user, siteId, { id: input.clientId }),
    select: { id: true }
  });

  if (!client) {
    redirect("/admin/modules/clients?error=Client%20not%20found.");
  }

  const file = await prisma.clientFile.findFirst({
    where: {
      id: input.id,
      clientId: input.clientId,
      siteId
    },
    select: {
      id: true,
      title: true,
      url: true
    }
  });

  await prisma.clientFile.deleteMany({
    where: {
      id: input.id,
      clientId: input.clientId,
      siteId
    }
  });
  await recordAuditLog({
    action: "client_file.deleted",
    actor: user,
    metadata: { clientId: input.clientId, url: file?.url || "" },
    siteId,
    targetId: input.id,
    targetLabel: file?.title || "",
    targetType: "client_file"
  });

  revalidatePath(`/admin/clients/${input.clientId}`);
  redirect(`/admin/clients/${input.clientId}?saved=file-deleted`);
}

export async function createClientSegmentAction(formData: FormData) {
  await requireAdmin("clients:manage");
  const input = await parseForm(clientSegmentFormSchema, formData);
  const siteId = await getCurrentSiteId();
  const criteria = compactCriteria({
    status: normalizeClientStatus(input.status) || undefined,
    pipelineStage: input.pipelineStage || undefined,
    tag: input.tag || undefined,
    pastDue: input.pastDue === "on" || undefined,
    upcomingAppointment: input.upcomingAppointment === "on" || undefined,
    recentPurchaseDays: input.recentPurchaseDays,
    noRecentActivityDays: input.noRecentActivityDays
  });
  const key = await uniqueSegmentKey(input.name, siteId);

  try {
    await prisma.clientSegment.create({
      data: {
        siteId,
        name: input.name,
        key,
        criteria
      }
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      redirect(`/admin/modules/clients?error=${encodeURIComponent("A segment with that name already exists. Choose a different name.")}`);
    }
    throw error;
  }

  revalidatePath("/admin/modules/clients");
  redirect(`/admin/modules/clients?segment=${key}`);
}

export async function deleteClientSegmentAction(formData: FormData) {
  const user = await requireAdmin("clients:manage");
  const input = await parseForm(clientSegmentDeleteFormSchema, formData);
  const siteId = await getCurrentSiteId();

  if (input.confirmDelete !== "on") {
    redirect("/admin/modules/clients?error=Confirm%20segment%20delete%20before%20removing%20it.");
  }

  const segment = await prisma.clientSegment.findFirst({
    where: { id: input.id, siteId },
    select: { id: true, key: true, name: true }
  });

  await prisma.clientSegment.deleteMany({
    where: { id: input.id, siteId }
  });
  await recordAuditLog({
    action: "client_segment.deleted",
    actor: user,
    metadata: { segmentKey: segment?.key || "" },
    siteId,
    targetId: input.id,
    targetLabel: segment?.name || "",
    targetType: "client_segment"
  });

  revalidatePath("/admin/modules/clients");
  redirect("/admin/modules/clients?saved=segment-deleted");
}

export async function importClientsCsvAction(formData: FormData) {
  const user = await requireAdmin("clients:manage");
  const input = await parseForm(clientCsvImportFormSchema, formData, "/admin/modules/clients");
  const siteId = await getCurrentSiteId();
  const text = await input.file.text();
  const rows = parseCsv(text);

  if (rows.length < 2) {
    redirect(`/admin/modules/clients?error=${encodeURIComponent("CSV import needs a header row and at least one client row.")}`);
  }

  const headers = rows[0].map(normalizeHeader);
  let imported = 0;
  let skipped = 0;
  const importedClients: ReturnType<typeof clientAuditSnapshot>[] = [];

  for (const values of rows.slice(1)) {
    const row = Object.fromEntries(headers.map((header, index) => [header, values[index] || ""]));
    const name = rowValue(row, ["name", "full name", "client name"]);
    const email = rowValue(row, ["email", "email address", "primary email"]).toLowerCase();

    if (!name || !isImportEmail(email)) {
      skipped += 1;
      continue;
    }

    const existing = await prisma.client.findUnique({
      where: { siteId_email: { siteId, email } },
      select: { id: true }
    });

    if (existing) {
      skipped += 1;
      continue;
    }

    const client = await prisma.client.create({
      data: {
        siteId,
        name,
        email,
        phone: rowValue(row, ["phone", "primary phone", "mobile"]),
        status: parseClientStatus(rowValue(row, ["status"])),
        pipelineStage: parsePipelineStage(rowValue(row, ["pipeline", "pipeline stage", "stage"])),
        companyName: rowValue(row, ["company", "company name", "organization"]),
        familyName: rowValue(row, ["family", "family name", "household"]),
        alternateEmails: csvListValue(rowValue(row, ["alternate emails", "other emails"])).map((value) => value.toLowerCase()),
        alternatePhones: csvListValue(rowValue(row, ["alternate phones", "other phones"])),
        addressLine1: rowValue(row, ["address 1", "address", "street"]),
        addressLine2: rowValue(row, ["address 2", "suite"]),
        city: rowValue(row, ["city"]),
        region: rowValue(row, ["state", "region", "province"]),
        postalCode: rowValue(row, ["postal code", "zip", "zip code"]),
        country: rowValue(row, ["country"]),
        timezone: rowValue(row, ["timezone", "time zone"]),
        pronouns: rowValue(row, ["pronouns"]),
        birthday: parseDate(rowValue(row, ["birthday", "birthdate"])),
        anniversary: parseDate(rowValue(row, ["anniversary"])),
        preferences: preferencesJson(rowValue(row, ["preferences", "preference notes"])),
        emailOptIn: parseBoolean(rowValue(row, ["email opt in", "email consent"])),
        smsOptIn: parseBoolean(rowValue(row, ["sms opt in", "sms consent"])),
        photoUsageRelease: parseBoolean(rowValue(row, ["photo usage release", "photo release"])),
        policyAcceptanceHistory: policyHistory({
          policyAccepted: parseBoolean(rowValue(row, ["policy accepted", "policy consent", "terms accepted"])) ? "on" : undefined
        }),
        privateNotes: rowValue(row, ["private notes", "notes"])
      }
    });

    const tags = csvListValue(rowValue(row, ["tags", "tag"]));
    await syncClientTags(client.id, tags, siteId);
    importedClients.push(clientAuditSnapshot({ ...client, tags: tags.map((label) => ({ label })) }));
    imported += 1;
  }

  await recordAuditLog({
    action: "client.imported",
    actor: user,
    metadata: {
      after: {
        clients: importedClients.slice(0, auditSnapshotLimit),
        truncatedClients: importedClients.length > auditSnapshotLimit
      },
      before: null,
      fileName: input.file.name,
      fileSize: input.file.size,
      headerCount: headers.length,
      importedCount: imported,
      rowCount: rows.length - 1,
      skippedCount: skipped
    },
    siteId,
    targetId: siteId,
    targetLabel: `${imported} clients imported`,
    targetType: "client_import"
  });

  revalidatePath("/admin/modules/clients");
  redirect(`/admin/modules/clients?saved=imported&imported=${imported}&skipped=${skipped}`);
}

export async function mergeClientsAction(formData: FormData) {
  const user = await requireAdmin("clients:manage");
  const input = await parseForm(clientMergeFormSchema, formData, "/admin/modules/clients");
  const siteId = await getCurrentSiteId();

  if (input.confirmMerge !== "on") {
    redirect(`/admin/clients/${input.survivorId}?error=${encodeURIComponent("Confirm merge before moving duplicate client data.")}`);
  }

  if (input.survivorId === input.duplicateId) {
    redirect(`/admin/clients/${input.survivorId}?error=${encodeURIComponent("Choose two different client records to merge.")}`);
  }

  const [survivorWhere, duplicateWhere] = await Promise.all([
    getAccessibleClientWhere(user, siteId, { id: input.survivorId }),
    getAccessibleClientWhere(user, siteId, { id: input.duplicateId })
  ]);
  const [survivor, duplicate] = await Promise.all([
    prisma.client.findFirst({
      where: survivorWhere,
      include: { tags: true }
    }),
    prisma.client.findFirst({
      where: duplicateWhere,
      include: { tags: true }
    })
  ]);

  if (!survivor || !duplicate) {
    redirect(`/admin/modules/clients?error=${encodeURIComponent("Both clients must exist before merging.")}`);
  }

  const before = {
    duplicate: clientAuditSnapshot(duplicate),
    survivor: clientAuditSnapshot(survivor)
  };

  await prisma.$transaction(async (tx) => {
    const survivorLabels = new Set(survivor.tags.map((tag) => tag.label.toLowerCase()));
    for (const tag of duplicate.tags) {
      if (survivorLabels.has(tag.label.toLowerCase())) continue;
      await tx.clientTag.create({
        data: {
          siteId,
          clientId: survivor.id,
          label: tag.label,
          source: tag.source,
          relatedType: tag.relatedType,
          relatedId: tag.relatedId
        }
      });
    }

    await tx.client.update({
      where: { id: survivor.id },
      data: {
        phone: fillBlank(survivor.phone, duplicate.phone),
        companyName: fillBlank(survivor.companyName, duplicate.companyName),
        familyName: fillBlank(survivor.familyName, duplicate.familyName),
        alternateEmails: mergeEmailAliases(survivor.email, survivor.alternateEmails, duplicate.email, duplicate.alternateEmails),
        alternatePhones: mergeStringArray(survivor.alternatePhones, duplicate.alternatePhones),
        addressLine1: fillBlank(survivor.addressLine1, duplicate.addressLine1),
        addressLine2: fillBlank(survivor.addressLine2, duplicate.addressLine2),
        city: fillBlank(survivor.city, duplicate.city),
        region: fillBlank(survivor.region, duplicate.region),
        postalCode: fillBlank(survivor.postalCode, duplicate.postalCode),
        country: fillBlank(survivor.country, duplicate.country),
        timezone: fillBlank(survivor.timezone, duplicate.timezone),
        pronouns: fillBlank(survivor.pronouns, duplicate.pronouns),
        birthday: survivor.birthday || duplicate.birthday,
        anniversary: survivor.anniversary || duplicate.anniversary,
        preferences: mergePreferences(survivor.preferences, duplicate.preferences),
        emailOptIn: survivor.emailOptIn || duplicate.emailOptIn,
        smsOptIn: survivor.smsOptIn || duplicate.smsOptIn,
        photoUsageRelease: survivor.photoUsageRelease || duplicate.photoUsageRelease,
        policyAcceptanceHistory: mergeJsonArray(survivor.policyAcceptanceHistory, duplicate.policyAcceptanceHistory),
        dataExportRequestedAt: survivor.dataExportRequestedAt || duplicate.dataExportRequestedAt,
        dataDeletionRequestedAt: survivor.dataDeletionRequestedAt || duplicate.dataDeletionRequestedAt,
        privateNotes: [survivor.privateNotes, duplicate.privateNotes].filter(Boolean).join("\n\n")
      }
    });

    await tx.clientTag.deleteMany({ where: { clientId: duplicate.id } });
    await tx.clientNote.updateMany({ where: { clientId: duplicate.id }, data: { clientId: survivor.id } });
    await tx.clientFile.updateMany({ where: { clientId: duplicate.id }, data: { clientId: survivor.id } });
    await tx.booking.updateMany({ where: { clientId: duplicate.id }, data: { clientId: survivor.id } });
    await tx.cart.updateMany({ where: { clientId: duplicate.id }, data: { clientId: survivor.id } });
    await tx.order.updateMany({ where: { clientId: duplicate.id }, data: { clientId: survivor.id } });
    await tx.formSubmission.updateMany({ where: { clientId: duplicate.id }, data: { clientId: survivor.id } });
    await tx.testimonial.updateMany({ where: { clientId: duplicate.id }, data: { clientId: survivor.id } });
    await tx.billingDocument.updateMany({ where: { clientId: duplicate.id }, data: { clientId: survivor.id } });
    await tx.messageLog.updateMany({ where: { clientId: duplicate.id }, data: { clientId: survivor.id } });
    await tx.emailSubscriber.updateMany({ where: { clientId: duplicate.id }, data: { clientId: survivor.id } });
    await tx.portfolioGalleryAccess.updateMany({ where: { clientId: duplicate.id }, data: { clientId: survivor.id } });
    await tx.portfolioGalleryFavorite.updateMany({ where: { clientId: duplicate.id }, data: { clientId: survivor.id } });
    await tx.portfolioProofComment.updateMany({ where: { clientId: duplicate.id }, data: { clientId: survivor.id } });
    await tx.portfolioProofApproval.updateMany({ where: { clientId: duplicate.id }, data: { clientId: survivor.id } });
    await tx.portfolioProofItemDecision.updateMany({ where: { clientId: duplicate.id }, data: { clientId: survivor.id } });
    await tx.client.delete({ where: { id: duplicate.id } });
  });

  const mergedSurvivor = await prisma.client.findFirst({
    where: survivorWhere,
    include: { tags: true }
  });

  await recordAuditLog({
    action: "client.merged",
    actor: user,
    metadata: {
      after: mergedSurvivor ? clientAuditSnapshot(mergedSurvivor) : null,
      before,
      duplicateClientId: duplicate.id,
      survivorClientId: survivor.id
    },
    siteId,
    targetId: survivor.id,
    targetLabel: survivor.name,
    targetType: "client"
  });

  revalidatePath("/admin/modules/clients");
  revalidatePath(`/admin/clients/${survivor.id}`);
  redirect(`/admin/clients/${survivor.id}?saved=merged`);
}
