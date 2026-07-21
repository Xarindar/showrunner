import { Ellipsis, Globe2, Megaphone, WalletCards } from "lucide-react";

export const movableModuleNavigationCategories = ["primary", "website", "marketing", "finance", "more"] as const;

export const collapsibleModuleNavigationCategories = [
  {
    id: "website",
    label: "Website",
    icon: Globe2
  },
  {
    id: "marketing",
    label: "Marketing",
    icon: Megaphone
  },
  {
    id: "finance",
    label: "Finance",
    icon: WalletCards
  },
  {
    id: "more",
    label: "More",
    icon: Ellipsis
  }
] as const;

export type CollapsibleModuleNavigationCategory = (typeof collapsibleModuleNavigationCategories)[number];
export type MovableModuleNavigationCategory = (typeof movableModuleNavigationCategories)[number];
export type ModuleNavigationCategory = MovableModuleNavigationCategory | "hidden";

export type AdminModuleNavigationLayoutItem = {
  category: MovableModuleNavigationCategory;
  moduleId: string;
};

export function isMovableModuleNavigationCategory(value: unknown): value is MovableModuleNavigationCategory {
  return typeof value === "string" && movableModuleNavigationCategories.includes(value as MovableModuleNavigationCategory);
}
