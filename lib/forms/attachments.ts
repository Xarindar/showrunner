import "server-only";

import { FormAttachmentTargetType, FormStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const formAttachmentQueryKeyByType: Record<FormAttachmentTargetType, string> = {
  [FormAttachmentTargetType.BOOKING]: "booking",
  [FormAttachmentTargetType.ORDER]: "order",
  [FormAttachmentTargetType.GALLERY]: "gallery"
};

export function parseFormAttachmentTarget(searchParams: Record<string, string | string[] | undefined>) {
  for (const [targetType, queryKey] of Object.entries(formAttachmentQueryKeyByType) as Array<[FormAttachmentTargetType, string]>) {
    const rawValue = searchParams[queryKey];
    const targetId = Array.isArray(rawValue) ? rawValue[0] : rawValue;
    if (targetId) return { targetId, targetType };
  }

  return null;
}

export function publicFormAttachmentHref(input: {
  formSlug: string;
  targetId: string;
  targetType: FormAttachmentTargetType;
}) {
  const params = new URLSearchParams({ [formAttachmentQueryKeyByType[input.targetType]]: input.targetId });
  return `/forms/${input.formSlug}?${params.toString()}`;
}

export async function getPublicFormAttachments(input: {
  siteId: string;
  targetId: string;
  targetType: FormAttachmentTargetType;
}) {
  return prisma.formAttachment.findMany({
    where: {
      siteId: input.siteId,
      targetId: input.targetId,
      targetType: input.targetType,
      form: { status: FormStatus.ACTIVE }
    },
    include: {
      form: {
        select: {
          description: true,
          name: true,
          slug: true
        }
      }
    },
    orderBy: [{ isRequired: "desc" }, { createdAt: "asc" }]
  });
}
