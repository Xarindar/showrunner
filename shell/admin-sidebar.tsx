"use client";

import Link from "next/link";
import { ChevronDown, Gauge, LayoutTemplate, LogOut, Menu, Settings, UserRound, X } from "lucide-react";
import type { AdminRole } from "@prisma/client";
import { usePathname } from "next/navigation";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { moduleIcons, moduleRegistry, type ModuleId } from "@/shell/modules";
import type { ModuleStatus } from "@/shell/module-types";
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
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
  const canUpdateSettings = hasAdminPermission({ role: userRole }, "settings:update");
  const settingsPathActive = pathname.startsWith("/admin/modules/settings");
  const settingsSubmenuOpen = settingsMenuOpen || settingsPathActive;

  const closeMenu = () => setMenuOpen(false);
  const toggleSettingsMenu = () => setSettingsMenuOpen((open) => !open);

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

              if (!enabled || isFuture) {
                return (
                  <span className="disabled-link" key={item.id} title={isFuture ? "Future module" : "Disabled"}>
                    <Icon size={18} />
                    {item.label}
                  </span>
                );
              }

              if (item.id === "settings") {
                return (
                  <div className="admin-nav-group" key={item.id}>
                    <button
                      aria-controls="settings-submenu"
                      aria-expanded={settingsSubmenuOpen}
                      className={isActive ? "active" : undefined}
                      onClick={toggleSettingsMenu}
                      type="button"
                    >
                      <Icon size={18} />
                      <span>{item.label}</span>
                      <ChevronDown className="admin-nav-chevron" size={16} />
                    </button>
                    {settingsSubmenuOpen ? (
                      <div className="admin-subnav" id="settings-submenu">
                        <Link className={pathname === "/admin/modules/settings" ? "active" : undefined} href="/admin/modules/settings" onClick={closeMenu}>
                          <Gauge size={15} />
                          Dashboard
                        </Link>
                        <Link
                          className={pathname.startsWith("/admin/modules/settings/modules") ? "active" : undefined}
                          href="/admin/modules/settings/modules"
                          onClick={closeMenu}
                        >
                          <LayoutTemplate size={15} />
                          Modules
                        </Link>
                      </div>
                    ) : null}
                  </div>
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
              <button aria-label="Open settings menu" className="admin-user-icon-button" onClick={toggleSettingsMenu} title="Settings" type="button">
                <Settings size={17} />
              </button>
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
