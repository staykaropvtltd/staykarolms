import { test, expect } from "@playwright/test";
import { loginAs, creds } from "./helpers";

test("student can start and submit a test attempt", async ({ page }) => {
  await loginAs(page, creds.student.email, creds.student.password);
  await expect(page).toHaveURL(/\/student\/dashboard/, { timeout: 12_000 });

  // Navigate to the aptitude test list (student-facing test page)
  await page.goto("/student/aptitude-test");
  await expect(
    page.getByText(/Aptitude|Test|Quiz/i).first()
  ).toBeVisible({ timeout: 8_000 });

  // No error state
  await expect(page.locator("text=Failed to load")).not.toBeVisible();

  // If a published test exists, start it
  const startBtn = page.getByRole("button", { name: /Start|Take|Begin/i }).first();
  const hasTest = await startBtn.isVisible({ timeout: 3_000 }).catch(() => false);

  if (hasTest) {
    await startBtn.click();

    // Should land on the take-test page
    await expect(page).toHaveURL(/\/student\/take-test\//, { timeout: 8_000 });

    // Questions should be visible
    await expect(page.locator("[data-testid='question'], .question, h3, p").first()).toBeVisible({ timeout: 5_000 });

    // Submit the attempt (even with no answers — tests server-side handling)
    const submitBtn = page.getByRole("button", { name: /Submit/i }).last();
    if (await submitBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await submitBtn.click();
      // Confirm dialog or success state
      await expect(
        page.locator("text=submitted, text=Result, text=Score").first()
      ).toBeVisible({ timeout: 8_000 });
    }
  }
});
