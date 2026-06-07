import { NextResponse } from "next/server";
import { unsubscribeByToken } from "@/lib/email";

export const dynamic = "force-dynamic";

type UnsubscribeRouteProps = {
  params: Promise<{ token: string }>;
};

async function unsubscribe(token: string) {
  const subscriber = await unsubscribeByToken(token);

  if (!subscriber) {
    return NextResponse.json({ error: "Unsubscribe link was not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}

export async function GET(_request: Request, { params }: UnsubscribeRouteProps) {
  const { token } = await params;
  return unsubscribe(token);
}

export async function POST(_request: Request, { params }: UnsubscribeRouteProps) {
  const { token } = await params;
  return unsubscribe(token);
}
