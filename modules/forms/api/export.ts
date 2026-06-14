import { NextResponse } from "next/server";
import { recordAuditLog } from "@/lib/audit";
import { getAccessibleFormSubmissionWhere, requireAdmin } from "@/lib/auth";
import { recordFromUnknown } from "@/lib/objects";
import { prisma } from "@/lib/prisma";
import { csvDocument } from "@/lib/api/csv";
import { getSiteSettings } from "@/lib/site";

function dataValue(data: unknown, fieldId: string) {
  const record = recordFromUnknown(data);
  const entry = record[fieldId];

  if (entry && typeof entry === "object" && !Array.isArray(entry) && "value" in entry) {
    return entry.value === null || entry.value === undefined ? "" : String(entry.value);
  }

  return entry === null || entry === undefined ? "" : String(entry);
}

function fieldLabel(data: unknown, fieldId: string) {
  const record = recordFromUnknown(data);
  const entry = record[fieldId];

  if (entry && typeof entry === "object" && !Array.isArray(entry) && "label" in entry) {
    return String(entry.label || fieldId);
  }

  return fieldId;
}

export async function GET(request: Request) {
  const user = await requireAdmin("forms:export");
  const settings = await getSiteSettings();

  const { searchParams } = new URL(request.url);
  const formId = searchParams.get("formId") || "";

  if (!formId) {
    return NextResponse.json({ error: "Missing formId." }, { status: 400 });
  }

  const submissionWhere = await getAccessibleFormSubmissionWhere(user, settings.siteId);
  const form = await prisma.form.findFirst({
    where: { id: formId, siteId: settings.siteId },
    include: {
      fields: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
      submissions: {
        where: submissionWhere,
        include: { client: true },
        orderBy: { createdAt: "desc" }
      }
    }
  });

  if (!form) {
    return NextResponse.json({ error: "Form not found." }, { status: 404 });
  }

  const fieldColumns = new Map<string, string>();
  for (const field of form.fields) {
    fieldColumns.set(field.id, field.label);
  }

  for (const submission of form.submissions) {
    const data = recordFromUnknown(submission.data);
    for (const fieldId of Object.keys(data)) {
      if (!fieldColumns.has(fieldId)) {
        fieldColumns.set(fieldId, fieldLabel(data, fieldId));
      }
    }
  }

  const fieldEntries = Array.from(fieldColumns.entries());
  const header = [
    "Submitted At",
    "Submitter Name",
    "Submitter Email",
    "Client Name",
    "Client Email",
    "Destination",
    ...fieldEntries.map(([, label]) => label)
  ];
  const rows = form.submissions.map((submission) => [
    submission.createdAt.toISOString(),
    submission.submitterName,
    submission.submitterEmail,
    submission.client?.name || "",
    submission.client?.email || "",
    form.destination,
    ...fieldEntries.map(([fieldId]) => dataValue(submission.data, fieldId))
  ]);
  const csv = csvDocument([header, ...rows], { preventFormulaInjection: true });
  const filename = `${form.slug || "form"}-submissions.csv`;
  await recordAuditLog({
    action: "forms.exported",
    actor: user,
    metadata: {
      formId: form.id,
      formSlug: form.slug,
      rowCount: form.submissions.length
    },
    request,
    siteId: settings.siteId,
    targetId: form.id,
    targetLabel: form.name,
    targetType: "form_export"
  });

  return new NextResponse(csv, {
    headers: {
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Type": "text/csv; charset=utf-8"
    }
  });
}
