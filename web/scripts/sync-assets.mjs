// Prepares scraped assets for the app:
// - copies images (repo root /sprites and /animated) into public/
// - writes public/data/pokedex.json, a trimmed copy of data/pokemon.json
// Images already in public/ are skipped.
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const web = join(dirname(fileURLToPath(import.meta.url)), "..");
const root = join(web, "..");

for (const dir of ["sprites", "animated"]) {
  const src = join(root, dir);
  if (!existsSync(src)) {
    console.warn(`[sync-assets] ${src} not found; run scrape_pokemon.py first.`);
    continue;
  }
  cpSync(src, join(web, "public", dir), { recursive: true, force: false });
}

const dataFile = join(root, "data", "pokemon.json");
if (!existsSync(dataFile)) {
  console.warn(`[sync-assets] ${dataFile} not found; run scrape_pokemon.py first.`);
} else {
  const pokedex = JSON.parse(readFileSync(dataFile, "utf8")).map((p) => ({
    id: p.id,
    name: p.display_name,
    types: p.types,
    genus: p.genus,
    description: p.description,
    generation: p.generation,
    heightM: p.height_m,
    weightKg: p.weight_kg,
    abilities: p.abilities,
    stats: {
      hp: p.stats.hp,
      attack: p.stats.attack,
      defense: p.stats.defense,
      specialAttack: p.stats["special-attack"],
      specialDefense: p.stats["special-defense"],
      speed: p.stats.speed,
    },
    animated: Boolean(p.animated),
    cry: p.cry_url ?? null,
    evolvesFromId: p.evolves_from_id ?? null,
    isBaby: Boolean(p.is_baby),
    isLegendary: Boolean(p.is_legendary),
    isMythical: Boolean(p.is_mythical),
    captureRate: p.capture_rate,
    color: p.color,
    habitat: p.habitat,
  }));
  mkdirSync(join(web, "public", "data"), { recursive: true });
  writeFileSync(join(web, "public", "data", "pokedex.json"), JSON.stringify(pokedex));
}
