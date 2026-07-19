"use client";

import Link from "next/link";
import Image from "next/image";
import {
  ArrowLeft,
  ChevronDown,
  ExternalLink,
  LogOut,
  Menu,
  Settings,
  UserRound,
  X
} from "lucide-react";
import type { AdminRole } from "@prisma/client";
import { usePathname } from "next/navigation";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { moduleIcons, moduleRegistry, type ModuleId } from "@/shell/modules";
import { collapsibleModuleNavigationCategories, type CollapsibleModuleNavigationCategory } from "@/shell/module-navigation";
import type { ModuleStatus, ShellModule } from "@/shell/module-types";
import { useAdminMobileHeaderContext } from "@/shell/admin-mobile-header";
import { logoutAction } from "@/app/admin/(protected)/actions";
import { Button } from "@/components/ui";
import { useState } from "react";

type AdminSidebarProps = {
  businessName: string;
  enabledModules: ModuleId[];
  logoUrl: string;
  userEmail: string;
  userRole: AdminRole;
};

function roleLabel(role: AdminRole) {
  return role.toLowerCase().split("_").join(" ");
}

function moduleIsActive(pathname: string, item: ShellModule) {
  return item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
}

function SidebarBrand({ businessName, logoUrl }: Pick<AdminSidebarProps, "businessName" | "logoUrl">) {
  return (
    <>
      {logoUrl ? (
        <Image alt="" className="brand-logo" height={36} src={logoUrl} unoptimized width={120} />
      ) : (
        <span className="brand-mark admin-brand-mark" />
      )}
      <span>{businessName}</span>
    </>
  );
}

function SidebarModuleLink({
  closeMenu,
  enabledModules,
  item,
  pathname,
  showIcon = true
}: {
  closeMenu: () => void;
  enabledModules: ModuleId[];
  item: ShellModule;
  pathname: string;
  showIcon?: boolean;
}) {
  const Icon = moduleIcons[item.icon];
  const enabled = enabledModules.includes(item.id as ModuleId);
  const isFuture = (item.status as ModuleStatus) === "future";
  const isActive = moduleIsActive(pathname, item);
  const label = item.id === "dashboard" ? "Home" : item.label;

  if (!enabled || isFuture) {
    return (
      <span className="disabled-link" title={isFuture ? "Future module" : "Disabled"}>
        {showIcon ? <Icon size={17} /> : null}
        {label}
      </span>
    );
  }

  return (
    <Link aria-current={isActive ? "page" : undefined} className={isActive ? "active" : undefined} href={item.href} onClick={closeMenu}>
      {showIcon ? <Icon size={17} /> : null}
      {label}
    </Link>
  );
}

function SidebarNavGroup({
  closeMenu,
  enabledModules,
  group,
  items,
  pathname
}: {
  closeMenu: () => void;
  enabledModules: ModuleId[];
  group: CollapsibleModuleNavigationCategory;
  items: ShellModule[];
  pathname: string;
}) {
  const isActive = items.some((item) => moduleIsActive(pathname, item));
  const [expanded, setExpanded] = useState(isActive);
  const GroupIcon = group.icon;

  if (!items.length) return null;

  return (
    <div className="admin-nav-group">
      <button
        aria-controls={`admin-nav-${group.id}`}
        aria-expanded={expanded}
        className={isActive ? "active" : undefined}
        onClick={() => setExpanded((current) => !current)}
        type="button"
      >
        <GroupIcon size={17} />
        <span>{group.label}</span>
        <ChevronDown className="admin-nav-chevron" size={15} />
      </button>
      {expanded ? (
        <div className="admin-subnav" id={`admin-nav-${group.id}`}>
          {items.map((item) => (
            <SidebarModuleLink
              closeMenu={closeMenu}
              enabledModules={enabledModules}
              item={item}
              key={item.id}
              pathname={pathname}
              showIcon={false}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function AdminSidebar({ businessName, enabledModules, logoUrl, userEmail, userRole }: AdminSidebarProps) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const mobileHeaderContext = useAdminMobileHeaderContext();
  const activeModule = moduleRegistry.find((item) => moduleIsActive(pathname, item));
  const resolvedMobileHeader = mobileHeaderContext ?? (activeModule ? { title: activeModule.label } : null);
  const canUpdateSettings = hasAdminPermission({ role: userRole }, "settings:update");
  const visibleModules = moduleRegistry.filter(
    (item) =>
      item.id !== "settings" &&
      (!item.permissions?.length || item.permissions.some((permission) => hasAdminPermission({ role: userRole }, permission)))
  );
  const primaryModules = visibleModules.filter((item) => item.navigation.category === "primary");

  const closeMenu = () => setMenuOpen(false);

  return (
    <>
      <header className={`admin-mobile-bar ${resolvedMobileHeader ? "is-contextual" : ""}`}>
        <Link href="/admin" className="brand" onClick={closeMenu}>
          <SidebarBrand businessName={businessName} logoUrl={logoUrl} />
        </Link>
        {resolvedMobileHeader ? (
          <>
            {mobileHeaderContext ? (
              <Link className="admin-mobile-context-back" href={mobileHeaderContext.backHref} onClick={closeMenu}>
                <ArrowLeft size={17} />
                <span>Back</span>
              </Link>
            ) : <span aria-hidden="true" />}
            <strong className="admin-mobile-context-title">{resolvedMobileHeader.title}</strong>
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
            <SidebarBrand businessName={businessName} logoUrl={logoUrl} />
          </Link>
          <button aria-label="Close admin menu" className="admin-sidebar-close" onClick={closeMenu} type="button">
            <X size={20} />
          </button>
        </div>

        <div className="admin-sidebar-nav-scroll">
          <nav className="admin-nav" aria-label="Admin modules">
            <div className="admin-nav-primary">
              {primaryModules.map((item) => (
                <SidebarModuleLink closeMenu={closeMenu} enabledModules={enabledModules} item={item} key={item.id} pathname={pathname} />
              ))}
            </div>
            <div className="admin-nav-secondary">
              {collapsibleModuleNavigationCategories.map((group) => (
                <SidebarNavGroup
                  closeMenu={closeMenu}
                  enabledModules={enabledModules}
                  group={group}
                  items={visibleModules.filter((item) => item.navigation.category === group.id)}
                  key={`${group.id}:${pathname}`}
                  pathname={pathname}
                />
              ))}
            </div>
          </nav>
        </div>

        <Link className="admin-sidebar-public-link" href="/" onClick={closeMenu}>
          <ExternalLink size={17} />
          <span>View public site</span>
        </Link>

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
