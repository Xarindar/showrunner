import type { ShellModule } from "@/shell/module-types";

export const manifest = {
  id: "media",
  label: "Media",
  href: "/admin/modules/media",
  icon: "Image",
  order: 60,
  description: "Repo assets and optional R2 uploads.",
  layout: "standard",
  status: "active",
  enabledByDefault: true,
  readiness: {
    level: "partial",
    mode: "mixed",
    summary: "Repo assets, R2 image uploads, metadata, folders, tags, private flags, and archive/restore lifecycle controls are live.",
    primaryGap: "Generated variants, focal points, signed storage URLs, and private storage drivers are still pending."
  },
  capabilities: [
    { label: "Repo asset references", status: "live" },
    { label: "R2 image upload", status: "live", note: "Requires R2 environment variables." },
    { label: "Folders and tags", status: "live" },
    { label: "Archive lifecycle", status: "live" },
    { label: "Signed variants", status: "planned" }
  ],
  adminRoutes: ["/admin/modules/media"],
  dependencies: ["settings"],
  dataModels: ["MediaAsset"],
  permissions: ["media.read", "media.write"],
  settingsSections: ["Media"],
  healthChecks: ["media-driver", "r2-env"]
} satisfies ShellModule;
