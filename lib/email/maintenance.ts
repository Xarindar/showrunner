import { processEmailOutbox } from "./process";

export function startEmailOutbox() {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try { await processEmailOutbox(); }
    catch (error) { console.error("[email] automatic delivery unavailable", { name: error instanceof Error ? error.name : "UnknownError" }); }
    finally { running = false; }
  };
  void run();
  const timer = setInterval(() => { void run(); }, 60_000);
  timer.unref();
}
