import {
  movableModuleNavigationCategories,
  type AdminModuleNavigationLayoutItem,
  type MovableModuleNavigationCategory
} from "@/shell/module-navigation";

export function groupAdminModuleNavigationLayout(items: AdminModuleNavigationLayoutItem[]) {
  return movableModuleNavigationCategories.flatMap((category) => items.filter((item) => item.category === category));
}

export function moveAdminModuleNavigationItem(
  items: AdminModuleNavigationLayoutItem[],
  moduleId: string,
  category: MovableModuleNavigationCategory,
  overModuleId?: string,
  placeAfter = false
) {
  const active = items.find((item) => item.moduleId === moduleId);
  if (!active) return items;

  const remaining = items.filter((item) => item.moduleId !== moduleId);
  const categoryItems = remaining.filter((item) => item.category === category);
  let categoryIndex = overModuleId ? categoryItems.findIndex((item) => item.moduleId === overModuleId) : categoryItems.length;
  if (categoryIndex < 0) categoryIndex = categoryItems.length;
  if (placeAfter && categoryIndex < categoryItems.length) categoryIndex += 1;
  categoryItems.splice(categoryIndex, 0, { category, moduleId });

  return movableModuleNavigationCategories.flatMap((currentCategory) =>
    currentCategory === category ? categoryItems : remaining.filter((item) => item.category === currentCategory)
  );
}
