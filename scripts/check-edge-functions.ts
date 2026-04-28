#!/usr/bin/env -S deno run --allow-read --allow-run
// CI guard: parse/typecheck every edge function so syntax errors like the
// `matchDateIso` collision in Phase 1 cannot reach prod again.
// Usage: deno run --allow-read --allow-run scripts/check-edge-functions.ts
import { walk } from "https://deno.land/std@0.224.0/fs/walk.ts";

const failures: { file: string; stderr: string }[] = [];
let total = 0;

for await (const entry of walk("supabase/functions", {
  exts: [".ts"],
  match: [/\/index\.ts$/],
})) {
  if (entry.path.includes("/_shared/")) continue;
  total++;
  const cmd = new Deno.Command("deno", {
    args: ["check", "--no-lock", entry.path],
    stderr: "piped",
    stdout: "piped",
  });
  const { code, stderr } = await cmd.output();
  if (code !== 0) {
    failures.push({ file: entry.path, stderr: new TextDecoder().decode(stderr) });
  }
}

if (failures.length) {
  console.error(`❌ ${failures.length}/${total} edge functions failed deno check:\n`);
  for (const f of failures) {
    console.error(`--- ${f.file} ---\n${f.stderr}\n`);
  }
  Deno.exit(1);
}
console.log(`✅ All ${total} edge functions parse cleanly.`);
