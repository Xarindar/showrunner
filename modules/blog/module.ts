import type { ShellModule } from "@/shell/module-types";

export const manifest = {
  id: "blog",
  label: "Blog",
  href: "/admin/modules/blog",
  icon: "BookOpen",
  order: 22,
  navigation: { category: "website" },
  description: "Long-form stories with rich typography, inline media, and separate listing and article imagery.",
  layout: "standard",
  status: "active",
  enabledByDefault: true,
  readiness: {
    level: "live",
    mode: "live",
    summary: "Drafting, rich-text editing, publishing, imagery, and public delivery are live.",
    primaryGap: ""
  },
  capabilities: [
    { label: "Rich-text story editor", status: "live" },
    { label: "Inline images and emoji", status: "live" },
    { label: "Thumbnail and article header", status: "live" },
    { label: "Draft and publish workflow", status: "live" }
  ],
  adminRoutes: ["/admin/modules/blog"],
  publicRoutes: ["/api/public/v1/blog", "/api/public/v1/blog/[slug]"],
  dependencies: ["media"],
  dataModels: ["BlogPost"],
  permissions: ["blog:manage"],
  settingsSections: ["Blog", "SEO"],
  healthChecks: ["published-posts"]
} satisfies ShellModule;
