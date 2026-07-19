import { Ellipsis, Globe2, Megaphone, WalletCards } from "lucide-react";

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
export type ModuleNavigationCategory = "primary" | CollapsibleModuleNavigationCategory["id"] | "hidden";
