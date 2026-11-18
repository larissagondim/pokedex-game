import { expect, type Page } from "@playwright/test";

/** localStorage keys used by the app (see the stores). */
export const KEY = {
  tamagotchi: "pokedex-game:tamagotchi",
  dex: "pokedex-game:dex-progress",
  trainer: "pokedex-game:trainer",
  league: "pokedex-game:league",
} as const;

/** Starts from this saved state (anything not listed is empty). */
export async function seed(page: Page, state: Record<string, unknown>) {
  await page.addInitScript((entries) => {
    // Only on the first load of the test, so the app's own writes survive reloads.
    if (sessionStorage.getItem("e2e-seeded")) return;
    localStorage.clear();
    for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, JSON.stringify(value));
    sessionStorage.setItem("e2e-seeded", "1");
  }, state);
}

/** Opens the app with the device open, zoomed in and taking input on the LIST tab. */
export async function openDevice(page: Page) {
  await page.goto("/?layout=split");
  // The list rows only exist once the Pokédex has loaded inside the screen.
  const firstRow = page.getByRole("option", { name: /BULBASAUR/ });
  await expect(page.getByRole("button", { name: /open device|zoom/i }).first()).toBeVisible();
  await page.keyboard.press(" ");
  await expect(firstRow).toBeVisible();
}

/** Switches tabs with MENU (Enter) until `name` is selected. */
export async function goToTab(page: Page, name: "LIST" | "BATTLE" | "TAMAGOTCHI" | "TRAINER") {
  const tab = page.getByRole("tab", { name: new RegExp(`^${name}`) });
  for (let i = 0; i < 4 && (await tab.getAttribute("aria-selected")) !== "true"; i++) await page.keyboard.press("Enter");
  await expect(tab).toHaveAttribute("aria-selected", "true");
}

/** The text in the dialog box once it has finished typing. */
export const dialog = (page: Page, text: string | RegExp) => expect(page.getByText(text)).toBeVisible();
