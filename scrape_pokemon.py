#!/usr/bin/env python3
"""Baixa dados e sprites de todos os Pokémon da PokéAPI.

Gera:
  data/pokemon.json        lista com todos os Pokémon (formas padrão)
  sprites/<id>.png         sprite pequeno (front_default)
  artwork/<id>.png         artwork oficial em alta resolução
  animated/<id>.gif        sprite animado (estilo Showdown), quando existir

É retomável: arquivos de imagem já baixados são pulados e as respostas da API
ficam em cache em data/cache/, então pode rodar de novo sem refazer tudo.

Uso:
  python3 scrape_pokemon.py            # todos
  python3 scrape_pokemon.py --limit 151
  python3 scrape_pokemon.py --workers 4 --no-images
"""
import argparse
import json
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

API = "https://pokeapi.co/api/v2"
ROOT = Path(__file__).parent
DATA_DIR = ROOT / "data"
CACHE_DIR = DATA_DIR / "cache"
SPRITES_DIR = ROOT / "sprites"
ARTWORK_DIR = ROOT / "artwork"
ANIMATED_DIR = ROOT / "animated"
USER_AGENT = "pokedex-game-scraper/1.0"

# ids >= 10000 na PokéAPI são formas alternativas (mega, regionais, etc.)
MAX_DEFAULT_ID = 10000


def http_get(url, retries=4):
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=30) as resp:
                return resp.read()
        except urllib.error.HTTPError as e:
            if e.code == 404:
                raise
            err = e
        except (urllib.error.URLError, TimeoutError) as e:
            err = e
        time.sleep(2**attempt)
    raise err


def get_json(path):
    """GET na API com cache em disco. `path` é tipo 'pokemon/25'."""
    cache_file = CACHE_DIR / (path.replace("/", "_") + ".json")
    if cache_file.exists():
        return json.loads(cache_file.read_text())
    data = json.loads(http_get(f"{API}/{path}"))
    cache_file.write_text(json.dumps(data))
    return data


def download(url, dest):
    if not url or dest.exists():
        return bool(url)
    try:
        dest.write_bytes(http_get(url))
        return True
    except urllib.error.HTTPError:
        return False


def pick_text(entries, key, lang, first_only=True):
    out = [e[key] for e in entries if e["language"]["name"] == lang]
    return out[0] if out and first_only else out


def clean(text):
    return " ".join(text.replace("\f", " ").replace("\n", " ").split())


def build_pokemon(pid, images):
    p = get_json(f"pokemon/{pid}")
    s = get_json(f"pokemon-species/{p['species']['name']}")

    other = p["sprites"]["other"]
    artwork_url = other["official-artwork"]["front_default"]
    animated_url = (other.get("showdown") or {}).get("front_default")
    sprite_url = p["sprites"]["front_default"]

    if images:
        download(sprite_url, SPRITES_DIR / f"{pid}.png")
        download(artwork_url, ARTWORK_DIR / f"{pid}.png")
        download(animated_url, ANIMATED_DIR / f"{pid}.gif")

    display_name = pick_text(s["names"], "name", "en")
    genus = pick_text(s["genera"], "genus", "en")
    # a última entrada em inglês é a mais recente
    descriptions = pick_text(s["flavor_text_entries"], "flavor_text", "en", first_only=False)
    description = clean(descriptions[-1]) if descriptions else None

    return {
        "id": p["id"],
        "name": p["name"],
        "display_name": display_name,
        "genus": genus,
        "description": description,
        "types": [t["type"]["name"] for t in sorted(p["types"], key=lambda t: t["slot"])],
        "height_m": p["height"] / 10,
        "weight_kg": p["weight"] / 10,
        "base_experience": p["base_experience"],
        "stats": {st["stat"]["name"]: st["base_stat"] for st in p["stats"]},
        "abilities": [
            {"name": a["ability"]["name"], "hidden": a["is_hidden"]}
            for a in p["abilities"]
        ],
        "color": (s["color"] or {}).get("name"),
        "habitat": (s["habitat"] or {}).get("name"),
        "generation": s["generation"]["name"],
        "is_legendary": s["is_legendary"],
        "is_mythical": s["is_mythical"],
        "capture_rate": s["capture_rate"],
        "evolves_from": (s["evolves_from_species"] or {}).get("name"),
        "evolution_chain_id": int(s["evolution_chain"]["url"].rstrip("/").split("/")[-1]),
        "sprite": f"sprites/{pid}.png" if sprite_url else None,
        "artwork": f"artwork/{pid}.png" if artwork_url else None,
        "animated": f"animated/{pid}.gif" if animated_url else None,
        "sprite_url": sprite_url,
        "artwork_url": artwork_url,
        "animated_url": animated_url,
        "cry_url": (p.get("cries") or {}).get("latest"),
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--limit", type=int, help="só os N primeiros Pokémon")
    ap.add_argument("--workers", type=int, default=8)
    ap.add_argument("--no-images", action="store_true", help="não baixa sprites/artwork/animados")
    args = ap.parse_args()

    for d in (DATA_DIR, CACHE_DIR, SPRITES_DIR, ARTWORK_DIR, ANIMATED_DIR):
        d.mkdir(parents=True, exist_ok=True)

    listing = json.loads(http_get(f"{API}/pokemon?limit=100000"))
    ids = sorted(
        int(r["url"].rstrip("/").split("/")[-1]) for r in listing["results"]
    )
    ids = [i for i in ids if i < MAX_DEFAULT_ID]
    if args.limit:
        ids = ids[: args.limit]
    print(f"{len(ids)} Pokémon para processar")

    results, failed = {}, []
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = {pool.submit(build_pokemon, i, not args.no_images): i for i in ids}
        for n, fut in enumerate(as_completed(futures), 1):
            pid = futures[fut]
            try:
                results[pid] = fut.result()
            except Exception as e:  # noqa: BLE001 - queremos seguir mesmo com falhas isoladas
                failed.append(pid)
                print(f"\n[erro] #{pid}: {e}", file=sys.stderr)
            print(f"\r{n}/{len(ids)}", end="", flush=True)
    print()

    pokemon = [results[i] for i in sorted(results)]
    out = DATA_DIR / "pokemon.json"
    out.write_text(json.dumps(pokemon, ensure_ascii=False, indent=2))
    print(f"{len(pokemon)} Pokémon salvos em {out}")
    if failed:
        print(f"Falharam: {sorted(failed)} (rode de novo pra tentar outra vez)")
        sys.exit(1)


if __name__ == "__main__":
    main()
