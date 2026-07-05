"use client";

import Link from "next/link";
import { ArrowLeft, LogOut, Menu, Settings, UserRound, X } from "lucide-react";
import type { AdminRole } from "@prisma/client";
import { usePathname } from "next/navigation";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { moduleIcons, moduleRegistry, type ModuleId } from "@/shell/modules";
import type { ModuleStatus } from "@/shell/module-types";
import { useAdminMobileHeaderContext } from "@/shell/admin-mobile-header";
import { logoutAction } from "@/app/admin/(protected)/actions";
import { Button } from "@/components/ui";
import { useState } from "react";

type AdminSidebarProps = {
  businessName: string;
  enabledModules: ModuleId[];
  userEmail: string;
  userRole: AdminRole;
};

function roleLabel(role: AdminRole) {
  return role.toLowerCase().split("_").join(" ");
}

export function AdminSidebar({ businessName, enabledModules, userEmail, userRole }: AdminSidebarProps) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const mobileHeaderContext = useAdminMobileHeaderContext();
  const canUpdateSettings = hasAdminPermission({ role: userRole }, "settings:update");

  const closeMenu = () => setMenuOpen(false);

  return (
    <>
      <header className={`admin-mobile-bar ${mobileHeaderContext ? "is-contextual" : ""}`}>
        <Link href="/admin" className="brand" onClick={closeMenu}>
          <span className="brand-mark" />
          <span>{businessName}</span>
        </Link>
        {mobileHeaderContext ? (
          <>
            <Link className="admin-mobile-context-back" href={mobileHeaderContext.backHref} onClick={closeMenu}>
              <ArrowLeft size={17} />
              <span>Back</span>
            </Link>
            <strong className="admin-mobile-context-title">{mobileHeaderContext.title}</strong>
          </>
        ) : null}
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

        <div className="admin-sidebar-nav-scroll">
          <nav className="admin-nav" aria-label="Admin modules">
            {moduleRegistry.map((item) => {
              const Icon = moduleIcons[item.icon];
              const enabled = enabledModules.includes(item.id);
              const status = item.status as ModuleStatus;
              const isFuture = status === "future";
              const isActive = item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
              const visible = !item.permissions?.length || item.permissions.some((permission) => hasAdminPermission({ role: userRole }, permission));

              if (!visible) return null;
              if (item.id === "settings") return null;

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
        </div>

        <div className="admin-sidebar-account">
          <span className="admin-user-avatar" aria-hidden="true">
            <UserRound size={18} />
          </span>
          <span className="admin-user-copy">
            <strong>{userEmail}</strong>
            <small>{roleLabel(userRole)}</small>
          </span>
          <span className="admin-user-actions">
            {canUpdateSettings ? (
              <Link
                aria-label="Open settings"
                className="admin-user-icon-button"
                href="/admin/modules/settings"
                onClick={closeMenu}
                title="Settings"
              >
                <Settings size={17} />
              </Link>
            ) : null}
            <form action={logoutAction}>
              <Button aria-label="Sign out" className="admin-user-icon-button" title="Sign out" variant="ghost" type="submit">
                <LogOut size={17} />
              </Button>
            </form>
          </span>
        </div>
      </aside>
    </>
  );
}
