"use client";

import Link from "next/link";
import Image from "next/image";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ExternalLink,
  GripVertical,
  LogOut,
  Menu,
  Pencil,
  Settings,
  UserRound,
  X
} from "lucide-react";
import type { AdminRole } from "@prisma/client";
import { usePathname } from "next/navigation";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { moduleIcons, moduleRegistry, type ModuleId } from "@/shell/modules";
import {
  collapsibleModuleNavigationCategories,
  movableModuleNavigationCategories,
  type AdminModuleNavigationLayoutItem,
  type CollapsibleModuleNavigationCategory,
  type MovableModuleNavigationCategory
} from "@/shell/module-navigation";
import { groupAdminModuleNavigationLayout, moveAdminModuleNavigationItem } from "@/shell/admin-navigation-layout";
import type { ModuleStatus, ShellModule } from "@/shell/module-types";
import { useAdminMobileHeaderContext } from "@/shell/admin-mobile-header";
import { logoutAction } from "@/app/admin/(protected)/actions";
import { saveAdminModuleNavigationAction } from "@/app/admin/(protected)/navigation-actions";
import { Button } from "@/components/ui";
import { useEffect, useRef, useState, useTransition, type KeyboardEvent, type PointerEvent } from "react";

type AdminSidebarProps = {
  businessName: string;
  enabledModules: ModuleId[];
  logoUrl: string;
  navigationLayout: AdminModuleNavigationLayoutItem[];
  userEmail: string;
  userRole: AdminRole;
};

type NavigationSaveState = "idle" | "saving" | "saved" | "error";

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
  editing,
  enabledModules,
  item,
  onKeyboardMove,
  onMoveStart,
  pathname,
  showIcon = true
}: {
  closeMenu: () => void;
  editing: boolean;
  enabledModules: ModuleId[];
  item: ShellModule;
  onKeyboardMove: (moduleId: string, event: KeyboardEvent<HTMLButtonElement>) => void;
  onMoveStart: (moduleId: string, event: PointerEvent<HTMLButtonElement>) => void;
  pathname: string;
  showIcon?: boolean;
}) {
  const Icon = moduleIcons[item.icon];
  const enabled = enabledModules.includes(item.id as ModuleId);
  const isFuture = (item.status as ModuleStatus) === "future";
  const isActive = moduleIsActive(pathname, item);
  const label = item.id === "dashboard" ? "Home" : item.label;
  const content = !enabled || isFuture ? (
    <span className="disabled-link" title={isFuture ? "Future module" : "Disabled"}>
      {showIcon ? <Icon size={17} /> : null}
      {label}
    </span>
  ) : editing ? (
    <span className={isActive ? "active" : undefined}>
      {showIcon ? <Icon size={17} /> : null}
      {label}
    </span>
  ) : (
    <Link aria-current={isActive ? "page" : undefined} className={isActive ? "active" : undefined} href={item.href} onClick={closeMenu}>
      {showIcon ? <Icon size={17} /> : null}
      {label}
    </Link>
  );

  return (
    <div className={`admin-nav-module-row${editing ? " is-editing" : ""}`} data-admin-nav-module-id={item.id}>
      {editing ? (
        <button
          aria-label={`Move ${label}. Use arrow keys to reorder or move between sections.`}
          className="admin-nav-drag-handle"
          onKeyDown={(event) => onKeyboardMove(item.id, event)}
          onPointerDown={(event) => onMoveStart(item.id, event)}
          title={`Move ${label}`}
          type="button"
        >
          <GripVertical aria-hidden="true" size={15} />
        </button>
      ) : null}
      {content}
    </div>
  );
}

function SidebarNavGroup({
  closeMenu,
  editing,
  enabledModules,
  group,
  items,
  onKeyboardMove,
  onMoveStart,
  pathname
}: {
  closeMenu: () => void;
  editing: boolean;
  enabledModules: ModuleId[];
  group: CollapsibleModuleNavigationCategory;
  items: ShellModule[];
  onKeyboardMove: (moduleId: string, event: KeyboardEvent<HTMLButtonElement>) => void;
  onMoveStart: (moduleId: string, event: PointerEvent<HTMLButtonElement>) => void;
  pathname: string;
}) {
  const isActive = items.some((item) => moduleIsActive(pathname, item));
  const [expanded, setExpanded] = useState(isActive);
  const GroupIcon = group.icon;

  if (!items.length && !editing) return null;

  return (
    <div className={`admin-nav-group${editing ? " is-drop-zone" : ""}`} data-admin-nav-category={group.id}>
      <button
        aria-controls={`admin-nav-${group.id}`}
        aria-expanded={editing || expanded}
        className={isActive ? "active" : undefined}
        onClick={() => {
          if (!editing) setExpanded((current) => !current);
        }}
        type="button"
      >
        <GroupIcon size={17} />
        <span>{group.label}</span>
        <ChevronDown className="admin-nav-chevron" size={15} />
      </button>
      {editing || expanded ? (
        <div className="admin-subnav" id={`admin-nav-${group.id}`}>
          {items.map((item) => (
            <SidebarModuleLink
              closeMenu={closeMenu}
              editing={editing}
              enabledModules={enabledModules}
              item={item}
              key={item.id}
              onKeyboardMove={onKeyboardMove}
              onMoveStart={onMoveStart}
              pathname={pathname}
              showIcon={false}
            />
          ))}
          {editing && !items.length ? <span className="admin-nav-empty-drop">Drop a module here</span> : null}
        </div>
      ) : null}
    </div>
  );
}

