import "server-only";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { ZipArchive } from "archiver";
import { deleteProofArchive, openPrivateOriginal, storeProofArchive } from "@/lib/media";
import { prisma } from "@/lib/prisma";
import { getReleasedProofBundle } from "./purchases";

export async function queueProofBundle(purchaseId: string, accessId: string, retry: boolean) {
  await prisma.portfolioProofBundle.upsert({ where: { purchaseId }, create: { purchaseId, accessId }, update: {} });
  await prisma.portfolioProofBundle.updateMany({
    where: { purchaseId, state: { in: retry ? ["QUEUED", "FAILED"] : ["QUEUED"] } },
    data: { state: "QUEUED", accessId }
  });
}

let working = false;
export async function processProofBundles() {
  if (working) return;
  working = true;
  try {
    const where = { OR: [{ state: "QUEUED" }, { state: "BUILDING", leaseUntil: { lt: new Date() } }] };
    const job = await prisma.portfolioProofBundle.findFirst({ where, orderBy: { purchaseId: "asc" }, include: { purchase: { select: { siteId: true } } } });
    if (!job) return;
    const leaseUntil = new Date(Date.now() + 15 * 60_000);
    const claim = { purchaseId: job.purchaseId, leaseUntil, state: "BUILDING" };
    if (!(await prisma.portfolioProofBundle.updateMany({ where: { ...where, purchaseId: job.purchaseId }, data: claim })).count) return;
    const access = await prisma.portfolioGalleryAccess.findUnique({ where: { id: job.accessId }, select: { accessToken: true } });
    const selection = access && await getReleasedProofBundle(access.accessToken, job.purchase.siteId);
    if (!selection || selection.purchaseId !== job.purchaseId || selection.accessId !== job.accessId) {
      await prisma.portfolioProofBundle.updateMany({ where: claim, data: { state: "FAILED", leaseUntil: null } });
      return;
    }

    const driver = selection.assets[0].asset.driver;
    const key = `proof-zips/${job.purchaseId}/${randomUUID()}.zip`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12 * 60_000);
    const zip = new ZipArchive({ store: true, forceZip64: true });
    controller.signal.addEventListener("abort", () => zip.destroy(new Error("Archive interrupted")), { once: true });
    zip.on("warning", error => zip.destroy(error));
    zip.on("error", () => controller.abort());
    const upload = storeProofArchive(driver, key, zip, controller);
    void upload.catch(() => controller.abort());
    try {
      for (const [index, { asset }] of selection.assets.entries()) {
        const input = await openPrivateOriginal(asset, controller.signal);
        const name = asset.filename.replace(/[^\w .-]/g, "_").trim().slice(-140);
        const entry = once(zip, "entry", { signal: controller.signal });
        input.on("error", error => zip.destroy(error));
        zip.append(input, { name: `${String(index + 1).padStart(3, "0")}-${name || "photo"}` });
        await entry;
      }
      await zip.finalize();
      await upload;
      const current = await getReleasedProofBundle(access.accessToken, job.purchase.siteId);
      if (!current || current.purchaseId !== job.purchaseId ||
        !(await prisma.portfolioProofBundle.updateMany({ where: claim, data: { state: "READY", leaseUntil: null, driver, key, sizeBytes: BigInt(zip.pointer()) } })).count) {
        throw new Error("Delivery changed during preparation");
      }
    } catch {
      controller.abort();
      await upload.catch(() => {});
      await deleteProofArchive(driver, key).catch(() => {});
      await prisma.portfolioProofBundle.updateMany({ where: claim, data: { state: "FAILED", leaseUntil: null } });
    } finally {
      clearTimeout(timeout);
    }
  } finally {
    working = false;
  }
}

export function startProofBundles() {
  const timer = setInterval(() => {
    void processProofBundles().catch(() => console.error("[proof-delivery] bundle processing unavailable"));
  }, 5000);
  timer.unref();
}
