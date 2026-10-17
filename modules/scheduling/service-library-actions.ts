"use server";

import { Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSiteSettings } from "@/lib/site";
import { serviceLibraryInputSchema, serviceLibraryItemSchema, type ServiceLibraryItem } from "@/lib/scheduling/service-library";

export async function saveServiceLibraryItemAction(input: unknown): Promise<{ item: ServiceLibraryItem; error?: never } | { error: string; item?: never }> {
  await requireAdmin("scheduling:manage");
  const parsed = serviceLibraryInputSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { siteId } = await getSiteSettings();
  const { id, ...values } = parsed.data;
  const data = { ...values, nameKey: values.name.toLowerCase() };
  try {
    if (id) {
      const result = await prisma.serviceLibraryItem.updateMany({ where: { id, siteId }, data });
      if (!result.count) return { error: "This library service is no longer available." };
      return { item: serviceLibraryItemSchema.parse({ id, ...data }) };
    }
    const item = await prisma.serviceLibraryItem.create({ data: { ...data, siteId } });
    return { item: serviceLibraryItemSchema.parse(item) };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { error: "A service with this name already exists. Choose it from the library or use a different name." };
    }
    return { error: "The service could not be saved. Your details are still here; please try again." };
  }
}
