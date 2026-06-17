import type { ButtonHTMLAttributes, ComponentPropsWithoutRef } from "react";
import Link from "next/link";
import { cx } from "./utils";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

function buttonClassName({
  className,
  size = "md",
  variant = "primary"
}: {
  className?: string;
  size?: ButtonSize;
  variant?: ButtonVariant;
}) {
  return cx("ui-button", variant !== "primary" && `ui-button-${variant}`, size !== "md" && `ui-button-${size}`, className);
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  size?: ButtonSize;
  variant?: ButtonVariant;
};

export function Button({ className, size, variant, ...props }: ButtonProps) {
  return <button className={buttonClassName({ className, size, variant })} {...props} />;
}

type ButtonLinkProps = ComponentPropsWithoutRef<typeof Link> & {
  size?: ButtonSize;
  variant?: ButtonVariant;
};

export function ButtonLink({ className, size, variant, ...props }: ButtonLinkProps) {
  return <Link className={buttonClassName({ className, size, variant })} {...props} />;
}
