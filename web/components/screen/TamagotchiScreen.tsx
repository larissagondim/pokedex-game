"use client";

import { useEffect, useRef, useState } from "react";
import { formatDexNumber, type Pokemon } from "@/data/pokedex";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import {
  type Action,
  dexOf,
  EGG_PRICE,
  evolutionLevel,
  levelOf,
  MAX_SLOTS,
  type Mood,
  moodOf,
  type Outcome,
  type Pet,
  stageOf,
  TREAT_PRICE,
  XP_PER_LEVEL,
} from "@/lib/tamagotchi";
import type { ItemId } from "@/lib/battle/engine";
import { type DeviceButton, useDeviceInput } from "@/stores/deviceInput";
import { ITEM_PRICES, useInventory } from "@/stores/inventory";
import { usePokedex } from "@/stores/pokedex";
import { useTamagotchi } from "@/stores/tamagotchi";
import { PetSprite } from "./PetSprite";
import styles from "./tamagotchi.module.css";

/** Above the main screen handler (10): this tab gets first say while active. */
const INPUT_PRIORITY = 11;
const REFRESH_MS = 10_000;
const REACTION_MS = 1600;

type MenuItem = Exclude<Action, "treat"> | "shop" | "release";
const MENU: MenuItem[] = ["feed", "play", "sleep", "train", "shop", "release"];

type ShopItem = "egg" | "treat" | ItemId;
const SHOP: { id: ShopItem; label: string; price: number }[] = [
  { id: "egg", label: "EGG", price: EGG_PRICE },
  { id: "treat", label: "TREAT", price: TREAT_PRICE },
  { id: "potion", label: "SUPER POTION", price: ITEM_PRICES.potion },
  { id: "fullheal", label: "FULL HEAL", price: ITEM_PRICES.fullheal },
];

/** Short-lived animation shown on the stage after something happens. */
type Reaction = "eat" | "play" | "train" | "sleep" | "evolve" | "hatch" | "pet" | "no";

const OUTCOME_REACTION: Partial<Record<Outcome, Reaction>> = {
  ate: "eat",
  treated: "eat",
  played: "play",
  trained: "train",
  "fell-asleep": "sleep",
  "woke-up": "pet",
};

interface Props {
  /** The tab is visible and the screen accepts input. */
  active: boolean;
  /** Shows text in the screen's dialog box. */
  onNotice: (text: string) => void;
}

const wrap = (i: number, n: number) => (n ? (i + n) % n : 0);

