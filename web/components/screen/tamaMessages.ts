import { EGG_PRICE, MAX_SLOTS } from "@/lib/tamagotchi";
import type { TamaEvent } from "@/stores/tamagotchi";

/** Dialog-box text for a Tamagotchi event. `nameOf` turns a dex number into a display name. */
export function describeEvent(event: TamaEvent, nameOf: (dexId: number | null) => string): string {
  switch (event.kind) {
    case "adopted":
      return `You adopted ${nameOf(event.dexId)}! Visit it in the TAMAGOTCHI tab.`;
    case "egg-bought":
      return `You bought an egg for ${EGG_PRICE}₽. Keep it warm, it will hatch soon!`;
    case "hatched":
      return `Oh? The egg is hatching... It's ${nameOf(event.dexId)}!`;
    case "evolved":
      return `What? ${nameOf(event.from)} is evolving! ... ${nameOf(event.from)} evolved into ${nameOf(event.to)}! +50₽`;
    case "released":
      return `Bye-bye, ${nameOf(event.dexId)}! Take care out there.`;
    case "full":
      return `Your party is full (${MAX_SLOTS}/${MAX_SLOTS}). Release one in the TAMAGOTCHI tab first.`;
    case "no-coins":
      return `Not enough ₽ (an egg costs ${EGG_PRICE}₽). Play and train to earn more.`;
    case "action": {
      const name = nameOf(event.dexId);
      const coins = event.coins ? ` +${event.coins}₽` : "";
      switch (event.outcome) {
        case "ate":
          return `${name} munched happily!`;
        case "too-full":
          return `${name} is already full...`;
        case "played":
          return `${name} had fun playing!${coins}`;
        case "trained":
          return `${name} trained hard!${coins}`;
        case "fell-asleep":
          return `${name} fell asleep. Zzz...`;
        case "woke-up":
          return `${name} woke up!`;
        case "too-tired":
          return `${name} is too tired. Let it sleep.`;
        case "too-hungry":
          return `${name} is too hungry to train.`;
        case "is-asleep":
          return `${name} is sleeping. Let it rest!`;
        case "is-egg":
          return "It's still an egg.";
      }
    }
  }
}
