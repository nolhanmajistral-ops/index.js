import { expect, test } from "@playwright/test";
import { onboard, register, uniqueEmail } from "./helpers";

test("planning : ajout manuel → réservé → réalisé → CA mis à jour", async ({ page }) => {
  await register(page, uniqueEmail("planning"));
  await onboard(page, { demo: false });
  await page.goto("/planning");
  await page.locator("html[data-hydrated]").waitFor();
  await expect(page.getByRole("heading", { name: "Planning" })).toBeVisible();

  const tomorrow = new Date(Date.now() + 86_400_000);
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich" }).format(tomorrow);
  await page.getByLabel("Date", { exact: true }).fill(date);
  await page.getByLabel("Heure", { exact: true }).fill("10:30");
  await page.getByLabel("Client", { exact: true }).fill("Yanis Morel");
  await expect(page.getByText("Nouveau client : il sera créé")).toBeVisible();
  await page.getByLabel("Comment il t'a trouvé ?").selectOption("INSTAGRAM");
  await page.getByRole("button", { name: "Ajouter au planning" }).click();
  await expect(page.getByText("Rendez-vous ajouté.")).toBeVisible();

  // Le rendez-vous apparaît (demain peut tomber la semaine suivante)
  if (!(await page.getByText("Yanis Morel").count())) await page.getByRole("link", { name: "Semaine suivante" }).click();
  const card = page.locator("li", { hasText: "Yanis Morel" });
  await expect(card).toContainText("10:30");
  await expect(card).toContainText("Réservé");

  await card.getByRole("button", { name: "Réalisé" }).click();
  await expect(card).toContainText("Réalisé");
  await expect(page.locator("div.card", { hasText: "CA réalisé" })).toContainText("40");

  // Le client existe désormais et est proposé à la prochaine saisie
  await page.goto("/clients?q=Yanis");
  await expect(page.getByText("Yanis Morel")).toBeVisible();
});
