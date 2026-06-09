import "dotenv/config";
import { positiveIntegerEnv } from "../lib/env";
import { processWebhookDeliveries } from "../lib/events/webhook-delivery";
import { prisma } from "../lib/prisma";

async function main() {
  const limit = positiveIntegerEnv("WEBHOOK_WORKER_LIMIT", 25);
  const result = await processWebhookDeliveries({ limit });
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
