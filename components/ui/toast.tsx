import type { HTMLAttributes } from "react";
import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { cx } from "./utils";

type ToastTone = "neutral" | "success" | "danger";

type ToastProps = HTMLAttributes<HTMLDivElement> & {
  description?: string;
  title: string;
  tone?: ToastTone;
};

export function Toast({ children, className, description, title, tone = "neutral", ...props }: ToastProps) {
  const Icon = tone === "success" ? CheckCircle2 : tone === "danger" ? AlertTriangle : Info;

  return (
    <div className={cx("ui-toast", `ui-toast-${tone}`, className)} role={tone === "danger" ? "alert" : "status"} {...props}>
      <Icon size={18} aria-hidden="true" />
      <span>
        <strong>{title}</strong>
        {description ? <small>{description}</small> : null}
      </span>
      {children}
    </div>
  );
}

export function ToastRegion({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx("ui-toast-region", className)} {...props} />;
}
