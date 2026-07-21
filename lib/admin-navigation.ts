import "server-only";

import { AdminModuleNavigationCategory } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  isMovableModuleNavigationCategory,
  movableModuleNavigationCategories,
  type AdminModuleNavigationLayoutItem,
  type MovableModuleNavigationCategory
} from "@/shell/module-navigation";
import { moduleRegistry } from "@/shell/modules";

const categoryToDatabase = {
  primary: AdminModuleNavigationCategory.PRIMARY,
  website: AdminModuleNavigationCategory.WEBSITE,
  marketing: AdminModuleNavigationCategory.MARKETING,
  finance: AdminModuleNavigationCategory.FINANCE,
  more: AdminModuleNavigationCategory.MORE
} satisfies Record<MovableModuleNavigationCategory, AdminModuleNavigationCategory>;

const categoryFromDatabase = Object.fromEntries(
  Object.entries(categoryToDatabase).map(([category, databaseCategory]) => [databaseCategory, category])
) as Record<AdminModuleNavigationCategory, MovableModuleNavigationCategory>;

function navigableModules() {
  return moduleRegistry.filter((module) => isMovableModuleNavigationCategory(module.navigation.category));
}

function defaultLayout(): AdminModuleNavigationLayoutItem[] {
  return navigableModules().map((module) => ({
    category: module.navigation.category as MovableModuleNavigationCategory,
    moduleId: module.id
  }));
}

function groupedLayout(items: AdminModuleNavigationLayoutItem[]) {
  return movableModuleNavigationCategories.flatMap((category) => items.filter((item) => item.category === category));
}

export async function getAdminModuleNavigationLayout(userId: string): Promise<AdminModuleNavigationLayoutItem[]> {
  const defaults = defaultLayout();
  let rows = await prisma.adminModuleNavigationItem.findMany({
    where: { userId },
    orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }]
  });
  const knownModuleIds = new Set(defaults.map((item) => item.moduleId));
  const savedModuleIds = new Set(rows.filter((row) => knownModuleIds.has(row.moduleId)).map((row) => row.moduleId));
  const missingDefaults = defaults.filter((item) => !savedModuleIds.has(item.moduleId));

  if (missingDefaults.length) {
    const sortOrderByCategory = new Map<MovableModuleNavigationCategory, number>();
    for (const row of rows) {
      const category = categoryFromDatabase[row.category];
      sortOrderByCategory.set(category, Math.max(sortOrderByCategory.get(category) ?? -1, row.sortOrder));
    }

    await prisma.adminModuleNavigationItem.createMany({
      data: missingDefaults.map((item) => {
        const sortOrder = (sortOrderByCategory.get(item.category) ?? -1) + 1;
        sortOrderByCategory.set(item.category, sortOrder);
        return {
          category: categoryToDatabase[item.category],
          moduleId: item.moduleId,
          sortOrder,
          userId
        };
      }),
      skipDuplicates: true
    });

    rows = await prisma.adminModuleNavigationItem.findMany({
      where: { userId },
      orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }]
    });
  }

  const savedLayout = rows
    .filter((row) => knownModuleIds.has(row.moduleId))
    .map((row) => ({ category: categoryFromDatabase[row.category], moduleId: row.moduleId, sortOrder: row.sortOrder }))
    .sort((left, right) => left.category.localeCompare(right.category) || left.sortOrder - right.sortOrder)
    .map(({ category, moduleId }) => ({ category, moduleId }));

  return groupedLayout(savedLayout);
}

export async function saveAdminModuleNavigationLayout(userId: string, input: AdminModuleNavigationLayoutItem[]) {
  const knownModuleIds = new Set(navigableModules().map((module) => module.id));
  const seenModuleIds = new Set<string>();
  const safeLayout = input.filter((item): item is AdminModuleNavigationLayoutItem => {
    if (!knownModuleIds.has(item.moduleId) || !isMovableModuleNavigationCategory(item.category) || seenModuleIds.has(item.moduleId)) {
      return false;
    }
    seenModuleIds.add(item.moduleId);
    return true;
  });
  const sortOrderByCategory = new Map<MovableModuleNavigationCategory, number>();

  await prisma.$transaction(
    safeLayout.map((item) => {
      const sortOrder = sortOrderByCategory.get(item.category) ?? 0;
      sortOrderByCategory.set(item.category, sortOrder + 1);
      return prisma.adminModuleNavigationItem.upsert({
        where: { userId_moduleId: { userId, moduleId: item.moduleId } },
        update: { category: categoryToDatabase[item.category], sortOrder },
        create: {
          category: categoryToDatabase[item.category],
          moduleId: item.moduleId,
          sortOrder,
          userId
        }
      });
    })
  );

  return safeLayout;
}
