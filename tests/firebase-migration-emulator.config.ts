import { defineConfig } from "vitest/config";

// Explicit integration entrypoint; this suite needs two isolated Auth emulators.
export default defineConfig({
  test: {
    include: ["tests/firebase-migration-emulator.test.ts"],
    testTimeout: 20000,
    hookTimeout: 20000,
    fileParallelism: false,
  },
});
