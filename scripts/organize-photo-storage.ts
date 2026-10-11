import "dotenv/config";
import { prisma } from "../lib/prisma";
import { organizeStoredPhoto } from "../lib/media";

async function main() {
  const siteId = process.env.PHOTO_SITE_ID;
  if (!siteId) throw new Error("PHOTO_SITE_ID is required");
  const photos = await prisma.mediaAsset.findMany({ where: { siteId, deletedAt: null, mimeType: { startsWith: "image/" }, driver: { in: ["S3", "R2"] } }, orderBy: { createdAt: "asc" } });
  let completed = 0;
  for (const photo of photos) {
    await organizeStoredPhoto(photo);
    completed++;
    console.log(`${completed}/${photos.length} ${photo.id}`);
  }
  console.log(`Organized ${completed} photos`);
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
