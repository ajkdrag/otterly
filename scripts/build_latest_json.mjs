import fs from "node:fs";
import path from "node:path";
import { parseScriptArgs } from "./parse_script_args.mjs";

function readMetadataFiles(directory) {
  if (!fs.existsSync(directory)) {
    throw new Error(`Metadata directory not found: ${directory}`);
  }

  return fs
    .readdirSync(directory)
    .filter((name) => name.endsWith(".json"))
    .map((name) =>
      JSON.parse(fs.readFileSync(path.join(directory, name), "utf8")),
    );
}

function readReleaseAssets(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function encodeAssetName(assetName) {
  return assetName
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

function resolveReleaseAssetName(platform, releaseAssets) {
  const matcher =
    platform === "darwin-aarch64"
      ? (name) => name.endsWith("_aarch64.app.tar.gz")
      : platform === "darwin-x86_64"
        ? (name) => name.endsWith("_x64.app.tar.gz")
        : platform === "linux-x86_64"
          ? (name) =>
              name.endsWith(".AppImage") && !name.endsWith(".AppImage.sig")
          : platform === "windows-x86_64"
            ? (name) => name.endsWith("-setup.exe")
            : null;

  if (!matcher) {
    throw new Error(`Unsupported updater platform: ${platform}`);
  }

  const assetName = releaseAssets.find(matcher);

  if (!assetName) {
    throw new Error(`No uploaded release asset found for ${platform}`);
  }

  return assetName;
}

const args = parseScriptArgs(process.argv.slice(2));
const inputDir = args.get("input-dir");
const releaseAssetsPath = args.get("release-assets");
const repo = args.get("repo");
const tag = args.get("tag");
const outputPath = args.get("output");

if (!inputDir || !releaseAssetsPath || !repo || !tag || !outputPath) {
  throw new Error(
    "Missing required arguments: --input-dir, --release-assets, --repo, --tag, --output",
  );
}

const workspaceRoot = path.resolve(import.meta.dirname, "..");
const metadataEntries = readMetadataFiles(path.join(workspaceRoot, inputDir));
const releaseAssets = readReleaseAssets(
  path.join(workspaceRoot, releaseAssetsPath),
);

if (metadataEntries.length === 0) {
  throw new Error("No updater metadata files found");
}

const version = metadataEntries[0].version;
const platforms = {};

for (const entry of metadataEntries) {
  if (entry.version !== version) {
    throw new Error("Mismatched app versions in updater metadata");
  }

  if (platforms[entry.platform]) {
    throw new Error(
      `Duplicate updater platform metadata for ${entry.platform}`,
    );
  }

  const assetName = resolveReleaseAssetName(entry.platform, releaseAssets);

  platforms[entry.platform] = {
    signature: entry.signature,
    url: `https://github.com/${repo}/releases/download/${tag}/${encodeAssetName(assetName)}`,
  };
}

const manifest = {
  version,
  pub_date: new Date().toISOString(),
  platforms,
};

fs.writeFileSync(
  path.join(workspaceRoot, outputPath),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
