import { NextResponse } from "next/server";
import { z } from "zod";
import { subscribeToList } from "@/lib/email";

export const dynamic = "force-dynamic";

const subscribeSchema = z.object({
  email: z.email().transform((value) => value.trim().toLowerCase()),
  name: z.string().trim().optional(),
  listId: z.string().trim().optional(),
  consent: z.union([z.literal("true"), z.literal("on"), z.literal(true)]),
  consentSource: z.string().trim().optional()
});

async function requestBody(request: Request) {
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    return request.json();
  }

  const formData = await request.formData();
  return Object.fromEntries(formData.entries());
}

export async function POST(request: Request) {
  const parsed = subscribeSchema.safeParse(await requestBody(request).catch(() => ({})));

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "Check the signup form." }, { status: 400 });
  }

  const subscriber = await subscribeToList({
    email: parsed.data.email,
    name: parsed.data.name,
    listId: parsed.data.listId,
    consentSource: parsed.data.consentSource || "newsletter_signup"
  });

  return NextResponse.json({ ok: true, subscriberId: subscriber.id });
}
