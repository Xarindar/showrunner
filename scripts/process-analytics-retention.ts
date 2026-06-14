import "dotenv/config";
import { sweepAnalyticsRetention } from "../lib/analytics/retention";
import { prisma } from "../lib/prisma";

async function main() {
  const result = await sweepAnalyticsRetention();
  console.log(JSON.stringify(result));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
