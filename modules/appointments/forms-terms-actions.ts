"use server";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { getSiteSettings } from "@/lib/site";
import { prisma } from "@/lib/prisma";
import { bookingDocumentInputSchema, type BookingDocument } from "@/lib/scheduling/booking-documents";

export async function saveBookingDocument(input: unknown): Promise<{document?: BookingDocument; error?: string}> {
  await requireAdmin("scheduling:manage");
  const parsed=bookingDocumentInputSchema.safeParse(input);
  if (!parsed.success) return {error:parsed.error.issues[0].message};
  const {siteId}=await getSiteSettings();
  const {id,version,...value}=parsed.data;
  try {
    const document=await prisma.$transaction(async tx=>{
      if (id && !await tx.bookingRuleSet.findFirst({where:{id,siteId,version,kind:value.kind},select:{id:true}})) throw new Error("This document changed in another window. Reopen it before saving.");
      if (value.isDefault) await tx.bookingRuleSet.updateMany({where:{siteId,kind:value.kind,isDefault:true,...(id?{id:{not:id}}:{})},data:{isDefault:false}});
      const data={...value,nameKey:value.name.toLowerCase()};
      if (!id) return tx.bookingRuleSet.create({data:{...data,siteId}});
      const updated=await tx.bookingRuleSet.updateMany({where:{id,siteId,version},data:{...data,version:{increment:1}}});
      if (!updated.count) throw new Error("This document changed in another window. Reopen it before saving.");
      return tx.bookingRuleSet.findFirstOrThrow({where:{id,siteId}});
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
    revalidatePath("/admin/modules/appointments/forms-terms");revalidatePath("/admin/modules/services");
    return {document:{id:document.id,name:document.name,kind:value.kind,version:document.version,isDefault:document.isDefault,rules:value.rules}};
  } catch(error) {
    return {error:error instanceof Prisma.PrismaClientKnownRequestError && error.code==="P2002" ? "A document with that name already exists." : error instanceof Error && !("code" in error) ? error.message : "Could not save this document. Your changes are still here; retry after reopening it."};
  }
}
