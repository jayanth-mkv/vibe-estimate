import fs from "node:fs";
import { initializeTestEnvironment, assertFails, RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, collection, getDocs } from "firebase/firestore";
import { beforeAll, afterAll, test } from "vitest";

let environment: RulesTestEnvironment;
beforeAll(async () => {
  const emulator = process.env.FIRESTORE_EMULATOR_HOST;
  if (!["127.0.0.1:8085", "127.0.0.1:8285"].includes(emulator ?? "")) throw new Error("Rules tests require an admitted local emulator.");
  environment = await initializeTestEnvironment({
    projectId: "demo-vibeestimate",
    firestore: { host: "127.0.0.1", port: Number(emulator!.split(":")[1]), rules: fs.readFileSync("firestore.rules", "utf8") }
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
test("room and invitation membership records are only accessible through the verified backend", async () => {
  const designer = environment.authenticatedContext("owner-a").firestore();
  const client = environment.authenticatedContext("client-a").firestore();
  const guest = environment.unauthenticatedContext().firestore();
  for (const db of [designer, client, guest]) {
    for (const path of ["rooms/room-a", "roomOwners/owner-a"]) {
      await assertFails(getDoc(doc(db, path)));
      await assertFails(setDoc(doc(db, path), { ownerUid: "owner-a", clientUid: "client-a" }));
    }
    await assertFails(getDocs(collection(db, "rooms")));
    await assertFails(getDocs(collection(db, "roomOwners")));
  }
});
test("home scenes, immutable revisions and summaries cannot bypass the owner-authorized API", async () => {
  for (const db of [environment.authenticatedContext("owner-a").firestore(), environment.authenticatedContext("owner-b").firestore(), environment.unauthenticatedContext().firestore()]) {
    for (const record of ["users/owner-a/homes/home-a", "users/owner-a/homes/home-a/revisions/revision-a", "users/owner-a/homes/home-a/summaries/revision-a", "users/owner-a/homes/home-a/agreementProse/revision-a", "homeOwners/owner-a"]) {
      await assertFails(getDoc(doc(db, record)));
      await assertFails(setDoc(doc(db, record), { ownerId: "owner-a", headRevisionId: "revision-a" }));
    }
    await assertFails(getDocs(collection(db, "users/owner-a/homes")));
  }
});
test("only backend transactions may create or read event delivery jobs", async () => {
  for (const db of [environment.authenticatedContext("owner-a").firestore(), environment.authenticatedContext("owner-b").firestore(), environment.unauthenticatedContext().firestore()]) {
    await assertFails(setDoc(doc(db, "roomReviewOutbox/forged-job"), { roomId: "room-a", ownerId: "owner-a", status: "pending" }));
    await assertFails(getDoc(doc(db, "roomReviewOutbox/forged-job")));
    await assertFails(getDocs(collection(db, "roomReviewOutbox")));
  }
});