export function AdminSidebar({ businessName, enabledModules, logoUrl, navigationLayout, userEmail, userRole }: AdminSidebarProps) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draggedModuleId, setDraggedModuleId] = useState<string | null>(null);
  const [layoutItems, setLayoutItems] = useState(() => groupAdminModuleNavigationLayout(navigationLayout));
  const [saveState, setSaveState] = useState<NavigationSaveState>("idle");
  const [, startTransition] = useTransition();
  const layoutRef = useRef(layoutItems);
  const lastSavedLayoutRef = useRef(layoutItems);
  const saveQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  const saveRequestRef = useRef(0);
  const saveStateTimerRef = useRef<number | null>(null);
  const mobileHeaderContext = useAdminMobileHeaderContext();
  const activeModule = moduleRegistry.find((item) => moduleIsActive(pathname, item));
  const resolvedMobileHeader = mobileHeaderContext ?? (activeModule ? { title: activeModule.label } : null);
  const canUpdateSettings = hasAdminPermission({ role: userRole }, "settings:update");
  const permittedModuleIds = new Set(moduleRegistry.filter(
    (item) =>
      item.id !== "settings" &&
      (!item.permissions?.length || item.permissions.some((permission) => hasAdminPermission({ role: userRole }, permission)))
  ).map((item) => item.id));
  const modulesById = new Map(moduleRegistry.map((item) => [item.id, item]));
  const visibleNavigationItems = layoutItems.filter((item) => permittedModuleIds.has(item.moduleId));
  const primaryModules = visibleNavigationItems
    .filter((item) => item.category === "primary")
    .map((item) => modulesById.get(item.moduleId))
    .filter((item): item is ShellModule => Boolean(item));

  const closeMenu = () => setMenuOpen(false);

  useEffect(() => {
    return () => {
      if (saveStateTimerRef.current) window.clearTimeout(saveStateTimerRef.current);
    };
  }, []);

  function updateLayout(nextLayout: AdminModuleNavigationLayoutItem[]) {
    layoutRef.current = nextLayout;
    setLayoutItems(nextLayout);
  }

  function persistLayout(nextLayout: AdminModuleNavigationLayoutItem[]) {
    if (saveStateTimerRef.current) window.clearTimeout(saveStateTimerRef.current);
    const requestId = ++saveRequestRef.current;
    setSaveState("saving");

    startTransition(() => {
      const request = saveQueueRef.current
        .catch(() => undefined)
        .then(() => saveAdminModuleNavigationAction(nextLayout));
      saveQueueRef.current = request;

      void request
        .then((savedLayout) => {
          lastSavedLayoutRef.current = savedLayout;
          if (requestId !== saveRequestRef.current) return;
          setSaveState("saved");
          saveStateTimerRef.current = window.setTimeout(() => setSaveState("idle"), 1800);
        })
        .catch((error) => {
          console.error("[admin-navigation-save-failed]", error);
          if (requestId !== saveRequestRef.current) return;
          updateLayout(lastSavedLayoutRef.current);
          setSaveState("error");
        });
    });
  }

  function beginMove(moduleId: string, event: PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    setDraggedModuleId(moduleId);
    const startLayout = layoutRef.current;
    let moved = false;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "grabbing";
    document.body.style.userSelect = "none";

    const handlePointerMove = (moveEvent: globalThis.PointerEvent) => {
      const target = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY);
      const categoryElement = target instanceof Element ? (target.closest("[data-admin-nav-category]") as HTMLElement | null) : null;
      const category = categoryElement?.dataset.adminNavCategory;
      if (!category || !movableModuleNavigationCategories.includes(category as MovableModuleNavigationCategory)) return;

      const moduleElement = target instanceof Element ? (target.closest("[data-admin-nav-module-id]") as HTMLElement | null) : null;
      const overModuleId = moduleElement?.dataset.adminNavModuleId;
      if (overModuleId === moduleId) return;
      const bounds = moduleElement?.getBoundingClientRect();
      const placeAfter = bounds ? moveEvent.clientY > bounds.top + bounds.height / 2 : false;
      const nextLayout = moveAdminModuleNavigationItem(
        layoutRef.current,
        moduleId,
        category as MovableModuleNavigationCategory,
        overModuleId,
        placeAfter
      );
      if (nextLayout.every((item, index) => item.moduleId === layoutRef.current[index]?.moduleId && item.category === layoutRef.current[index]?.category)) {
        return;
      }
      moved = true;
      updateLayout(nextLayout);
    };

    const finishMove = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", finishMove);
      window.removeEventListener("pointercancel", cancelMove);
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      setDraggedModuleId(null);
      if (moved) persistLayout(layoutRef.current);
    };

    const cancelMove = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", finishMove);
      window.removeEventListener("pointercancel", cancelMove);
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      setDraggedModuleId(null);
      updateLayout(startLayout);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", finishMove, { once: true });
    window.addEventListener("pointercancel", cancelMove, { once: true });
  }

  function keyboardMove(moduleId: string, event: KeyboardEvent<HTMLButtonElement>) {
    const current = layoutRef.current;
    const active = current.find((item) => item.moduleId === moduleId);
    if (!active || !["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault();

    const categoryIndex = movableModuleNavigationCategories.indexOf(active.category);
    const categoryItems = current.filter((item) => item.category === active.category);
    const itemIndex = categoryItems.findIndex((item) => item.moduleId === moduleId);
    let nextLayout = current;

    if (event.key === "ArrowUp" && itemIndex > 0) {
      nextLayout = moveAdminModuleNavigationItem(current, moduleId, active.category, categoryItems[itemIndex - 1].moduleId);
    } else if (event.key === "ArrowDown" && itemIndex < categoryItems.length - 1) {
      nextLayout = moveAdminModuleNavigationItem(current, moduleId, active.category, categoryItems[itemIndex + 1].moduleId, true);
    } else if (event.key === "ArrowLeft" && categoryIndex > 0) {
      nextLayout = moveAdminModuleNavigationItem(current, moduleId, movableModuleNavigationCategories[categoryIndex - 1]);
    } else if (event.key === "ArrowRight" && categoryIndex < movableModuleNavigationCategories.length - 1) {
      nextLayout = moveAdminModuleNavigationItem(current, moduleId, movableModuleNavigationCategories[categoryIndex + 1]);
    }

    if (nextLayout === current) return;
    updateLayout(nextLayout);
    persistLayout(nextLayout);
  }

  const saveStatus =
    saveState === "saving"
      ? "Saving navigation"
      : saveState === "saved"
        ? "Navigation saved"
        : saveState === "error"
          ? "Navigation could not be saved"
          : "";

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
          <nav className={`admin-nav${draggedModuleId ? " is-dragging" : ""}`} aria-label="Admin modules">
            <div className="admin-nav-customize">
              <button
                aria-pressed={editing}
                onClick={() => setEditing((current) => !current)}
                type="button"
              >
                {editing ? <Check aria-hidden="true" size={15} /> : <Pencil aria-hidden="true" size={14} />}
                <span>{editing ? "Done" : "Customize"}</span>
              </button>
              {saveStatus ? (
                <span className={`admin-navigation-save-state is-${saveState}`} aria-live="polite">
                  {saveStatus}
                </span>
              ) : null}
            </div>
            {editing ? <p className="admin-navigation-edit-hint">Drag modules between sections, or use the arrow keys on a move handle.</p> : null}
            <div
              className={`admin-nav-primary${editing ? " is-drop-zone" : ""}${draggedModuleId ? " is-dragging" : ""}`}
              data-admin-nav-category="primary"
            >
              {editing ? <span className="admin-nav-section-label">Top level</span> : null}
              {primaryModules.map((item) => (
                <SidebarModuleLink
                  closeMenu={closeMenu}
                  editing={editing}
                  enabledModules={enabledModules}
                  item={item}
                  key={item.id}
                  onKeyboardMove={keyboardMove}
                  onMoveStart={beginMove}
                  pathname={pathname}
                />
              ))}
              {editing && !primaryModules.length ? <span className="admin-nav-empty-drop">Drop a module here</span> : null}
            </div>
            <div className="admin-nav-secondary">
              {collapsibleModuleNavigationCategories.map((group) => (
                <SidebarNavGroup
                  closeMenu={closeMenu}
                  editing={editing}
                  enabledModules={enabledModules}
                  group={group}
                  items={visibleNavigationItems
                    .filter((item) => item.category === group.id)
                    .map((item) => modulesById.get(item.moduleId))
                    .filter((item): item is ShellModule => Boolean(item))}
                  key={`${group.id}:${pathname}`}
                  onKeyboardMove={keyboardMove}
                  onMoveStart={beginMove}
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
