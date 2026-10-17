import Link from "next/link";

export function SettingsNav({ active }: { active: "dashboard" | "modules" }) {
  return <nav className="admin-settings-nav" aria-label="Settings sections">
    <Link aria-current={active === "dashboard" ? "page" : undefined} href="/admin/modules/settings">General</Link>
    <Link aria-current={active === "modules" ? "page" : undefined} href="/admin/modules/settings/modules">Modules</Link>
  </nav>;
}
