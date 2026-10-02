import { expect, test } from "@playwright/test";
import { login, onboard, register, uniqueEmail } from "./helpers";

test("inscription → onboarding → dashboard → déconnexion → connexion", async ({ page }) => {
  const email = uniqueEmail("auth");
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
  await register(page, email);
  await onboard(page, { demo: false });
  await expect(page.getByRole("heading", { name: /Bonjour Nolhan\./ })).toBeVisible();
  await page.getByRole("button", { name: "Déconnexion" }).click();
  await expect(page).toHaveURL(/\/login/);
  await login(page, email, "mauvais-mot-de-passe");
  await expect(page.getByText("Email ou mot de passe incorrect.")).toBeVisible();
  await login(page, email);
  await expect(page).toHaveURL(/\/dashboard/);
});
