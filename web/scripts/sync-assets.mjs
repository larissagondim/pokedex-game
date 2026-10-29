// Copies the scraped sprites (repo root /sprites) into public/ so Next serves
// them. Skips files that are already there.
import { cpSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const web = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(web, "..", "sprites");
const dest = join(web, "public", "sprites");

if (!existsSync(src)) {
  console.warn(`[sync-assets] ${src} not found; run scrape_pokemon.py first.`);
} else {
  cpSync(src, dest, { recursive: true, force: false });
}