/** The TAMAGOTCHI tab: party of up to 5, stage with the selected Pokémon, actions. */
export function TamagotchiScreen({ active, onNotice }: Props) {
  const list = usePokedex((s) => s.list);
  const pets = useTamagotchi((s) => s.pets);
  const coins = useTamagotchi((s) => s.coins);
  const [slot, setSlot] = useState(0);
  const [menu, setMenu] = useState(0);
  const [confirmRelease, setConfirmRelease] = useState(false);
  /** The shop is open (in place of the stage), with its cursor. */
  const [shop, setShop] = useState<number | null>(null);
  const items = useInventory((s) => s.items);
  const [reaction, setReaction] = useState<{ kind: Reaction; key: number } | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const dex = dexOf(list);
  const pet: Pet | undefined = pets[Math.min(slot, pets.length - 1)];
  const species = pet?.dexId != null ? dex.byId.get(pet.dexId) : undefined;
  const nameOf = (p: Pet | undefined) => (p?.dexId != null ? (dex.byId.get(p.dexId)?.name ?? "???") : "Egg");

  // The secondary screen and the region music follow the selected party member.
  const focusedDexId = pet?.dexId ?? null;
  useEffect(() => {
    if (active && focusedDexId !== null) usePokedex.getState().focus(focusedDexId);
  }, [active, focusedDexId]);

  // Decay and egg hatching: on open and every few seconds while visible.
  useEffect(() => {
    if (list.length === 0) return;
    const refresh = () => {
      useTamagotchi.getState().refresh(list);
      setNow(Date.now());
    };
    refresh();
    const id = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(id);
  }, [list]);

  // Countdown for eggs.
  useEffect(() => {
    if (!pets.some((p) => p.dexId === null)) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [pets]);

  // Animate what just happened to the selected Pokémon.
  useEffect(
    () =>
      useTamagotchi.subscribe(({ event }, prev) => {
        if (!event || event === prev.event) return;
        const kind: Reaction | null =
          event.kind === "evolved" ? "evolve"
          : event.kind === "hatched" ? "hatch"
          : event.kind === "action"
            ? (OUTCOME_REACTION[event.outcome] ?? "no")
            : null;
        if (kind) setReaction({ kind, key: Date.now() });
        if (event.kind === "evolved" || event.kind === "hatched") {
          usePokedex.getState().playCry(event.kind === "evolved" ? event.to : event.dexId);
        }
      }),
    [],
  );
  useEffect(() => {
    if (!reaction) return;
    const id = setTimeout(() => setReaction(null), REACTION_MS);
    return () => clearTimeout(id);
  }, [reaction]);

  const buy = (item: ShopItem) => {
    const store = useTamagotchi.getState();
    if (item === "egg") return store.buyEgg();
    if (item === "treat") {
      if (!pet || pet.dexId === null) return onNotice("Pick a hatched Pokémon in your party (▲▼) to give it a treat.");
      return store.buyTreat(pet.uid, list);
    }
    if (useInventory.getState().buy(item)) {
      const name = SHOP.find((x) => x.id === item)!.label;
      onNotice(`You bought a ${name}! It goes in your battle bag (×${useInventory.getState().items[item]} extra).`);
    }
  };

  const run = (item: MenuItem) => {
    const store = useTamagotchi.getState();
    if (item === "shop") {
      setShop(0);
      return onNotice("SHOP! ▲▼ choose   A: buy   B: close");
    }
    if (!pet) return onNotice("Your party is empty. Adopt a Pokémon you caught from the LIST tab, or buy an egg in the SHOP.");
    if (item === "release") {
      if (!confirmRelease) {
        setConfirmRelease(true);
        return onNotice(`Release ${nameOf(pet).toUpperCase()}? A: yes   B: no`);
      }
      setConfirmRelease(false);
      store.release(pet.uid);
      setSlot((s) => Math.max(0, Math.min(s, pets.length - 2)));
      return;
    }
    if (pet.dexId === null) return onNotice(`It's an egg! It hatches in ${eggCountdown(pet, now)}.`);
    store.act(pet.uid, item, list);
  };

  const petIt = () => {
    if (!pet || pet.dexId === null) return;
    usePokedex.getState().playCry(pet.dexId);
    setReaction({ kind: "pet", key: Date.now() });
  };

  /** Returns true when consumed. */
  const handle = (button: DeviceButton): boolean => {
    if (button === "MENU" || button === "ZOOM") return false;
    if (shop !== null) {
      if (button === "UP" || button === "DOWN") setShop((c) => wrap((c ?? 0) + (button === "UP" ? -1 : 1), SHOP.length));
      else if (button === "A") buy(SHOP[shop].id);
      else if (button === "B") {
        setShop(null);
        onNotice("See you again!");
      }
      return true;
    }
    if (confirmRelease && button !== "A") {
      setConfirmRelease(false);
      onNotice("Phew! It stays with you.");
      return true;
    }
    switch (button) {
      case "UP":
      case "DOWN":
        setSlot((s) => wrap(s + (button === "UP" ? -1 : 1), pets.length));
        return true;
      case "LEFT":
      case "RIGHT":
        setMenu((m) => wrap(m + (button === "LEFT" ? -1 : 1), MENU.length));
        return true;
      case "A":
        run(MENU[menu]);
        return true;
      case "B":
        return false; // back to the list
    }
    return false;
  };

  const handler = useRef(handle);
  const activeRef = useRef(active);
  useEffect(() => {
    handler.current = handle;
    activeRef.current = active;
  });
  useEffect(
    () => useDeviceInput.getState().subscribe((button) => activeRef.current && handler.current(button), INPUT_PRIORITY),
    [],
  );

  const selected = pets.indexOf(pet as Pet);

  return (
    <div className={styles.tama}>
      <div className={styles.party}>
        <div className={styles.partyHeader}>
          <span>PARTY {pets.length}/{MAX_SLOTS}</span>
          <span className={styles.coins}>{coins}₽</span>
        </div>
        <ul>
          {Array.from({ length: MAX_SLOTS }, (_, i) => {
            const p = pets[i];
            return (
              <li key={p?.uid ?? `empty-${i}`} data-focused={i === selected} data-empty={!p} onClick={() => p && setSlot(i)}>
                <span className={styles.cursor}>{i === selected ? "▶" : ""}</span>
                {p ? <SlotIcon pet={p} /> : <span className={styles.slotIcon} />}
                <span className={styles.slotName}>{p ? nameOf(p).toUpperCase() : "— empty —"}</span>
                {p?.dexId != null && (
                  <span className={styles.slotLevel}>
                    {p.shiny && <Shiny />} Lv{levelOf(p.xp)}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <div className={styles.main}>
        {shop !== null ? (
          <Shop
            cursor={shop}
            coins={coins}
            owned={items}
            treatFor={species?.name.toUpperCase() ?? null}
            onPick={(i) => (i === shop ? buy(SHOP[i].id) : setShop(i))}
          />
        ) : pet ? (
          <>
            <Stage pet={pet} species={species} stage={species ? stageOf(species.id, dex) : 0} reaction={reaction} now={now} onPet={petIt} />
            <div className={styles.info}>
              <span className={styles.name}>
                {species ? `${formatDexNumber(species.id)} ${species.name.toUpperCase()}` : "EGG"}
                {pet.shiny && <Shiny />}
              </span>
              {species && <span className={styles.level}>Lv{levelOf(pet.xp)}</span>}
            </div>
            {pet.dexId !== null ? (
              <Needs pet={pet} evolvesAt={species ? evolutionLevel(species.id, dex) : null} />
            ) : (
              <p className={styles.eggText}>Hatching in {eggCountdown(pet, now)}</p>
            )}
          </>
        ) : (
          <div className={styles.emptyStage}>
            <p>No Pokémon yet.</p>
            <p>Adopt one you caught in battle from the LIST tab (open it, then A), or buy an egg in the SHOP.</p>
          </div>
        )}
        <div className={styles.menu} role="toolbar" aria-label="Actions">
          {MENU.map((item, i) => (
            <button
              key={item}
              type="button"
              data-focused={i === menu}
              onClick={() => {
                setMenu(i);
                run(item);
              }}
            >
              {item === "sleep" && pet?.asleep ? "WAKE" : item.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

const SHOP_INFO: Record<ShopItem, string> = {
  egg: "Hatches into a random Pokémon. 1 in 16 is shiny!",
  treat: "+40 FOOD, +25 JOY. Given right away.",
  potion: "Battle bag: restores 60 HP.",
  fullheal: "Battle bag: cures status and confusion.",
};

interface ShopProps {
  cursor: number;
  coins: number;
  /** Battle items bought so far (on top of the standard bag). */
  owned: Record<ItemId, number>;
  /** Who gets a treat (the selected party member), or null. */
  treatFor: string | null;
  onPick: (index: number) => void;
}

/** Eggs, treats and battle items, paid with the party's coins. */
function Shop({ cursor, coins, owned, treatFor, onPick }: ShopProps) {
  const current = SHOP[cursor];
  return (
    <div className={styles.shop}>
      <div className={styles.partyHeader}>
        <span>SHOP</span>
        <span className={styles.coins}>{coins}₽</span>
      </div>
      <ul role="menu" aria-label="Shop">
        {SHOP.map((item, i) => (
          <li key={item.id} role="menuitem" data-focused={i === cursor} data-short={coins < item.price} onClick={() => onPick(i)}>
            <span className={styles.cursor}>{i === cursor ? "▶" : ""}</span>
            <span>{item.label}</span>
            <small>{item.id === "potion" || item.id === "fullheal" ? `×${owned[item.id]}` : ""}</small>
            <span>{item.price}₽</span>
          </li>
        ))}
      </ul>
      <p className={styles.shopInfo}>
        {current.id === "treat" && treatFor ? `For ${treatFor}: ` : ""}
        {SHOP_INFO[current.id]}
      </p>
    </div>
  );
}

function eggCountdown(pet: Pet, now: number) {
  const s = Math.max(0, Math.ceil(((pet.hatchAt ?? now) - now) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** The mark next to a shiny Pokémon's name. */
function Shiny() {
  return (
    <span className={styles.shiny} role="img" aria-label="shiny" title="Shiny">
      {" ✦"}
    </span>
  );
}

function SlotIcon({ pet }: { pet: Pet }) {
  if (pet.dexId === null) return <span className={styles.slotIcon + " " + styles.miniEgg} aria-label="Egg" />;
  return <PetSprite className={styles.slotIcon} dexId={pet.dexId} shiny={pet.shiny} />;
}

const BARS: { key: "fullness" | "happiness" | "energy"; label: string }[] = [
  { key: "fullness", label: "FOOD" },
  { key: "happiness", label: "JOY" },
  { key: "energy", label: "ENERGY" },
];

function Needs({ pet, evolvesAt }: { pet: Pet; evolvesAt: number | null }) {
  const level = levelOf(pet.xp);
  const xpInLevel = pet.xp % XP_PER_LEVEL;
  return (
    <div className={styles.needs}>
      {BARS.map(({ key, label }) => {
        const value = Math.round(pet[key]);
        return (
          <div key={key} className={styles.need}>
            <span>{label}</span>
            <div className={styles.track}>
              <div className={styles.fill} data-tone={value > 50 ? "high" : value >= 20 ? "mid" : "low"} style={{ width: `${value}%` }} />
            </div>
          </div>
        );
      })}
      <div className={styles.need}>
        <span>XP</span>
        <div className={styles.track}>
          <div className={styles.fill} data-tone="xp" style={{ width: `${(xpInLevel / XP_PER_LEVEL) * 100}%` }} />
        </div>
      </div>
      <p className={styles.evolveHint}>{evolvesAt && level < evolvesAt ? `Evolves at Lv${evolvesAt}` : evolvesAt ? "Ready to evolve!" : "Final stage"}</p>
    </div>
  );
}

const MOOD_LABEL: Record<Mood, string> = {
  egg: "",
  sleeping: "Z z z",
  hungry: "food...?",
  tired: "so tired...",
  sad: "...",
  happy: "",
  ok: "",
};

interface StageProps {
  pet: Pet;
  species: Pokemon | undefined;
  /** Evolution stage: changes size and idle animation. */
  stage: number;
  reaction: { kind: Reaction; key: number } | null;
  now: number;
  onPet: () => void;
}

/** The selected Pokémon (or egg), its mood and the latest reaction. */
function Stage({ pet, species, stage, reaction, now, onPet }: StageProps) {
  const reducedMotion = useReducedMotion();
  const mood = moodOf(pet);
  const size = species?.isBaby ? "baby" : (["basic", "middle", "final"] as const)[Math.min(stage, 2)];
  const hearts = pet.dexId !== null && (mood === "happy" || reaction?.kind === "pet" || reaction?.kind === "play") && !reducedMotion;
  const useGif = species?.animated && !reducedMotion && mood !== "sleeping";
  const hatchSoon = pet.dexId === null && (pet.hatchAt ?? 0) - now < 30_000;

  return (
    <div className={styles.stage} data-type={species?.types[0]} data-mood={mood} data-shiny={pet.shiny === true}>
      {pet.dexId === null ? (
        <button type="button" className={styles.egg} data-soon={hatchSoon} aria-label="Egg" />
      ) : (
        <button type="button" className={styles.petButton} onClick={onPet} aria-label={`Pet ${species?.name}`}>
          <PetSprite
            className={styles.pet}
            data-size={size}
            data-reaction={reaction?.kind}
            dexId={pet.dexId}
            shiny={pet.shiny}
            animated={useGif ? species?.animated : null}
            alt={species ? `${pet.shiny ? "Shiny " : ""}${species.name}` : ""}
          />
        </button>
      )}
      {hearts && (
        <span className={styles.hearts} key={`hearts-${reaction?.key ?? "mood"}`} aria-hidden>
          <i>♥</i>
          <i>♥</i>
          <i>♥</i>
        </span>
      )}
      {MOOD_LABEL[mood] && <span className={styles.bubble}>{MOOD_LABEL[mood]}</span>}
      {reaction && (
        <span key={`reaction-${reaction.key}`} className={styles.reaction} data-kind={reaction.kind} aria-hidden>
          {REACTION_TEXT[reaction.kind]}
        </span>
      )}
      <span className={styles.shadow} aria-hidden />
    </div>
  );
}

const REACTION_TEXT: Record<Reaction, string> = {
  eat: "nom nom",
  play: "♪",
  train: "!",
  sleep: "z",
  evolve: "",
  hatch: "",
  pet: "♪",
  no: "?",
};
