import { expect, test } from "@playwright/test";
import { dialog, goToTab, KEY, openDevice, seed } from "./helpers";

const now = Date.now();
const pet = (dexId: number, extra: Record<string, unknown> = {}) => ({
  uid: `e2e-${dexId}`,
  dexId,
  hatchAt: null,
  fullness: 80,
  happiness: 80,
  energy: 80,
  xp: 0,
  asleep: false,
  updatedAt: now,
  ...extra,
});

test("a first-time player chooses a starter", async ({ page }) => {
  await seed(page, {});
  await openDevice(page);
  await goToTab(page, "TAMAGOTCHI");
  await expect(page.getByText("CHOOSE YOUR FIRST PARTNER!")).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("z");
  await dialog(page, /You chose CHARMANDER!/);
  await expect(page.getByText("PARTY 1/5")).toBeVisible();
});

test("a Pokémon has to be caught before it can be adopted", async ({ page }) => {
  await seed(page, { [KEY.tamagotchi]: { coins: 150, pets: [pet(7)] }, [KEY.dex]: { seen: [7], caught: [7] } });
  await openDevice(page);
  await page.keyboard.press("z"); // open BULBASAUR's page
  await page.getByRole("button", { name: /ADOPT/ }).click();
  await dialog(page, /haven't caught BULBASAUR yet/);
});

test("the shop sells battle items for coins", async ({ page }) => {
  await seed(page, { [KEY.tamagotchi]: { coins: 100, pets: [pet(7)] }, [KEY.dex]: { seen: [7], caught: [7] } });
  await openDevice(page);
  await goToTab(page, "TAMAGOTCHI");
  await page.getByRole("button", { name: "SHOP" }).click();
  const shop = page.getByRole("menu", { name: "Shop" });
  await expect(shop).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown"); // SUPER POTION
  await page.keyboard.press("z");
  await dialog(page, /You bought a SUPER POTION!/);
  await expect(shop.getByText("×1")).toBeVisible();
  await expect(page.getByText("70₽").first()).toBeVisible();
});

test("the league has eight leaders and the champion", async ({ page }) => {
  await seed(page, { [KEY.tamagotchi]: { coins: 0, pets: [pet(7)] }, [KEY.dex]: { seen: [7], caught: [7] } });
  await openDevice(page);
  await goToTab(page, "BATTLE");
  for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowDown");
  await page.keyboard.press("z");
  const league = page.getByRole("menu", { name: /LEAGUE/ });
  await expect(league.getByRole("menuitem")).toHaveCount(9);
  await expect(league.getByRole("menuitem").last()).toHaveText(/AURORA · CHAMPION/);
});

test("the trainer card pages through the badges", async ({ page }) => {
  await seed(page, {
    [KEY.tamagotchi]: { coins: 0, pets: [pet(7)] },
    [KEY.dex]: { seen: [7], caught: [7] },
    [KEY.trainer]: { name: "E2E", id: "00001", since: now, badges: {} },
  });
  await openDevice(page);
  await goToTab(page, "TRAINER");
  await page.keyboard.press("ArrowDown"); // BADGES
  await expect(page.getByText("1/2 ▼")).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByText("▲ 2/2")).toBeVisible();
  await expect(page.getByText("CHAMPION", { exact: true })).toBeVisible();
});
