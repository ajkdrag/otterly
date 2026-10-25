import fs from "node:fs";
import path from "node:path";
import { parseScriptArgs } from "./parse_script_args.mjs";

// Builds the updater manifest from the assets on the release and their .sig
// files, so it can only point at what was actually uploaded.
//
// The updater (tauri-plugin-updater 2.10) looks up "<os>-<arch>-<installer>"
// first, where the installer is the bundle type baked into the running
// binary, and falls back to "<os>-<arch>". With only the fallback keys an MSI
// install got the NSIS setup and ended up installed twice, and a .deb install
// got the AppImage, which install_deb cannot use. So every installer gets its
// own key, and the fallback keys stay for anything that does not know its
// bundle type.
const UPDATER_TARGETS = [
  {
    keys: ["darwin-aarch64-app", "darwin-aarch64"],
    matches: (name) => name.endsWith("_aarch64.app.tar.gz"),
  },
  {
    keys: ["darwin-x86_64-app", "darwin-x86_64"],
    matches: (name) => name.endsWith("_x64.app.tar.gz"),
  },
  {
    keys: ["linux-x86_64-appimage", "linux-x86_64"],
    matches: (name) => name.endsWith(".AppImage"),
  },
  {
    keys: ["linux-x86_64-deb"],
    matches: (name) => name.endsWith(".deb"),
  },
  {
    keys: ["windows-x86_64-nsis", "windows-x86_64"],
    matches: (name) => name.endsWith("-setup.exe"),
  },
  {
    keys: ["windows-x86_64-msi"],
    matches: (name) => name.endsWith(".msi"),
  },
];

const args = parseScriptArgs(process.argv.slice(2));
const releaseAssetsPath = args.get("release-assets");
const signaturesDir = args.get("signatures-dir");
const repo = args.get("repo");
const tag = args.get("tag");
const outputPath = args.get("output");

if (!releaseAssetsPath || !signaturesDir || !repo || !tag || !outputPath) {
  throw new Error(
    "Missing required arguments: --release-assets, --signatures-dir, --repo, --tag, --output",
  );
}

const workspaceRoot = path.resolve(import.meta.dirname, "..");
const releaseAssets = JSON.parse(
  fs.readFileSync(path.join(workspaceRoot, releaseAssetsPath), "utf8"),
);
const version = JSON.parse(
  fs.readFileSync(
    path.join(workspaceRoot, "src-tauri", "tauri.conf.json"),
    "utf8",
  ),
).version;

const platforms = {};
for (const target of UPDATER_TARGETS) {
  const assetName = releaseAssets.find(target.matches);
  if (!assetName) {
    throw new Error(`No release asset for ${target.keys[0]}`);
  }
  const signaturePath = path.join(
    workspaceRoot,
    signaturesDir,
    `${assetName}.sig`,
  );
  if (!fs.existsSync(signaturePath)) {
    throw new Error(`Missing updater signature ${assetName}.sig`);
  }
  const entry = {
    signature: fs.readFileSync(signaturePath, "utf8").trim(),
    url: `https://github.com/${repo}/releases/download/${tag}/${encodeURIComponent(assetName)}`,
  };
  for (const key of target.keys) {
    platforms[key] = entry;
  }
}

const manifest = { version, pub_date: new Date().toISOString(), platforms };
fs.writeFileSync(
  path.join(workspaceRoot, outputPath),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
