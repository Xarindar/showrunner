import "dotenv/config";
import { positiveIntegerEnv } from "../lib/env";
import { processAutomationRuns } from "../lib/events/automation-runs";
import { prisma } from "../lib/prisma";

async function main() {
  const limit = positiveIntegerEnv("AUTOMATION_WORKER_LIMIT", 25);
  const result = await processAutomationRuns({ limit });
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
