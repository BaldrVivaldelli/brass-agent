import { defineConfig } from "tsup";

const common = {
  entry: {
    index: "src/agent/index.ts",
    cli: "src/agent/cli/main.ts",
  },
  platform: "node" as const,
  target: "node18" as const,
  splitting: false,
  sourcemap: false,
  outDir: "dist",
  // `brass-runtime` is a peer: it must never be bundled in.
  external: ["brass-runtime"],
};

export default defineConfig([
  {
    ...common,
    format: ["cjs"],
    clean: true,
    outExtension: () => ({ js: ".cjs" }),
  },
  {
    ...common,
    format: ["esm"],
    clean: false,
    outExtension: () => ({ js: ".mjs" }),
  },
  {
    entry: { index: "src/agent/index.ts" },
    platform: "node",
    target: "node18",
    format: ["esm"],
    splitting: false,
    sourcemap: false,
    outDir: "dist",
    clean: false,
    external: ["brass-runtime"],
    dts: { only: true },
    outExtension: () => ({ dts: ".d.ts" }),
  },
]);
