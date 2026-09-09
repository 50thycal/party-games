import { spawn } from "node:child_process";
import path from "node:path";

// The supervised visual-test service forwards Vite-style host flags. Translate
// only those flags for Next.js; ordinary `npm run dev` remains `next dev`.
const forwarded = process.argv.slice(2);
const args = [];
for (let i = 0; i < forwarded.length; i++) {
  const arg = forwarded[i];
  if (arg === "--strictPort") continue;
  if (arg === "--host") {
    args.push("--hostname", forwarded[++i]);
    continue;
  }
  if (arg.startsWith("--host=")) {
    args.push(`--hostname=${arg.slice("--host=".length)}`);
    continue;
  }
  args.push(arg);
}

const executable = path.join(process.cwd(), "node_modules", ".bin", process.platform === "win32" ? "next.cmd" : "next");
const child = spawn(executable, ["dev", ...args], { stdio: "inherit" });
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});
