import "dotenv/config";
import { prisma } from "../lib/prisma";
import { sweepBookingReminders } from "../lib/scheduling/booking-reminders";

async function main() {
  const result = await sweepBookingReminders();
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
