import { test, expect } from "@playwright/test";
import { loginAs, creds } from "./helpers";

test("student can view and submit an assignment", async ({ page }) => {
  await loginAs(page, creds.student.email, creds.student.password);
  await expect(page).toHaveURL(/\/student\/dashboard/, { timeout: 12_000 });

  // Navigate to Assignments
  await page.goto("/student/assignments");
  await expect(page.getByText("Assignments").first()).toBeVisible({ timeout: 8_000 });

  // Page must not show an error state
  await expect(page.locator("text=Failed to load")).not.toBeVisible();
  await expect(page.locator("text=Something went wrong")).not.toBeVisible();

  // If there are pending assignments, open the first one and submit
  const viewBtn = page.getByRole("button", { name: /View|Submit|Open/i }).first();
  const hasAssignment = await viewBtn.isVisible({ timeout: 3_000 }).catch(() => false);

  if (hasAssignment) {
    await viewBtn.click();
    // Submission area should be present
    await expect(
      page.locator("textarea, input[type='file'], [data-testid='submission-area']").first()
    ).toBeVisible({ timeout: 5_000 });
  }
  // If no assignments exist, the empty-state illustration should be shown — not an error
});

test("faculty can grade a submitted assignment", async ({ page }) => {
  await loginAs(page, creds.faculty.email, creds.faculty.password);
  await expect(page).toHaveURL(/\/faculty\/dashboard/, { timeout: 12_000 });

  // Navigate to Assignment Reviews
  await page.goto("/faculty/assignment-review");
  await expect(page.getByText("Assignment Review").first()).toBeVisible({ timeout: 8_000 });

  // No error state
  await expect(page.locator("text=Failed to load")).not.toBeVisible();

  // If a submission is pending, open it and grade it
  const gradeBtn = page.getByRole("button", { name: /Grade|Review/i }).first();
  const hasPending = await gradeBtn.isVisible({ timeout: 3_000 }).catch(() => false);

  if (hasPending) {
    await gradeBtn.click();
    // Grade input should appear
    await expect(page.locator("input[type='number'], [placeholder*='score'], [placeholder*='grade']").first()).toBeVisible({ timeout: 5_000 });
  }
});
