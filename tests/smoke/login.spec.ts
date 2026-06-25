import { test, expect } from "@playwright/test";
import { loginAs, creds } from "./helpers";

test.describe("Login — all roles", () => {
  test("student logs in and lands on student dashboard", async ({ page }) => {
    await loginAs(page, creds.student.email, creds.student.password);
    await expect(page).toHaveURL(/\/student\/dashboard/, { timeout: 12_000 });
    // Sidebar should be visible
    await expect(page.getByText("My Learning")).toBeVisible();
  });

  test("faculty logs in and lands on faculty dashboard", async ({ page }) => {
    await loginAs(page, creds.faculty.email, creds.faculty.password);
    await expect(page).toHaveURL(/\/faculty\/dashboard/, { timeout: 12_000 });
    await expect(page.getByText("My Courses")).toBeVisible();
  });

  test("admin logs in and lands on admin dashboard", async ({ page }) => {
    await loginAs(page, creds.admin.email, creds.admin.password);
    await expect(page).toHaveURL(/\/admin\/dashboard/, { timeout: 12_000 });
    await expect(page.getByText("Students")).toBeVisible();
  });

  test("wrong password shows error message", async ({ page }) => {
    await page.goto("/login");
    await page.locator('input[type="email"]').fill(creds.student.email || "test@test.com");
    await page.locator('input[type="password"]').fill("definitely-wrong-password-xyz");
    await page.locator('button[type="submit"]').click();
    // Should stay on login page and show error
    await expect(page).toHaveURL(/\/login/, { timeout: 8_000 });
    await expect(page.locator(".text-red-600, .bg-red-50").first()).toBeVisible();
  });
});
