import "dotenv/config";
import { positiveIntegerEnv } from "../lib/env";
import { processEmailOutbox } from "../lib/email/process";
import { prisma } from "../lib/prisma";

async function main() {
  const limit = positiveIntegerEnv("EMAIL_WORKER_LIMIT", 50);
  const result = await processEmailOutbox({ limit });
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
