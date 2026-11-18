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

const PASSWORD = "ValidPassword123!";

test.describe("Phases 2-5 verification", () => {
  test("Phase 4: Hard account deletion removes data, blocks sign-in, and allows re-signup", async ({ page }) => {
    const email = `pw-delete-${Date.now()}@example.com`;

    // 1. Sign up and mark verified + onboarding complete
    const signUpRes = await page.request.post("/api/auth/sign-up/email", {
      data: { email, name: "Delete Test", password: PASSWORD },
    });
    expect(signUpRes.status()).toBe(200);

    const uid = runDbPython(
      `from sqlalchemy import text; from app.db.session import SessionLocal\n` +
        `with SessionLocal() as db:\n` +
        `  db.execute(text('UPDATE neon_auth."user" SET "emailVerified" = true WHERE email = :e'), {"e": "${email}"})\n` +
        `  uid = db.execute(text('SELECT id::text FROM neon_auth."user" WHERE email = :e'), {"e": "${email}"}).scalar()\n` +
        `  db.execute(text('INSERT INTO profiles (user_id, niche_description, onboarding_step, onboarding_completed_at) VALUES (:u, :n, 4, now()) ON CONFLICT (user_id) DO NOTHING'), {"u": uid, "n": "Postgres performance"})\n` +
        `  db.commit()\n` +
        `  print(uid)\n`
    );
    expect(uid).toBeTruthy();

    // 2. Sign in via UI
    await page.goto("/auth/sign-in");
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => url.pathname.startsWith("/app"), { timeout: 20_000 });

    // 3. Go to Settings -> Account tab and delete account by typing email
    await page.goto("/app/settings?tab=account");
    await page.getByRole("button", { name: "Delete account..." }).click();
    await page.fill("#delete-confirm-input", email);
    await page.getByRole("button", { name: "Delete account" }).click();
    await page.waitForURL("**/", { timeout: 20_000 });

    // 4. Verify 0 rows remain for that user_id
    const remaining = Number(
      runDbPython(
        `from sqlalchemy import text; from app.db.session import SessionLocal\n` +
          `with SessionLocal() as db:\n` +
          `  c1 = db.execute(text('SELECT count(*) FROM profiles WHERE user_id = :u'), {"u": "${uid}"}).scalar()\n` +
          `  c2 = db.execute(text('SELECT count(*) FROM neon_auth."user" WHERE id::text = :u'), {"u": "${uid}"}).scalar()\n` +
          `  print(c1 + c2)\n`
      )
    );
    expect(remaining).toBe(0);

    // 5. Cannot sign in afterwards
    const loginAfter = await page.request.post("/api/auth/sign-in/email", {
      data: { email, password: PASSWORD },
    });
    expect(loginAfter.status()).toBe(401);

    // 6. Same email can sign up again
    const reSignUp = await page.request.post("/api/auth/sign-up/email", {
      data: { email, name: "Re-created", password: PASSWORD },
    });
    expect(reSignUp.status()).toBe(200);

    // Clean up re-created throwaway user
    runDbPython(
      `from sqlalchemy import text; from app.db.session import SessionLocal\n` +
        `with SessionLocal() as db:\n` +
        `  db.execute(text('DELETE FROM neon_auth.verification WHERE identifier LIKE :p'), {"p": "%${email}%"})\n` +
        `  u = db.execute(text('SELECT id FROM neon_auth."user" WHERE email = :e'), {"e": "${email}"}).scalar()\n` +
        `  if u:\n` +
        `    db.execute(text('DELETE FROM neon_auth.account WHERE "userId" = :u'), {"u": u})\n` +
        `    db.execute(text('DELETE FROM neon_auth."user" WHERE id = :u'), {"u": u})\n` +
        `  db.commit()\n`
    );
  });

  test("Phase 5: Playground ?tab= Back/Forward with Slow 4G + 4x CPU and Landing signed-in CTAs", async ({ page, context }) => {
    test.setTimeout(90_000);
    const email = `pw-nav-${Date.now()}@example.com`;
    await page.request.post("/api/auth/sign-up/email", {
      data: { email, name: "Nav Test", password: PASSWORD },
    });
    const uid = runDbPython(
      `from sqlalchemy import text; from app.db.session import SessionLocal\n` +
        `with SessionLocal() as db:\n` +
        `  db.execute(text('UPDATE neon_auth."user" SET "emailVerified" = true WHERE email = :e'), {"e": "${email}"})\n` +
        `  uid = db.execute(text('SELECT id::text FROM neon_auth."user" WHERE email = :e'), {"e": "${email}"}).scalar()\n` +
        `  db.execute(text('INSERT INTO profiles (user_id, niche_description, onboarding_step, onboarding_completed_at) VALUES (:u, :n, 4, now()) ON CONFLICT (user_id) DO NOTHING'), {"u": uid, "n": "Postgres performance"})\n` +
        `  db.commit()\n` +
        `  print(uid)\n`
    );

    await page.goto("/auth/sign-in");
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => url.pathname.startsWith("/app"), { timeout: 20_000 });

    // Throttle network to Slow 4G and CPU to 4x
    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      downloadThroughput: (1.6 * 1024 * 1024) / 8,
      uploadThroughput: (750 * 1024) / 8,
      latency: 150,
    });
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });

    await page.goto("/app/playground", { waitUntil: "load", timeout: 45_000 });
    const composerTab = page.getByRole("tab", { name: "LinkedIn Composer" });
    await expect(composerTab).toBeVisible({ timeout: 30_000 });
    await composerTab.click();
    await expect(page).toHaveURL(/tab=composer/, { timeout: 15_000 });

    await page.goBack();
    await expect(page).toHaveURL(/\/app\/playground$/, { timeout: 15_000 });

    await page.goForward();
    await expect(page).toHaveURL(/tab=composer/, { timeout: 15_000 });

    // Signed-in landing page shows Go to dashboard
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("button", { name: "Go to dashboard" }).first()).toBeVisible({ timeout: 15_000 });

    // Clean up
    runDbPython(
      `from sqlalchemy import text; from app.db.session import SessionLocal\n` +
        `with SessionLocal() as db:\n` +
        `  db.execute(text('DELETE FROM profiles WHERE user_id = :u'), {"u": "${uid}"})\n` +
        `  db.execute(text('DELETE FROM neon_auth.verification WHERE identifier LIKE :p'), {"p": "%${email}%"})\n` +
        `  db.execute(text('DELETE FROM neon_auth.session WHERE "userId"::text = :u'), {"u": "${uid}"})\n` +
        `  db.execute(text('DELETE FROM neon_auth.account WHERE "userId"::text = :u'), {"u": "${uid}"})\n` +
        `  db.execute(text('DELETE FROM neon_auth."user" WHERE id::text = :u'), {"u": "${uid}"})\n` +
        `  db.commit()\n`
    );
  });
});

