import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { bookingRulesSchema } from "./booking-rules";
import { bookingDocumentKindSchema, type BookingDocument } from "./booking-documents";

export async function listBookingDocuments(siteId: string, database: Pick<Prisma.TransactionClient, "bookingRuleSet"> = prisma): Promise<BookingDocument[]> {
  const documents=await database.bookingRuleSet.findMany({where:{siteId},orderBy:{name:"asc"}});
  return documents.map(document=>({id:document.id,name:document.name,version:document.version,isDefault:document.isDefault,kind:bookingDocumentKindSchema.parse(document.kind),rules:bookingRulesSchema.parse(document.rules)}));
}
