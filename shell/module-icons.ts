import {
  BookOpen,
  CalendarCheck,
  CalendarDays,
  ClipboardList,
  Gauge,
  Image,
  LayoutTemplate,
  Mail,
  ReceiptText,
  Rocket,
  Settings,
  ShoppingBag,
  Star,
  Users,
  Wallet,
  Workflow,
  type LucideIcon
} from "lucide-react";

// Single source of truth for module sidebar icons. To add an icon, add one entry here; the
// ModuleIconName type below is derived from these keys, so manifests get the new name automatically
// and no second list needs editing.
export const moduleIcons = {
  BookOpen,
  CalendarCheck,
  CalendarDays,
  ClipboardList,
  Gauge,
  Image,
  LayoutTemplate,
  Mail,
  ReceiptText,
  Rocket,
  Settings,
  ShoppingBag,
  Star,
  Users,
  Wallet,
  Workflow
} satisfies Record<string, LucideIcon>;

export type ModuleIconName = keyof typeof moduleIcons;
