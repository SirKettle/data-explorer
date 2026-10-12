// The documentation site (US072 Step 6). Every demo on it imports the package from ../src, so the
// docs always run the code in this commit, and every page shows the very file its demo runs.
import react from "@astrojs/react";
import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";
import { fileURLToPath } from "node:url";
import starlightLinksValidator from "starlight-links-validator";
import starlightTypeDoc, { typeDocSidebarGroup } from "starlight-typedoc";

const src = (file) => fileURLToPath(new URL(`../src/${file}`, import.meta.url));

export default defineConfig({
  site: "https://sirkettle.github.io",
  base: "/data-explorer",
  integrations: [
    react(),
    starlight({
      title: "data-explorer",
      description: "A continuous, zoomable explorer for tree- and graph-shaped data, with an accessible outline.",
      social: [{ icon: "github", label: "GitHub", href: "https://github.com/SirKettle/data-explorer" }],
      editLink: { baseUrl: "https://github.com/SirKettle/data-explorer/edit/main/site/" },
      customCss: ["./src/styles/demo.css"],
      plugins: [
        starlightLinksValidator({ errorOnRelativeLinks: false }),
        starlightTypeDoc({
          entryPoints: [src("index.ts"), src("headless.ts"), src("pixi.ts")],
          tsconfig: fileURLToPath(new URL("./tsconfig.typedoc.json", import.meta.url)),
          output: "reference",
          sidebar: { label: "API reference", collapsed: true },
          typeDoc: { entryFileName: "index", excludePrivate: true, excludeInternal: true, sort: ["kind", "alphabetical"] },
        }),
      ],
      sidebar: [
        { label: "Start", items: ["getting-started", "concepts"] },
        { label: "Guides", items: [{ autogenerate: { directory: "guides" } }] },
        { label: "Examples", items: [{ autogenerate: { directory: "examples" } }] },
        typeDocSidebarGroup,
      ],
    }),
  ],
  vite: {
    // The demos and the examples' source live outside the site: let the dev server read them.
    server: { fs: { allow: [".."] } },
    resolve: {
      alias: [
        { find: /^@thirkettle\/data-explorer\/headless$/, replacement: src("headless.ts") },
        { find: /^@thirkettle\/data-explorer\/pixi$/, replacement: src("pixi.ts") },
        { find: /^@thirkettle\/data-explorer$/, replacement: src("index.ts") },
      ],
    },
  },
});
