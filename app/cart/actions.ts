"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  addCartItem,
  applyCartCoupon,
  createDraftOrderFromCart,
  removeCartCoupon,
  updateCartItem
} from "@/lib/commerce/cart";
import { queueOrderCheckoutEmail } from "@/lib/email";

const cartCookieName = "commerce_cart_id";

const addToCartSchema = z.object({
  productId: z.string().trim().min(1),
  variantId: z.string().trim().optional(),
  quantity: z.coerce.number().int().min(1).max(999),
  returnTo: z.string().trim().optional()
});

const updateCartItemSchema = z.object({
  itemId: z.string().trim().min(1),
  quantity: z.coerce.number().int().min(0).max(999)
});

const couponSchema = z.object({
  code: z.string().trim().min(1)
});

const draftOrderSchema = z.object({
  customerName: z.string().trim().min(2, "Add your name."),
  customerEmail: z.email("Add a valid email.").transform((value) => value.trim().toLowerCase())
});

async function currentCartId() {
  const cookieStore = await cookies();
  return cookieStore.get(cartCookieName)?.value;
}

async function setCartId(cartId: string) {
  const cookieStore = await cookies();
  cookieStore.set(cartCookieName, cartId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 14
  });
}

function cartError(message: string): never {
  redirect(`/cart?error=${encodeURIComponent(message)}`);
}

export async function addToCartAction(formData: FormData) {
  const parsed = addToCartSchema.safeParse({
    productId: formData.get("productId"),
    variantId: formData.get("variantId") || undefined,
    quantity: formData.get("quantity"),
    returnTo: formData.get("returnTo") || undefined
  });

  if (!parsed.success) {
    cartError(parsed.error.issues[0]?.message || "Could not add that item.");
  }

  try {
    const cartId = await addCartItem({
      cartId: await currentCartId(),
      productId: parsed.data.productId,
      variantId: parsed.data.variantId,
      quantity: parsed.data.quantity
    });
    await setCartId(cartId);
  } catch (error) {
    cartError(error instanceof Error ? error.message : "Could not add that item.");
  }

  redirect(parsed.data.returnTo || "/cart?added=1");
}

export async function updatePublicCartItemAction(formData: FormData) {
  const cartId = await currentCartId();
  if (!cartId) cartError("Cart not found.");

  const parsed = updateCartItemSchema.safeParse({
    itemId: formData.get("itemId"),
    quantity: formData.get("quantity")
  });

  if (!parsed.success) {
    cartError(parsed.error.issues[0]?.message || "Could not update that item.");
  }

  try {
    await updateCartItem({
      cartId,
      itemId: parsed.data.itemId,
      quantity: parsed.data.quantity
    });
  } catch (error) {
    cartError(error instanceof Error ? error.message : "Could not update that item.");
  }

  redirect("/cart?saved=1");
}

export async function applyPublicCartCouponAction(formData: FormData) {
  const cartId = await currentCartId();
  if (!cartId) cartError("Cart not found.");

  const parsed = couponSchema.safeParse({
    code: formData.get("code")
  });

  if (!parsed.success) {
    cartError(parsed.error.issues[0]?.message || "Add a coupon code.");
  }

  try {
    await applyCartCoupon({ cartId, code: parsed.data.code });
  } catch (error) {
    cartError(error instanceof Error ? error.message : "Could not apply that coupon.");
  }

  redirect("/cart?saved=coupon");
}

export async function removePublicCartCouponAction(_formData: FormData) {
  void _formData;
  const cartId = await currentCartId();
  if (!cartId) cartError("Cart not found.");

  try {
    await removeCartCoupon(cartId);
  } catch (error) {
    cartError(error instanceof Error ? error.message : "Could not remove that coupon.");
  }

  redirect("/cart?saved=coupon-removed");
}

export async function preparePublicCheckoutAction(formData: FormData) {
  const cartId = await currentCartId();
  if (!cartId) cartError("Cart not found.");

  const parsed = draftOrderSchema.safeParse({
    customerName: formData.get("customerName"),
    customerEmail: formData.get("customerEmail")
  });

  if (!parsed.success) {
    cartError(parsed.error.issues[0]?.message || "Add your checkout details.");
  }

  try {
    const order = await createDraftOrderFromCart({
      cartId,
      customerName: parsed.data.customerName,
      customerEmail: parsed.data.customerEmail
    });

    await queueOrderCheckoutEmail(order);
    redirect(`/cart?order=${encodeURIComponent(order.orderNumber)}`);
  } catch (error) {
    cartError(error instanceof Error ? error.message : "Could not prepare checkout.");
  }
}
