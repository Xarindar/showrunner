import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { getSiteSettings } from "@/lib/site";
import { listBookingDocuments } from "@/lib/scheduling/booking-document-store";
import { FormsTerms } from "@/modules/appointments/forms-terms";

export default async function TermsEditorPage({params}:{params:Promise<{documentId:string}>}) {
  await requireAdmin("scheduling:manage");
  const settings=await getSiteSettings();
  if(!settings.enabledModuleIds.includes("appointments"))notFound();
  const {documentId}=await params;
  const documents=await listBookingDocuments(settings.siteId);
  if(documentId!=="new"&&!documents.some(document=>document.id===documentId&&document.kind==="TERMS"))notFound();
  return <FormsTerms initialDocuments={documents} initialTermsId={documentId}/>;
}
