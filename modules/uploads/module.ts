import type { ShellModule } from "@/shell/module-types";

export const manifest = {
  id: "uploads", label: "Client uploads", href: "/admin/modules/uploads", icon: "Image", order: 61,
  navigation: { category: "primary" }, description: "Private project upload links and original-file downloads.",
  layout: "standard", status: "active", enabledByDefault: true,
  readiness: { level: "live", mode: "live", summary: "Expiring upload links, private originals, and authenticated downloads." },
  permissions: ["uploads:manage"], dataModels: ["UploadRequest", "ClientUpload"],
  adminRoutes: ["/admin/modules/uploads"], publicRoutes: ["/uploads", "/uploads/[token]"]
} satisfies ShellModule;
