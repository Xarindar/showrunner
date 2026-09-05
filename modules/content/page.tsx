import { requireAdmin } from "@/lib/auth";
import { getSiteSettings } from "@/lib/site";
import { prisma } from "@/lib/prisma";
import { resolveContentManifest } from "@/clients/content-manifests";
import LegacyContentPage from "@/clients/cottage616/content-page";
import { StudioEditor } from "./studio/editor";
import { emptyPayload } from "./studio/registry";
import { readStudio } from "./studio/state";
import { resolveBusinessInfo } from "./studio/business-info";
import { blockDependenciesAvailable } from "./studio/manifest";

export const dynamic = "force-dynamic";
export default async function ContentPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string; profile?: string }> }) {
  await requireAdmin("content:manage");
  const settings = await getSiteSettings();
  const manifest = resolveContentManifest(settings.siteId, settings.publicContentConfig);
  const studio = readStudio(settings.publicContentConfig);
  const services = manifest.blocks.some(block => block.source === "services") ? await prisma.service.findMany({ where: { siteId: settings.siteId, isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }) : [];
  return <div className="stack content-studio">
    {manifest.legacyProfiles ? <LegacyContentPage searchParams={searchParams} /> : <header className="page-header"><div><h1>Content</h1><p>Edit the content available on your website.</p></div></header>}
    {manifest.blocks.map(block => {
      if (!blockDependenciesAvailable(block, settings.enabledModuleIds)) return <section key={block.id}><h2>{block.label}</h2><p>A required integration is unavailable. Contact your site administrator.</p></section>;
      const stored = studio.blocks[block.id];
      const payload = block.type === "business" ? resolveBusinessInfo(settings) : stored?.payload || emptyPayload(block.type);
      return <StudioEditor key={block.id} block={block} pages={manifest.pages} initialPayload={payload} initialRevision={stored?.revision || 0} initialPages={stored?.pageIds || block.pageIds} choices={services.map(service => ({ id: service.id, label: service.name }))} />;
    })}
  </div>;
}
