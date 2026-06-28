"use client";

import { Button, type ButtonProps } from "@/components/ui";

type ActivateConfirmButtonProps = ButtonProps & {
  confirmMessage?: string;
  needsConfirm: boolean;
};

/**
 * Submit button that asks for confirmation before activating a $0 product.
 * $0 is a valid free product, so this warns — it never blocks.
 */
export function ActivateConfirmButton({
  confirmMessage = "Activate at $0.00? Customers will be able to buy it for free.",
  needsConfirm,
  onClick,
  ...props
}: ActivateConfirmButtonProps) {
  return (
    <Button
      {...props}
      onClick={(event) => {
        if (needsConfirm && !window.confirm(confirmMessage)) {
          event.preventDefault();
          return;
        }
        onClick?.(event);
      }}
      type="submit"
    />
  );
}
