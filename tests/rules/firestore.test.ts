import fs from "node:fs";
import { initializeTestEnvironment, assertFails, RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, collection, getDocs } from "firebase/firestore";
import { beforeAll, afterAll, test } from "vitest";

let environment: RulesTestEnvironment;
beforeAll(async () => {
  if (process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8085") throw new Error("Rules tests require the local emulator.");
  environment = await initializeTestEnvironment({
    projectId: "demo-vibeestimate",
    firestore: { host: "127.0.0.1", port: 8085, rules: fs.readFileSync("firestore.rules", "utf8") }
  });
});
afterAll(async () => { await environment?.cleanup(); });
test("browser clients cannot bypass the API, even for their own claimed owner path", async () => {
  const db = environment.authenticatedContext("owner-a").firestore();
  await assertFails(setDoc(doc(db, "users/owner-a/projects/project-a"), { name: "Private" }));
  await assertFails(getDoc(doc(db, "users/owner-a/projects/project-a")));
});
test("another account and unauthenticated clients cannot read or list data", async () => {
  const other = environment.authenticatedContext("owner-b").firestore();
  const guest = environment.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(other, "users/owner-a/projects/project-a")));
  await assertFails(getDocs(collection(other, "users/owner-a/projects")));
  await assertFails(getDoc(doc(guest, "users/owner-a/projects/project-a")));
});
