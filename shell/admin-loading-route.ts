export function adminLoadingRoute(pathname: string) {
  const segments = pathname.split("/").filter(Boolean);
  const [section, detail, child] = segments.slice(segments[1] === "modules" ? 2 : 1);
  if (section === "services" || section === "scheduling") {
    if (detail === "categories") return { kind: "workspace", title: "Service categories" } as const;
    if (detail === "packages" && !child) return { kind: "packages", title: "Service bundles" } as const;
    if (detail) return { kind: "editor", title: detail === "packages" ? "Service bundle" : "Session type" } as const;
    return { kind: "services", title: "Session types" } as const;
  }
  if (section === "products" || section === "clients") {
    if (detail) return { kind: "editor", title: section === "clients" ? "Client" : "Product" } as const;
    return { kind: section, title: section === "clients" ? "Clients" : "Products" } as const;
  }
  if (section === "appointments") return { kind: detail ? "editor" : "calendar", title: "Appointment" } as const;
  if (section === "content") return { kind: "website", title: "Content" } as const;
  if (section === "media" || section === "portfolio") return { kind: "gallery", title: section === "media" ? "Media" : "Portfolio" } as const;
  if (section === "settings") return { kind: "editor", title: "Settings" } as const;
  return { kind: "workspace", title: section ? "" : "Home" } as const;
}
