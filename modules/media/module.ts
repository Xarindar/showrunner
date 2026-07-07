import { AdminRole } from "@prisma/client";
import type { ShellModule } from "@/shell/module-types";

export const manifest = {
  id: "media",
  label: "Media",
  href: "/admin/modules/media",
  icon: "Image",
  order: 60,
  description: "Adapter-backed asset library with variants and private delivery.",
  layout: "standard",
  status: "active",
  enabledByDefault: true,
  readiness: {
    level: "partial",
    mode: "mixed",
    summary: "Repo assets, server-folder/S3/R2/Cloudflare Images uploads, metadata, focal points, signed private URLs, on-demand image variants, and archive/restore controls are live.",
    primaryGap: "Production virus scanning and private Cloudflare signed delivery remain pending."
  },
  capabilities: [
    { label: "Repo asset references", status: "live" },
    { label: "Server asset folder upload", status: "live", note: "Use MEDIA_ASSET_DIR for a persistent Railway volume or mounted storage path." },
    { label: "S3-compatible upload", status: "live", note: "Use Railway buckets or another S3-compatible storage endpoint." },
    { label: "R2 image upload", status: "live", note: "Requires R2 environment variables." },
    { label: "Cloudflare Images upload", status: "live", note: "Requires Cloudflare Images environment variables." },
    { label: "Folders, tags, focal point, usage context", status: "live" },
    { label: "Archive lifecycle", status: "live" },
    { label: "Signed variants", status: "live" },
    { label: "Responsive transforms", status: "live" }
  ],
  adminRoutes: ["/admin/modules/media"],
  dependencies: ["settings"],
  dataModels: ["MediaAsset", "MediaAssetVariant"],
  permissions: ["media:manage"],
  settingsSections: ["Media"],
  healthChecks: ["media-driver", "r2-env"],
  dataScope: {
    ownerKind: "staff-field",
    ownerField: "uploadedByStaffId",
    scopableRoles: [AdminRole.PHOTOGRAPHER]
  }
} satisfies ShellModule;
