// Ticket 08 browser check on the local :3100 server (throwaway soc08-db), with the local Edge.
//   node browse08.mjs request <jobId> <item>...   click ตรวจ on each item, screenshot the job page
//   node browse08.mjs review <jobId> <item>...    open each item's Image Rows on the review page, screenshot
//   node browse08.mjs decide <jobId> <item>       set ผ่าน on every row of the item, picture last; screenshot
// Screenshots go to C:/Phusit/soc08/shots. The session cookie comes from setup08.ts.
import { chromium } from "playwright-core";
import { mkdirSync, readFileSync } from "node:fs";

const [mode, jobId, ...items] = process.argv.slice(2);
const BASE = "http://localhost:3100";
const SHOTS = "C:/Phusit/soc08/shots";
mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch({ channel: "msedge" });
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, locale: "th-TH" });
await context.addCookies([{ name: "session", value: readFileSync("C:/Phusit/soc08/cookie.txt", "utf8").trim(), domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" }]);
const page = await context.newPage();
page.on("pageerror", (error) => console.log("page error:", error.message));
await page.goto(`${BASE}/soc/${jobId}`, { waitUntil: "networkidle", timeout: 300_000 });

// The job page's row of a major item: its first cell is the label.
const itemRow = (label) => page.locator("#soc-major-items tbody tr").filter({ has: page.locator("td:first-child", { hasText: new RegExp(`^\\s*ข้อ ${label.replace(".", "\\.")}\\s*$`) }) }).first();

// The review table's row buttons are named by the item; pick the one whose row has the "รูป" chip.
const imageRowButtons = (label) => page.locator("tr").filter({ has: page.locator("span", { hasText: /^รูป$/ }) }).getByRole("button", { name: label, exact: true });

if (mode === "shot") {
  await page.screenshot({ path: `${SHOTS}/job.png`, fullPage: true });
  console.log((await page.locator("main").innerText()).slice(0, 2500));
}

if (mode === "request") {
  for (const label of items) {
    await itemRow(label).getByRole("button", { name: "ตรวจ", exact: true }).click();
    await page.waitForTimeout(1500);
    console.log(label, "→", (await itemRow(label).innerText()).replace(/\s+/g, " "));
  }
  await page.screenshot({ path: `${SHOTS}/job-requested.png`, fullPage: true });
}

// The item's Image Row back to รอแก้ไข and then to ผ่าน, with the job page's status after each.
if (mode === "picture-gate") {
  const [label] = items;
  const status = async () => (await itemRow(label).locator("td").nth(2).innerText()).replace(/\s+/g, " ");
  const set = async (decision) => {
    await imageRowButtons(label).first().click();
    const detail = page.getByRole("complementary").first();
    await detail.getByRole("radio", { name: decision }).click();
    await detail.getByRole("button", { name: /บันทึกการแก้ไข|ยืนยันข้อนี้/ }).click();
    await page.waitForTimeout(2500);
    await page.reload({ waitUntil: "networkidle" });
  };
  console.log("start:", await status());
  await set(/รอแก้ไข/);
  console.log("picture row รอแก้ไข:", await status());
  await page.screenshot({ path: `${SHOTS}/gate-${label}-picture-pending.png`, fullPage: true });
  await set(/ผ่าน \(Comply\)/);
  console.log("picture row ผ่าน:", await status());
}

if (mode === "rows") {
  for (const row of await page.locator("tbody tr").filter({ has: page.getByRole("button", { name: items[0], exact: true }) }).all()) {
    console.log((await row.innerText()).replace(/\s+/g, " ").slice(0, 140));
  }
}

if (mode === "state") {
  for (const label of items) console.log(label, "→", (await itemRow(label).innerText()).replace(/\s+/g, " "));
}

if (mode === "review") {
  await page.getByRole("button", { name: "ตามข้อใน SOC" }).first().click().catch(() => {});
  for (const label of items) {
    const buttons = imageRowButtons(label);
    const count = await buttons.count();
    console.log(label, "image rows on the review page:", count);
    for (let i = 0; i < count; i++) {
      await buttons.nth(i).click();
      await page.waitForTimeout(2500);
      const detail = page.getByRole("complementary").first();
      console.log("---", label, i, "\n", (await detail.innerText()).slice(0, 1500));
      await page.screenshot({ path: `${SHOTS}/review-${label}-${i}.png`, fullPage: false });
    }
  }
}

// Decides the item's text rows, then its Image Rows (the picture last), printing the confirmed count after each.
if (mode === "decide") {
  const [label, majorItem = label] = items; // the rows' item, and the major item it is in
  const confirmed = async () => `${await page.getByText(/ยืนยันแล้ว \d+\/\d+ ข้อ/).first().innerText()} | job page: ${(await itemRow(majorItem).locator("td").nth(2).innerText()).replace(/\s+/g, " ")}`;
  const decide = async (button) => {
    await button.click();
    const detail = page.getByRole("complementary").first();
    await detail.getByRole("radio", { name: /ผ่าน \(Comply\)/ }).click();
    await detail.getByRole("button", { name: "ยืนยันข้อนี้" }).click();
    await page.waitForTimeout(2500);
  };
  // Rows of the item with no Final Decision yet (its last column shows "—").
  const undecided = (image) => page.locator("tbody tr")
    .filter({ [image ? "has" : "hasNot"]: page.locator("span", { hasText: /^รูป$/ }) })
    .filter({ has: page.locator("td:last-child", { hasText: /^\s*—\s*$/ }) })
    .getByRole("button", { name: label, exact: true });
  console.log("before:", await confirmed());
  while (await undecided(false).count()) await decide(undecided(false).first());
  await page.reload({ waitUntil: "networkidle" });
  console.log("text rows decided, Image Rows not:", await confirmed());
  await page.screenshot({ path: `${SHOTS}/decide-${label}-before-picture.png` });
  while (await undecided(true).count()) await decide(undecided(true).first());
  await page.reload({ waitUntil: "networkidle" });
  console.log("every row decided:", await confirmed());
}

await browser.close();
