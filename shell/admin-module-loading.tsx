"use client";

import { usePathname } from "next/navigation";
import { AdminTableSkeleton } from "@/shell/admin-table-loading";
import { AdminSkeleton, AppointmentsSkeleton } from "@/shell/loading-states";

export function AdminModuleLoading() {
  const pathname = usePathname();

  if (pathname === "/admin/modules/appointments") return <AppointmentsSkeleton />;
  if (pathname === "/admin/modules/clients") return <AdminTableSkeleton kind="clients" />;
  if (pathname === "/admin/modules/services") return <AdminTableSkeleton kind="services" />;
  if (pathname === "/admin/modules/products") return <AdminTableSkeleton kind="products" />;

  return <AdminSkeleton rows={8} />;
}
