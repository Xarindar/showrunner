import { NextResponse } from "next/server";
import { CartStatus } from "@prisma/client";
import { verifyCartRecoveryToken } from "@/lib/commerce/cart-recovery-token";
import { prisma } from "@/lib/prisma";
import { getSiteSettingsForSite } from "@/lib/site";

const cartCookieName = "commerce_cart_id";

function redirectTo(request: Request, path: string) {
  return NextResponse.redirect(new URL(path, request.url));
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") || "";
  const payload = verifyCartRecoveryToken(token);

  if (!payload) {
    return redirectTo(request, "/cart?error=That cart recovery link is invalid or expired.");
  }

  const settings = await getSiteSettingsForSite(payload.siteId);
  if (!settings.enabledModuleIds.includes("products")) {
    return redirectTo(request, "/cart?error=Storefront is not available.");
  }

  const cart = await prisma.cart.findFirst({
    where: {
      id: payload.cartId,
      siteId: payload.siteId,
      status: { in: [CartStatus.OPEN, CartStatus.ABANDONED] },
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      items: { some: {} }
    },
    select: { id: true, status: true }
  });

  if (!cart) {
    return redirectTo(request, "/cart?error=That cart is no longer available.");
  }

  if (cart.status === CartStatus.ABANDONED) {
    await prisma.cart.update({
      where: { id: cart.id },
      data: {
        status: CartStatus.OPEN,
        recoveryLastError: ""
      }
    });
  }

  const response = redirectTo(request, "/cart?recovered=1");
  response.cookies.set(cartCookieName, cart.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 14
  });
  return response;
}
