import { expect, type Page } from "@playwright/test";

export function uniqueEmail(prefix = "e2e") {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@e2e.local`;
}

export async function register(page: Page, email: string, password = "MotDePasse-E2E-123") {
  await page.goto("/register");
  await page.locator("html[data-hydrated]").waitFor();
  await page.getByLabel("Nom").fill("Nolhan Yildirim");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mot de passe").fill(password);
  await page.getByRole("button", { name: "Créer mon compte" }).click();
  await expect(page).toHaveURL(/\/onboarding/);
}

export async function login(page: Page, email: string, password = "MotDePasse-E2E-123") {
  await page.goto("/login");
  await page.locator("html[data-hydrated]").waitFor();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mot de passe").fill(password);
  await page.getByRole("button", { name: "Se connecter" }).click();
}

export async function onboard(page: Page, opts: { demo: boolean }) {
  await page.locator("html[data-hydrated]").waitFor();
  await page.getByLabel("CA / mois (CHF)").fill("3500");
  await page.getByLabel("Clients / semaine").fill("14");
  await page.getByLabel("Followers Instagram").fill("5000");
  await page.getByLabel("Vidéos / semaine").fill("4");
  await page.getByLabel("Instagram (@)").fill("nolhan.barber");
  if (opts.demo) await page.getByLabel(/données de démonstration/).check();
  await page.getByRole("button", { name: "Générer mon dashboard" }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 60_000 });
}
