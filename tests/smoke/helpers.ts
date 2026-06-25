import type { Page } from "@playwright/test";

export async function loginAs(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
}

export const creds = {
  student: {
    email:    process.env.TEST_STUDENT_EMAIL ?? "",
    password: process.env.TEST_STUDENT_PASSWORD ?? "",
  },
  faculty: {
    email:    process.env.TEST_FACULTY_EMAIL ?? "",
    password: process.env.TEST_FACULTY_PASSWORD ?? "",
  },
  admin: {
    email:    process.env.TEST_ADMIN_EMAIL ?? "",
    password: process.env.TEST_ADMIN_PASSWORD ?? "",
  },
};
