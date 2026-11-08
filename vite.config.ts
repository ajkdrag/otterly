import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig, type Plugin } from "vite";
import tailwindcss from "@tailwindcss/vite";

// KaTeX's stylesheet lists woff2, woff and ttf for each of its 20 fonts. The
// WebViews Tauri uses on macOS, Windows and Linux all read woff2, so the other
// two formats would only add size to the app.
function katex_woff2_only(): Plugin {
  return {
    name: "katex-woff2-only",
    enforce: "pre",
    transform(code, id) {
      if (!id.endsWith("katex/dist/katex.min.css")) return null;
      const stripped = code.replace(
        /,url\([^)]*\.woff\) format\("woff"\),url\([^)]*\.ttf\) format\("truetype"\)/g,
        "",
      );
      // A KaTeX release that rewrites its CSS would otherwise ship 40 more
      // font files without a word.
      if (stripped === code)
        this.error("katex_woff2_only found no woff or ttf sources to strip");
      return stripped;
    },
  };
}

export default defineConfig({
  plugins: [katex_woff2_only(), sveltekit(), tailwindcss()],
  // Keep standalone editor spikes from replacing the app's optimized modules.
  cacheDir: "node_modules/.vite/otterly",
  optimizeDeps: {
    // Code block grammars load through dynamic imports inside language-data.
    // Prebundle them up front, otherwise the first highlighted block in a dev
    // window triggers a dependency reload and its import fails.
    include: ["@codemirror/language-data"],
  },
  worker: {
    format: "es",
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    // SvelteKit limits served roots to src; the editor workspace lives beside it.
    fs: { allow: ["packages"] },
    watch: {
      ignored: ["**/src-tauri/target/**", "**/.pnpm-store/**", "**/.codex/**"],
    },
  },
  css: {
    transformer: "lightningcss",
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "packages/*/tests/**/*.test.ts"],
  },
});
