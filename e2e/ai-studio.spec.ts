import { expect, test } from "@playwright/test";
import { onboard, register, uniqueEmail } from "./helpers";

/** Coach IA, Studio contenu et relances : fonctionne avec ou sans clé Anthropic (mode sans IA en CI). */
test("brief du jour, coach, Studio contenu et relances", async ({ page }) => {
  await register(page, uniqueEmail("studio"));
  await onboard(page, { demo: true });

  // Dashboard → brief du jour : la question est posée automatiquement au coach.
  await page.getByRole("link", { name: "Brief du jour avec le coach" }).click();
  await expect(page).toHaveURL(/\/ai\?q=/);
  const assistant = page.locator("div.rounded-bl-sm");
  await expect(assistant.first()).toContainText(/brief|opportunit|Créneaux|Relances|Contenu/i, { timeout: 60_000 });
  await expect(page.getByText(/^(IA|Mode sans IA.*)$/).first()).toBeVisible({ timeout: 60_000 });

  // Question libre : une réponse différente.
  await page.getByLabel("Question au coach").fill("Comment remplir mes créneaux vides ?");
  await page.getByRole("button", { name: "Envoyer" }).click();
  await expect(assistant.nth(1)).toContainText(/rendez-vous|créneau|story/i, { timeout: 60_000 });
  expect(await assistant.nth(1).innerText()).not.toBe(await assistant.first().innerText());

  // Studio : audit des contenus DEMO puis script de Reel.
  await page.goto("/studio");
  await page.locator("html[data-hydrated]").waitFor();
  await page.getByRole("tab", { name: "Audit de mes contenus" }).click();
  await page.getByRole("button", { name: "Générer" }).click();
  await expect(page.locator("[aria-live=polite]")).toContainText(/chiffres|médiane|Données insuffisantes/i, { timeout: 60_000 });

  await page.getByRole("tab", { name: "Script Reel / TikTok" }).click();
  await expect(page.getByRole("button", { name: "Générer" })).toBeDisabled();
  await page.getByLabel("Ton idée ou ce qui s'est passé").fill("Burst fade sur cheveux bouclés, il a halluciné au miroir");
  await page.getByRole("button", { name: "Générer" }).click();
  await expect(page.locator("[aria-live=polite]")).toContainText(/Accroche/i, { timeout: 60_000 });
  await expect(page.getByRole("button", { name: "Copier" })).toBeVisible();

  // Clients : la liste « À relancer » propose WhatsApp ou la copie du message.
  await page.goto("/clients");
  const relance = page.getByRole("heading", { name: "À relancer" });
  if (await relance.count()) {
    await expect(page.getByRole("link", { name: "Relancer sur WhatsApp" }).or(page.getByRole("button", { name: "Copier le message" })).first()).toBeVisible();
    const wa = page.getByRole("link", { name: "Relancer sur WhatsApp" }).first();
    if (await wa.count()) expect(await wa.getAttribute("href")).toMatch(/^https:\/\/wa\.me\/\d{10,15}\?text=/);
  }
});
