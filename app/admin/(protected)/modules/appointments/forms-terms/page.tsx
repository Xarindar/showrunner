import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { getSiteSettings } from "@/lib/site";
import { listBookingDocuments } from "@/lib/scheduling/booking-document-store";
import { FormsTerms } from "@/modules/appointments/forms-terms";
export default async function FormsTermsPage() {
  await requireAdmin("scheduling:manage");
  const settings=await getSiteSettings();
  if (!settings.enabledModuleIds.includes("appointments")) notFound();
  return <FormsTerms initialDocuments={await listBookingDocuments(settings.siteId)}/>;
}
