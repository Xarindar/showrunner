import "dotenv/config";
import { sweepAbandonedCarts } from "../lib/commerce/abandoned-carts";
import { prisma } from "../lib/prisma";

async function main() {
  const result = await sweepAbandonedCarts();
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
