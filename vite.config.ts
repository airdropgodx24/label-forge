import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * Build setup for the LabelForge site: one page (index.html at the repo root)
 * that composes the core with both apps.
 *
 * - `base: "./"` makes every URL in the built site relative, so the same build
 *   works at the root of a domain and under a sub-path such as GitHub Pages at
 *   /label-forge/. The page keeps one URL (it does not change its path), so
 *   relative image paths in the task data resolve against the page.
 * - `publicDir` is App 1's `public/` folder, which holds the sample images at
 *   `images/ip-NN-a.svg`. Vite copies it to the root of the site, which is
 *   where the task payloads (`images/ip-NN-a.svg`) expect it. App 2 has no
 *   static files. If another app gains a `public/` folder, this needs to copy
 *   it as well.
 * - Vitest reads this file too, so the tests and the build share one setup.
 */
export default defineConfig({
  plugins: [react()],
  base: "./",
  publicDir: "apps/image-preference/public",
});
