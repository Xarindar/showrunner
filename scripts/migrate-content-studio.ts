import "dotenv/config";
import { readFile, writeFile } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import { prisma } from "../lib/prisma";
import { configRecord, readStudio } from "../modules/content/studio/state";
import { businessInfoExtensions, resolveBusinessInfo, validateBusinessInfo } from "../modules/content/studio/business-info";

// Additive migration: existing profile and hero data are never rewritten.
async function main() {
  const args = process.argv.slice(2);
  const option = (name: string) => { const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1]; };
  const siteId = option("--site");
  if (!siteId) throw new Error("Usage: tsx scripts/migrate-content-studio.ts --site SITE [--business FILE] [--apply --backup FILE] [--rollback FILE]");
  const current = await prisma.siteSettings.findUniqueOrThrow({ where: { siteId } });
  const rollback = option("--rollback");
  if (rollback) {
    const backup = JSON.parse(await readFile(rollback, "utf8"));
    if (backup.siteId !== siteId || !isDeepStrictEqual(current.publicContentConfig, backup.after)) throw new Error("Rollback refused: site mismatch or content changed after migration");
    if (!args.includes("--apply")) { console.log("Rollback dry run passed; add --apply to restore the saved content snapshot."); return; }
    const result = await prisma.siteSettings.updateMany({ where: { siteId, updatedAt: current.updatedAt }, data: { publicContentConfig: backup.before } });
    if (result.count !== 1) throw new Error("Concurrent update; rollback was not applied");
    console.log("Content snapshot restored."); return;
  }
  const studio = readStudio(current.publicContentConfig);
  if (studio.blocks["business-info"]) { console.log("Already migrated; no changes."); return; }
  const businessFile = option("--business");
  const supplied = businessFile ? JSON.parse(await readFile(businessFile, "utf8")) : {};
  // Existing scalar settings remain authoritative; conflicts require explicit data reconciliation before migration.
  for (const [key, value] of Object.entries({ businessName: current.businessName, email: current.contactEmail, timezone: current.timezone })) {
    if (supplied[key] !== undefined && supplied[key] !== value) throw new Error(`Reconcile conflicting ${key} in Business Info before migrating`);
  }
  const payload = { ...resolveBusinessInfo(current), ...supplied };
  validateBusinessInfo(payload);
  studio.blocks["business-info"] = { schemaVersion: 1, revision: 1, payload: businessInfoExtensions(payload), pageIds: [], updatedAt: new Date().toISOString(), updatedBy: "content-migration" };
  const after = JSON.parse(JSON.stringify({ ...configRecord(current.publicContentConfig), studio }));
  console.log(JSON.stringify({ siteId, mode: args.includes("--apply") ? "apply" : "dry-run", mappings: [{ source: "SiteSettings businessName/contactEmail/timezone", target: "business-info (shared authoritative fields)" }], legacyProfilesPreserved: Object.keys(configRecord(configRecord(current.publicContentConfig).profiles)), newInstances: ["business-info"] }, null, 2));
  if (!args.includes("--apply")) return;
  const backupPath = option("--backup");
  if (!backupPath) throw new Error("--backup FILE is required when applying migration");
  await writeFile(backupPath, JSON.stringify({ siteId, before: current.publicContentConfig, after }, null, 2), { flag: "wx" });
  const result = await prisma.siteSettings.updateMany({ where: { siteId, updatedAt: current.updatedAt }, data: { publicContentConfig: after } });
  if (result.count !== 1) throw new Error("Concurrent update; migration was not applied");
  console.log("Migration applied; backup written.");
}
main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
