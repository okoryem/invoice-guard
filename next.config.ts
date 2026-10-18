import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // No development badge in the corner: screenshots and the demo video are taken locally.
  devIndicators: false,
  // PGlite loads its own WASM and data files at runtime.
  serverExternalPackages: ["@electric-sql/pglite"],
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
