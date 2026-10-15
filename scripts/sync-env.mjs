import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")];
    }),
);
for (const key of [
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  "MAPPA_STORE_SECRET",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
]) {
  if (!env[key]) throw new Error("Missing " + key);
  const result = spawnSync(
    "npx",
    [
      "--yes",
      "vercel@latest",
      "env",
      "add",
      key,
      "production,preview",
      "--yes",
      "--force",
      "--scope",
      "pierre-teodorescos-projects",
      "--project",
      "mappa",
      ...(key === "MAPPA_STORE_SECRET" ? ["--sensitive"] : []),
    ],
    { input: env[key], encoding: "utf8" },
  );
  if (result.status !== 0) {
    console.error(result.stderr);
    process.exit(1);
  }
  console.log("Configured " + key);
}
