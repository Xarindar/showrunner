import { BillingDocumentStatus } from "@prisma/client";
import { notFound } from "next/navigation";
import { enumLabel, formatMoney } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { getSiteSettings } from "@/lib/site";

type BillingPdfRouteProps = {
  params: Promise<{ token: string }>;
};

function pdfSafe(value: string) {
  return value
    .replace(/[^\x20-\x7E]/g, "?")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function line(text: string, x: number, y: number, size = 11) {
  return `BT /F1 ${size} Tf ${x} ${y} Td (${pdfSafe(text)}) Tj ET\n`;
}

function buildPdf(lines: string[]) {
  const objects: string[] = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n",
    "4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n"
  ];
  const stream = lines.join("");
  objects.push(`5 0 obj\n<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}endstream\nendobj\n`);

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += object;
  }

  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (const offset of offsets.slice(1)) {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(pdf, "binary");
}

export async function GET(_request: Request, { params }: BillingPdfRouteProps) {
  const [{ token }, settings] = await Promise.all([params, getSiteSettings()]);
  if (!settings.enabledModuleIds.includes("billing")) notFound();

  const document = await prisma.billingDocument.findUnique({
    where: { siteId_publicAccessToken: { siteId: settings.siteId, publicAccessToken: token } },
    include: {
      lineItems: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
      payments: { orderBy: { createdAt: "asc" } }
    }
  });

  if (!document || document.status === BillingDocumentStatus.DRAFT) notFound();

  const paidCents = document.payments
    .filter((payment) => payment.status === "PAID" || payment.status === "AUTHORIZED")
    .reduce((sum, payment) => sum + payment.amountCents, 0);
  const remainingCents = Math.max(0, document.totalCents - paidCents);
  const content: string[] = [];
  let y = 744;

  content.push(line(settings.businessName, 48, y, 16));
  y -= 28;
  content.push(line(`${enumLabel(document.type)} ${document.documentNumber}`, 48, y, 18));
  y -= 24;
  content.push(line(`Status: ${enumLabel(document.status)}`, 48, y));
  y -= 18;
  content.push(line(`Prepared for: ${document.customerName} <${document.customerEmail}>`, 48, y));
  y -= 18;
  content.push(line(`Due: ${document.dueAt ? document.dueAt.toISOString().slice(0, 10) : "No due date"}`, 48, y));
  y -= 30;

  content.push(line("Line items", 48, y, 13));
  y -= 20;
  for (const item of document.lineItems) {
    content.push(
      line(
        `${item.description.slice(0, 62)}  Qty ${item.quantity}  ${formatMoney(item.lineTotalCents, document.currency)}`,
        48,
        y
      )
    );
    y -= 16;
    if (y < 180) break;
  }

  y -= 14;
  content.push(line(`Subtotal: ${formatMoney(document.subtotalCents, document.currency)}`, 360, y));
  y -= 16;
  content.push(line(`Discount: ${formatMoney(document.discountCents, document.currency)}`, 360, y));
  y -= 16;
  content.push(line(`Tax: ${formatMoney(document.taxCents, document.currency)}`, 360, y));
  y -= 16;
  content.push(line(`Total: ${formatMoney(document.totalCents, document.currency)}`, 360, y, 12));
  y -= 16;
  content.push(line(`Paid: ${formatMoney(paidCents, document.currency)}`, 360, y));
  y -= 16;
  content.push(line(`Remaining: ${formatMoney(remainingCents, document.currency)}`, 360, y, 12));

  if (document.publicMemo) {
    content.push(line(`Memo: ${document.publicMemo.slice(0, 90)}`, 48, 96));
  }

  const pdf = buildPdf(content);
  return new Response(pdf, {
    headers: {
      "Content-Disposition": `inline; filename="${document.documentNumber}.pdf"`,
      "Content-Type": "application/pdf"
    }
  });
}
