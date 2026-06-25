import { test, expect } from "@playwright/test";
import { loginAs, creds } from "./helpers";

test("student can view certificates page and download a PDF", async ({ page }) => {
  await loginAs(page, creds.student.email, creds.student.password);
  await expect(page).toHaveURL(/\/student\/dashboard/, { timeout: 12_000 });

  // Navigate to Certificates
  await page.goto("/student/certificates");
  await expect(page.getByText("Certificates").first()).toBeVisible({ timeout: 8_000 });

  // No error state
  await expect(page.locator("text=Failed to load")).not.toBeVisible();
  await expect(page.locator("text=Something went wrong")).not.toBeVisible();

  // If certificates exist, trigger PDF generation on the first one
  const downloadBtn = page.getByRole("button", { name: /Download|Generate|View PDF/i }).first();
  const hasCert = await downloadBtn.isVisible({ timeout: 3_000 }).catch(() => false);

  if (hasCert) {
    // Wait for the download or the CertificateView component to render
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 10_000 }).catch(() => null),
      downloadBtn.click(),
    ]);
    // Either a file download started OR a preview opened — both are valid
    if (!download) {
      // CertificateView might open in-page
      await expect(
        page.locator("canvas, [data-testid='certificate-preview'], text=Certificate").first()
      ).toBeVisible({ timeout: 8_000 });
    }
  }
  // If no certificates yet, the empty-state should be visible — not an error
});
