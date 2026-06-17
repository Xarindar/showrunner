"use client";

import Link from "next/link";
import { LogOut, Menu, X } from "lucide-react";
import type { AdminRole } from "@prisma/client";
import { usePathname } from "next/navigation";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { moduleIcons, moduleRegistry, type ModuleId } from "@/shell/modules";
import type { ModuleStatus } from "@/shell/module-types";
import { logoutAction } from "@/app/admin/(protected)/actions";
import { useState } from "react";

type AdminSidebarProps = {
  businessName: string;
  enabledModules: ModuleId[];
  userRole: AdminRole;
};

export function AdminSidebar({ businessName, enabledModules, userRole }: AdminSidebarProps) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  const closeMenu = () => setMenuOpen(false);

  return (
    <>
      <header className="admin-mobile-bar">
        <Link href="/admin" className="brand" onClick={closeMenu}>
          <span className="brand-mark" />
          <span>{businessName}</span>
        </Link>
        <button
          aria-controls="admin-sidebar"
          aria-expanded={menuOpen}
          aria-label="Open admin menu"
          className="admin-menu-toggle"
          onClick={() => setMenuOpen(true)}
          type="button"
        >
          <Menu size={22} />
        </button>
      </header>

      <button
        aria-label="Close admin menu"
        className={`admin-sidebar-overlay ${menuOpen ? "open" : ""}`}
        onClick={closeMenu}
        type="button"
      />

      <aside className={`admin-sidebar ${menuOpen ? "open" : ""}`} id="admin-sidebar">
        <div className="admin-sidebar-header">
          <Link href="/admin" className="brand" onClick={closeMenu}>
            <span className="brand-mark" />
            <span>{businessName}</span>
          </Link>
          <button aria-label="Close admin menu" className="admin-sidebar-close" onClick={closeMenu} type="button">
            <X size={20} />
          </button>
        </div>

        <nav className="admin-nav" aria-label="Admin modules">
          {moduleRegistry.map((item) => {
            const Icon = moduleIcons[item.icon];
            const enabled = enabledModules.includes(item.id);
            const status = item.status as ModuleStatus;
            const isFuture = status === "future";
            const isActive = item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
            const visible = !item.permissions?.length || item.permissions.some((permission) => hasAdminPermission({ role: userRole }, permission));

            if (!visible) return null;

            if (!enabled || isFuture) {
              return (
                <span className="disabled-link" key={item.id} title={isFuture ? "Future module" : "Disabled"}>
                  <Icon size={18} />
                  {item.label}
                </span>
              );
            }

            return (
              <Link className={isActive ? "active" : undefined} key={item.id} href={item.href} onClick={closeMenu}>
                <Icon size={18} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <form action={logoutAction} className="admin-sidebar-actions">
          <button className="button ghost" type="submit">
            <LogOut size={18} />
            Sign out
          </button>
        </form>
      </aside>
    </>
  );
}
