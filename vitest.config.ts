import { defineConfig } from "vitest/config";
import path from "node:path";

// Keep vitest scoped to unit tests under src/. Playwright owns e2e/*.
export default defineConfig({
  test: {
    exclude: ["node_modules", "e2e/**", ".next/**", "dist/**"],
    environment: "node",
  },
  resolve: {
    // Mirror Next's `@/` alias so unit tests can import src/* the same way.
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
