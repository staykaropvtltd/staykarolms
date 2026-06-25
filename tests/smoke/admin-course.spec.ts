import { test, expect } from "@playwright/test";
import { loginAs, creds } from "./helpers";

test("admin can create a course", async ({ page }) => {
  await loginAs(page, creds.admin.email, creds.admin.password);
  await expect(page).toHaveURL(/\/admin\/dashboard/, { timeout: 12_000 });

  // Navigate to courses
  await page.goto("/admin/courses");
  await expect(page.getByText("Courses").first()).toBeVisible({ timeout: 8_000 });

  // Open the New Course modal
  await page.getByRole("button", { name: /New course/i }).click();
  await expect(page.getByText("New Course")).toBeVisible();

  // Fill the form with a unique title to avoid conflicts
  const title = `Smoke Test ${Date.now()}`;
  await page.locator('input[placeholder*="Advanced Python"]').fill(title);
  await page.locator('textarea[placeholder*="description"]').fill("Created by Playwright smoke test.");

  // Submit
  await page.getByRole("button", { name: "Create Course" }).click();

  // Toast should confirm success
  await expect(page.getByText("Course created successfully!")).toBeVisible({ timeout: 8_000 });

  // New course should appear in the list
  await expect(page.getByText(title)).toBeVisible({ timeout: 5_000 });
});
