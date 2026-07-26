/**
 * Dev server keeper — redémarre automatiquement `bun run dev` s'il meurt.
 * Plus robuste que le watcher bash car Bun gère mieux les signaux.
 */
import { spawn } from "bun";

console.log(`[keeper ${new Date().toISOString()}] starting dev server keeper...`);

let attempt = 0;
while (true) {
  attempt++;
  console.log(`\n[keeper ${new Date().toISOString()}] === attempt #${attempt} ===`);
  console.log(`[keeper] spawning bun run dev...`);

  const proc = spawn({
    cmd: ["bun", "run", "dev"],
    cwd: process.cwd(),
    stdout: "inherit",
    stderr: "inherit",
    stdin: "ignore",
    onExit(proc, exitCode, signalCode, error) {
      console.log(
        `[keeper ${new Date().toISOString()}] dev server exited: ` +
          `exitCode=${exitCode} signal=${signalCode} error=${error?.message ?? "none"}`
      );
    },
  });

  try {
    const exitCode = await proc.exited;
    console.log(`[keeper] dev server exited with code ${exitCode}`);
  } catch (e) {
    console.log(`[keeper] error waiting for dev server:`, e);
  }

  console.log("[keeper] restarting in 3s...");
  await new Promise((r) => setTimeout(r, 3000));
}
