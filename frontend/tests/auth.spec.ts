import { test, expect } from "@playwright/test";
import { execFileSync } from "child_process";
import path from "path";

const BACKEND_DIR = path.resolve(__dirname, "../../backend");
const PYTHON_BIN = path.resolve(__dirname, "../../.venv/Scripts/python.exe");

function runDbPython(code: string): string {
  return execFileSync(PYTHON_BIN, ["-c", code], {
    cwd: BACKEND_DIR,
    encoding: "utf8",
  }).trim();
}

const TEST_PASSWORD = "ValidPassword123!";
const UNVERIFIED_EMAIL = `pw-unverified-${Date.now()}@example.com`;
const VERIFIED_EMAIL = `pw-verified-${Date.now()}@example.com`;

test.describe("Phase 1: Auth flows", () => {
  test.beforeAll(async ({ request }) => {
    // Create unverified user via sign-up
    const r1 = await request.post("/api/auth/sign-up/email", {
      data: { email: UNVERIFIED_EMAIL, name: "PW Unverified", password: TEST_PASSWORD },
    });
    expect(r1.status()).toBe(200);

    // Create verified user via sign-up + mark emailVerified=true in DB
    const r2 = await request.post("/api/auth/sign-up/email", {
      data: { email: VERIFIED_EMAIL, name: "PW Verified", password: TEST_PASSWORD },
    });
    expect(r2.status()).toBe(200);
    runDbPython(
      `from sqlalchemy import text; from app.db.session import SessionLocal\n` +
        `with SessionLocal() as db:\n` +
        `  db.execute(text('UPDATE neon_auth."user" SET "emailVerified" = true WHERE email = :e'), {"e": "${VERIFIED_EMAIL}"})\n` +
        `  db.commit()\n`
    );
  });

  test.afterAll(() => {
    // Clean up throwaway test users
    runDbPython(
      `from sqlalchemy import text; from app.db.session import SessionLocal\n` +
        `with SessionLocal() as db:\n` +
        `  for em in ["${UNVERIFIED_EMAIL}", "${VERIFIED_EMAIL}"]:\n` +
        `    uid = db.execute(text('SELECT id FROM neon_auth."user" WHERE email = :e'), {"e": em}).scalar()\n` +
        `    db.execute(text('DELETE FROM neon_auth.verification WHERE identifier LIKE :p'), {"p": f"%{em}%"})\n` +
        `    if uid:\n` +
        `      db.execute(text('DELETE FROM neon_auth.session WHERE "userId" = :u'), {"u": uid})\n` +
        `      db.execute(text('DELETE FROM neon_auth.account WHERE "userId" = :u'), {"u": uid})\n` +
        `      db.execute(text('DELETE FROM neon_auth."user" WHERE id = :u'), {"u": uid})\n` +
        `  db.commit()\n`
    );
  });

  test("(a) wrong password shows Incorrect email or password. and stays on sign-in", async ({ page }) => {
    let otpCalled = false;
    page.on("request", (req) => {
      if (req.url().includes("send-verification-otp")) otpCalled = true;
    });

    await page.goto("/auth/sign-in");
    await page.fill('input[name="email"]', VERIFIED_EMAIL);
    await page.fill('input[name="password"]', "WrongPassword999!");
    await page.click('button[type="submit"]');

    await expect(page.getByText("Incorrect email or password.")).toBeVisible();
    expect(page.url()).toContain("/auth/sign-in");
    expect(otpCalled).toBe(false);
  });

  test("(b) unknown email shows Incorrect email or password. and sends no email", async ({ page }) => {
    let otpCalled = false;
    page.on("request", (req) => {
      if (req.url().includes("send-verification-otp")) otpCalled = true;
    });

    await page.goto("/auth/sign-in");
    await page.fill('input[name="email"]', "unknown-pw-test@example.com");
    await page.fill('input[name="password"]', "WrongPassword999!");
    await page.click('button[type="submit"]');

    await expect(page.getByText("Incorrect email or password.")).toBeVisible();
    expect(page.url()).toContain("/auth/sign-in");
    expect(otpCalled).toBe(false);
  });

  test("(c) verified user goes straight to the app without verify-otp", async ({ page }) => {
    await page.goto("/auth/sign-in");
    await page.fill('input[name="email"]', VERIFIED_EMAIL);
    await page.fill('input[name="password"]', TEST_PASSWORD);
    await page.click('button[type="submit"]');

    await page.waitForURL((url) => !url.pathname.startsWith("/auth/"), { timeout: 20_000 });
    expect(page.url()).not.toContain("/auth/verify-otp");
  });

  test("(d) unverified user gets the verify page and exactly one verification record", async ({ page }) => {
    const freshEmail = `pw-fresh-${Date.now()}@example.com`;
    let sendOtpRequests = 0;
    page.on("request", (req) => {
      if (req.url().includes("send-verification-otp")) sendOtpRequests += 1;
    });

    await page.goto("/auth/sign-up");
    await page.fill('input[name="name"]', "Fresh User");
    await page.fill('input[name="email"]', freshEmail);
    await page.fill('input[name="password"]', TEST_PASSWORD);
    await page.click('button[type="submit"]');

    await page.waitForURL("**/auth/verify-otp", { timeout: 20_000 });
    // signUp.email sends 1 automatic email; no extra sendVerificationOtp call is made
    expect(sendOtpRequests).toBe(0);

    const verCount = Number(
      runDbPython(
        `from sqlalchemy import text; from app.db.session import SessionLocal\n` +
          `with SessionLocal() as db:\n` +
          `  print(db.execute(text('SELECT count(*) FROM neon_auth.verification WHERE identifier LIKE :p'), {"p": "%${freshEmail}%"}).scalar())\n`
      )
    );
    expect(verCount).toBe(1);

    // Clean up fresh user
    runDbPython(
      `from sqlalchemy import text; from app.db.session import SessionLocal\n` +
        `with SessionLocal() as db:\n` +
        `  uid = db.execute(text('SELECT id FROM neon_auth."user" WHERE email = :e'), {"e": "${freshEmail}"}).scalar()\n` +
        `  db.execute(text('DELETE FROM neon_auth.verification WHERE identifier LIKE :p'), {"p": "%${freshEmail}%"})\n` +
        `  if uid:\n` +
        `    db.execute(text('DELETE FROM neon_auth.account WHERE "userId" = :u'), {"u": uid})\n` +
        `    db.execute(text('DELETE FROM neon_auth."user" WHERE id = :u'), {"u": uid})\n` +
        `  db.commit()\n`
    );
  });

  test("(e) sign up with existing email shows neutral message and sends nothing to existing user", async ({ page }) => {
    const beforeVer = runDbPython(
      `from sqlalchemy import text; from app.db.session import SessionLocal\n` +
        `with SessionLocal() as db:\n` +
        `  print(db.execute(text('SELECT count(*), max("updatedAt")::text FROM neon_auth.verification WHERE identifier LIKE :p'), {"p": "%${VERIFIED_EMAIL}%"}).fetchone())\n`
    );

    await page.goto("/auth/sign-up");
    await page.fill('input[name="name"]', "Attacker");
    await page.fill('input[name="email"]', VERIFIED_EMAIL);
    await page.fill('input[name="password"]', "DifferentPass123!");
    await page.click('button[type="submit"]');

    await page.waitForURL("**/auth/verify-otp", { timeout: 20_000 });
    await expect(page.getByText("Check your email. If you already have an account,")).toBeVisible();
    await expect(page.getByRole("link", { name: "sign in instead" })).toBeVisible();

    const afterVer = runDbPython(
      `from sqlalchemy import text; from app.db.session import SessionLocal\n` +
        `with SessionLocal() as db:\n` +
        `  print(db.execute(text('SELECT count(*), max("updatedAt")::text FROM neon_auth.verification WHERE identifier LIKE :p'), {"p": "%${VERIFIED_EMAIL}%"}).fetchone())\n`
    );
    expect(afterVer).toBe(beforeVer);
  });

  test("(f) direct call for sign-in OTP is blocked with 404", async ({ request }) => {
    const r1 = await request.post("/api/auth/sign-in/email-otp", {
      data: { email: VERIFIED_EMAIL, otp: "123456" },
    });
    expect(r1.status()).toBe(404);

    const r2 = await request.post("/api/auth/email-otp/send-verification-otp", {
      data: { email: VERIFIED_EMAIL, type: "sign-in" },
    });
    expect(r2.status()).toBe(404);
  });

  test("(g) opening /auth/verify-otp directly redirects to sign in", async ({ page }) => {
    await page.goto("/auth/verify-otp");
    await page.waitForURL("**/auth/sign-in", { timeout: 15_000 });
    expect(page.url()).toContain("/auth/sign-in");
  });

  test("(h) resend limit returns 429 with retry_after", async ({ page }) => {
    // Sign in as unverified user -> 403 triggers 1st sendVerificationOtp and opens /auth/verify-otp
    await page.goto("/auth/sign-in");
    await page.fill('input[name="email"]', UNVERIFIED_EMAIL);
    await page.fill('input[name="password"]', TEST_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL("**/auth/verify-otp", { timeout: 20_000 });

    // Direct resend POST with the browser's signed verify cookie should hit 429
    const res = await page.evaluate(async (email) => {
      const r = await fetch("/api/auth/email-otp/send-verification-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, type: "email-verification" }),
      });
      return { status: r.status, body: await r.json() };
    }, UNVERIFIED_EMAIL);

    expect(res.status).toBe(429);
    expect(res.body.retry_after).toBeGreaterThan(0);
    expect(res.body.retry_after).toBeLessThanOrEqual(60);
  });
});

