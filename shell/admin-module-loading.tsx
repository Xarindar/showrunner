"use client";

import { usePathname } from "next/navigation";
import { AdminTableSkeleton } from "@/shell/admin-table-loading";
import { AdminSkeleton, AppointmentsSkeleton } from "@/shell/loading-states";
import { adminLoadingRoute } from "@/shell/admin-loading-route";

export function AdminModuleLoading() {
  const route = adminLoadingRoute(usePathname());
  if (route.kind === "calendar") return <AppointmentsSkeleton />;
  if (route.kind === "clients" || route.kind === "services" || route.kind === "products" || route.kind === "packages") {
    return <AdminTableSkeleton kind={route.kind} />;
  }
  return <AdminSkeleton title={route.title} kind={route.kind} />;
}
