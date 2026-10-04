import adapter from "@sveltejs/adapter-static";

/** @type {import('@sveltejs/kit').Config} */
const config = {
  compilerOptions: {
    runes: true,
  },
  kit: {
    alias: {
      "@otterly/markdown-editor": "./packages/markdown_editor/src/index.ts",
    },
    adapter: adapter({
      pages: "build",
      assets: "build",
      fallback: "index.html",
      precompress: false,
    }),
  },
};

export default config;
