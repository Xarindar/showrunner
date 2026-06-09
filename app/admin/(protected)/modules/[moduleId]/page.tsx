import { notFound } from "next/navigation";
import { loadModulePage } from "@/shell/module-pages";
import { getModule } from "@/shell/modules";
import { getSiteSettings } from "@/lib/site";

export const dynamic = "force-dynamic";

type AdminModulePageProps = {
  params: Promise<{ moduleId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
};

export default async function AdminModulePage({ params, searchParams }: AdminModulePageProps) {
  const { moduleId } = await params;
  const [selectedModule, settings] = await Promise.all([Promise.resolve(getModule(moduleId)), getSiteSettings()]);

  if (!selectedModule || selectedModule.status !== "active") notFound();
  if (selectedModule.id !== "settings" && !settings.enabledModuleIds.includes(selectedModule.id)) notFound();

  const ModulePage = await loadModulePage(selectedModule.id);
  if (!ModulePage) notFound();

  return <ModulePage searchParams={searchParams} />;
}
