// The client names list (.scratch/question-search issue 02): client codes as
// written on Project Cards with their Thai names and abbreviations, kept by
// admins in Admin Center for Question Search. It is only a list of names —
// it never validates or changes a card's Client, and the ingest ignores it.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import { setupTestDatabase } from "@/test/db";

const skip = setupTestDatabase();

type Actor = Awaited<ReturnType<typeof prisma.user.create>>;
let signedIn: Actor | null = null;
mock.module("@/lib/session", { namedExports: { getCurrentUser: async () => signedIn } });
mock.module("next/cache", { namedExports: { revalidatePath: () => {} } });
mock.module("next/navigation", { namedExports: { redirect: () => { throw new Error("REDIRECT"); } } });

const { createProjectCardClient, updateProjectCardClient, deleteProjectCardClient } = await import("@/actions/projectCardClients");
const { POST: ingest } = await import("@/app/api/project-card/ingest/route");

const KEY = "test-ingest-key";
process.env.PROJECT_CARD_INGEST_KEY = KEY;

async function signIn(role: "ADMIN" | "USER" = "ADMIN") {
  signedIn = await prisma.user.create({
    data: { username: `u-${role}`, passwordHash: "x", displayName: "ผู้ใช้", role, appAccess: ["project-card"] },
  });
}

const clients = () => prisma.projectCardClient.findMany({ orderBy: { code: "asc" }, select: { code: true, names: true } });

test("an admin adds, edits and removes a client entry", { skip }, async () => {
  await signIn();
  assert.deepEqual(await createProjectCardClient({ code: " PEA ", names: [" การไฟฟ้าส่วนภูมิภาค ", "กฟภ."] }), { ok: true });
  assert.deepEqual(await clients(), [{ code: "PEA", names: ["การไฟฟ้าส่วนภูมิภาค", "กฟภ."] }]);

  const pea = await prisma.projectCardClient.findUniqueOrThrow({ where: { code: "PEA" } });
  assert.deepEqual(await updateProjectCardClient(pea.id, { code: "PEA", names: ["กฟภ."] }), { ok: true });
  assert.deepEqual(await clients(), [{ code: "PEA", names: ["กฟภ."] }]);

  assert.deepEqual(await deleteProjectCardClient(pea.id), { ok: true });
  assert.deepEqual(await clients(), []);
  const actions = (await prisma.auditLog.findMany({ orderBy: { createdAt: "asc" } })).map((a) => a.action);
  assert.deepEqual(actions, ["PROJECT_CARD_CLIENT_CREATED", "PROJECT_CARD_CLIENT_CHANGED", "PROJECT_CARD_CLIENT_DELETED"]);
});

test("a code appears once, a name names one client, and blanks are rejected", { skip }, async () => {
  await signIn();
  await createProjectCardClient({ code: "CAT", names: ["กสท"] });
  for (const bad of [
    { code: "  ", names: ["ทีโอที"] },
    { code: "TOT", names: [] },
    { code: "TOT", names: ["ทีโอที", " "] },
    { code: "TOT", names: ["ทีโอที", "ทีโอที"] },
    { code: "cat", names: ["แคท"] }, // the code again, in another case
    { code: "TOT", names: ["กสท"] }, // another client's name
    { code: "TOT", names: ["Cat"] }, // another client's code
  ]) {
    assert.equal((await createProjectCardClient(bad)).ok, false, JSON.stringify(bad));
  }
  assert.deepEqual(await clients(), [{ code: "CAT", names: ["กสท"] }]);

  // Editing checks the same, and a client may keep its own code among its names.
  const cat = await prisma.projectCardClient.findUniqueOrThrow({ where: { code: "CAT" } });
  await createProjectCardClient({ code: "TOT", names: ["ทีโอที"] });
  assert.equal((await updateProjectCardClient(cat.id, { code: "TOT", names: ["กสท"] })).ok, false);
  assert.equal((await updateProjectCardClient(cat.id, { code: "CAT", names: ["ทีโอที"] })).ok, false);
  assert.deepEqual(await updateProjectCardClient(cat.id, { code: "CAT", names: ["กสท", "Cat"] }), { ok: true });
});

test("only an admin can change the client list", { skip }, async () => {
  await signIn("USER");
  await assert.rejects(() => createProjectCardClient({ code: "PEA", names: ["กฟภ."] }));
  assert.deepEqual(await clients(), []);
});

test("the list never touches a card's Client: pushes and edits leave cards as they are", { skip }, async () => {
  await signIn();
  await createProjectCardClient({ code: "PEA", names: ["กฟภ."] });
  const response = await ingest(
    new Request("http://localhost/api/project-card/ingest", {
      method: "POST",
      headers: { authorization: `Bearer ${KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ projects: [{ projectCode: "X001", client: "NBTC (TKC)", projectName: "โครงการ X", contractPath: String.raw`\\192.168.99.1\PS\_BID\01 Contract\NBTC\X001.pdf` }] }),
    }),
  );
  const result = (await response.json()) as { created: number; rejected: number; errors: unknown[] };
  assert.deepEqual([result.created, result.rejected], [1, 0], JSON.stringify(result.errors)); // a Client not in the list is accepted
  await prisma.projectCard.create({
    data: { projectCode: "P001", client: "PEA", projectName: "โครงการ P", descriptionTh: "", descriptionEn: "" },
  });

  const pea = await prisma.projectCardClient.findUniqueOrThrow({ where: { code: "PEA" } });
  await updateProjectCardClient(pea.id, { code: "PEA-X", names: ["กฟภ."] });
  await deleteProjectCardClient(pea.id);
  const cards = await prisma.projectCard.findMany({ orderBy: { projectCode: "asc" }, select: { projectCode: true, client: true } });
  assert.deepEqual(cards, [
    { projectCode: "P001", client: "PEA" },
    { projectCode: "X001", client: "NBTC (TKC)" },
  ]);
});
