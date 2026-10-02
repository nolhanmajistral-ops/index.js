import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { onboard, register, uniqueEmail } from "./helpers";

const SAMPLE = path.join(process.cwd(), "docs", "samples", "planity-sample.csv");

test.describe.configure({ mode: "serial" });

test("flux complet : inscription → DEMO → client → contenu → snapshot → import Planity → réimport → rollback → export → analyse → move → coach → mission → apprentissage", async ({ page, context }) => {
  test.setTimeout(240_000);
  // Inscription + connexion + onboarding avec DEMO
  await register(page, uniqueEmail("flow"));
  await onboard(page, { demo: true });
  await expect(page.getByRole("heading", { name: "Bonjour Nolhan." })).toBeVisible();
  await expect(page.getByText("Ton prochain move")).toBeVisible();
  await expect(page.getByText(/données DEMO/i).first()).toBeVisible();
  await expect(page.getByText("Configuration required").first()).toBeVisible();

  // Ajout client (attribution déclarée)
  await page.goto("/clients/new");
  await page.locator("html[data-hydrated]").waitFor();
  await page.getByLabel("Prénom").fill("Testeur");
  await page.getByLabel("Nom", { exact: true }).fill("Flow");
  await page.getByLabel("Email").fill("testeur.flow@example.com");
  await page.getByLabel(/Comment nous as-tu trouvé/).fill("Instagram");
  await page.getByRole("button", { name: "Ajouter le client" }).click();
  await expect(page).toHaveURL(/\/clients\/c/);
  await expect(page.getByRole("heading", { name: "Testeur Flow" })).toBeVisible();
  await expect(page.getByText("Confiance haute")).toBeVisible();

  // Ajout contenu + snapshot de métriques
  await page.goto("/contents/new");
  await page.locator("html[data-hydrated]").waitFor();
  await page.getByLabel("Titre").fill("E2E Transformation fade");
  await page.getByLabel("Statut", { exact: true }).selectOption("PUBLISHED");
  await page.getByRole("button", { name: "Créer le contenu" }).click();
  await expect(page).toHaveURL(/\/contents\/c/);
  await page.getByLabel("Vues", { exact: true }).fill("4321");
  await page.getByLabel("Leads", { exact: true }).fill("3");
  await page.getByRole("button", { name: "Ajouter un snapshot" }).click();
  await expect(page.getByText(/Snapshot de métriques ajouté/)).toBeVisible();

  // Snapshot Instagram manuel
  await page.goto("/social");
  await page.locator("html[data-hydrated]").waitFor();
  await page.getByLabel("Abonnés", { exact: true }).fill("2222");
  await page.getByRole("button", { name: "Ajouter le snapshot" }).click();
  await expect(page.getByText("Snapshot ajouté.")).toBeVisible();
  await expect(page.getByText("Connected", { exact: true })).toHaveCount(0);

  // Import Planity : upload → aperçu/mapping → import
  await page.goto("/planity");
  await page.locator("html[data-hydrated]").waitFor();
  await page.getByLabel("Fichier Planity").setInputFiles(SAMPLE);
  await page.getByRole("button", { name: "Analyser le fichier" }).click();
  await expect(page.getByText("Aperçu (aucune donnée écrite)")).toBeVisible();
  await expect(page.getByLabel("Colonne pour Prestation *")).toHaveValue("7");
  const importedBox = page.locator("dl div", { hasText: "Importées" });
  await expect(importedBox).toContainText("19");
  await page.getByRole("button", { name: "Importer" }).click();
  await expect(page.getByText("Rapport d'import")).toBeVisible();
  await expect(importedBox).toContainText("19");
  await expect(page.locator("dl div", { hasText: "Erreurs" })).toContainText("4");

  // Réimport du même fichier → 0 nouvelle ligne
  await page.goto("/planity");
  await page.locator("html[data-hydrated]").waitFor();
  await page.getByLabel("Fichier Planity").setInputFiles(SAMPLE);
  await page.getByRole("button", { name: "Analyser le fichier" }).click();
  await page.getByRole("button", { name: "Importer" }).click();
  await expect(page.getByText("Rapport d'import")).toBeVisible();
  await expect(page.locator("dl div", { hasText: "Importées" })).toContainText("0");
  await expect(page.locator("dl div", { hasText: "Doublons ignorés" })).toContainText("20");

  // Rollback du premier import
  await page.goto("/planity");
  await page.locator("html[data-hydrated]").waitFor();
  await expect(page.getByText("Connected (import)")).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Annuler cet import" }).last().click();
  await expect(page.getByText(/Import annulé/)).toBeVisible();

  // Export
  const download = page.waitForEvent("download");
  await page.goto("/settings");
  await page.locator("html[data-hydrated]").waitFor();
  await page.locator('a[href="/api/export?entity=clients&format=csv"]').click();
  const file = await (await download).path();
  const csv = fs.readFileSync(file!, "utf8");
  expect(csv).toContain("testeur.flow@example.com");

  // Analyse + Next Best Action
  await page.goto("/analytics");
  await expect(page.getByText("Performance par format")).toBeVisible();
  await page.goto("/dashboard");
  await page.locator("html[data-hydrated]").waitFor();
  await expect(page.getByText("Ton prochain move")).toBeVisible();
  await page.getByRole("button", { name: "Fait" }).click();
  await expect(page.getByText(/le résultat sera évalué automatiquement/)).toBeVisible();

  // Coach IA (mode déterministe, données réelles)
  await page.goto("/ai");
  await page.locator("html[data-hydrated]").waitFor();
  await page.getByRole("button", { name: "Comment augmenter mon CA ?" }).click();
  await expect(page.getByText(/CA du mois à date/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Mode déterministe (aucun fournisseur IA configuré).")).toBeVisible();

  // Mission → résultat
  await page.goto("/missions");
  await page.locator("html[data-hydrated]").waitFor();
  const first = page.locator("article").first();
  await first.getByLabel("Résultat de la mission").fill("Fait pendant la pause");
  await first.getByRole("button", { name: "Done", exact: true }).click();
  await expect(first.getByText("Mission mise à jour.")).toBeVisible();

  // Boucle d'apprentissage
  await page.goto("/ai");
  await page.locator("html[data-hydrated]").waitFor();
  await page.getByRole("button", { name: "Évaluer les résultats maintenant" }).click();
  await expect(page.getByText(/recommandation\(s\) évaluée\(s\)/)).toBeVisible();
  await expect(page.getByText("DECISION").first()).toBeVisible();

  // Isolation : un autre utilisateur ne voit pas ce client
  const clientUrl = await (async () => { await page.goto("/clients?q=Testeur"); return page.locator("a[href^='/clients/c']").first().getAttribute("href"); })();
  const other = await context.browser()!.newContext();
  const p2 = await other.newPage();
  await register(p2, uniqueEmail("other"));
  await onboard(p2, { demo: false });
  const r = await p2.goto(clientUrl!);
  expect(r?.status()).toBe(404);
  const api = await p2.request.get(`/api/clients/${clientUrl!.split("/").pop()}/export`);
  expect(api.status()).toBe(404);
  await other.close();
});

test("API protégées sans session", async ({ request }) => {
  const res = await request.get("/api/export?entity=clients&format=json", { maxRedirects: 0 });
  expect([302, 303, 307, 401]).toContain(res.status());
  const imp = await request.post("/api/planity/import", { maxRedirects: 0 });
  expect([302, 303, 307, 401]).toContain(imp.status());
  const health = await request.get("/api/health");
  expect(health.status()).toBe(200);
});

test("mobile : navigation basse et raccourcis", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await register(page, uniqueEmail("mobile"));
  await onboard(page, { demo: false });
  const nav = page.getByRole("navigation", { name: "Raccourcis" });
  await expect(nav).toBeVisible();
  for (const label of ["Dashboard", "Mission", "Contenu", "Client", "Coach IA"]) await expect(nav.getByText(label, { exact: true })).toBeVisible();
  await nav.getByText("Client", { exact: true }).click();
  await expect(page).toHaveURL(/\/clients\/new/);
  const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollW).toBeLessThanOrEqual(390);
  await ctx.close();
});
