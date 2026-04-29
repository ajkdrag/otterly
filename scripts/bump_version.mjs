#!/usr/bin/env node
import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function bump_patch(version) {
  const parts = version.split(".");
  parts[2] = String(Number(parts[2]) + 1);
  return parts.join(".");
}

const pkg_path = resolve(root, "package.json");
const pkg = JSON.parse(readFileSync(pkg_path, "utf-8"));
const old_version = pkg.version;
const new_version = bump_patch(old_version);

pkg.version = new_version;
writeFileSync(pkg_path, JSON.stringify(pkg, null, 2) + "\n");

const tauri_conf_path = resolve(root, "src-tauri/tauri.conf.json");
const tauri_conf = JSON.parse(readFileSync(tauri_conf_path, "utf-8"));
tauri_conf.version = new_version;
writeFileSync(tauri_conf_path, JSON.stringify(tauri_conf, null, 2) + "\n");

const cargo_path = resolve(root, "src-tauri/Cargo.toml");
let cargo = readFileSync(cargo_path, "utf-8");
cargo = cargo.replace(
  /^version = ".*"/m,
  `version = "${new_version}"`,
);
writeFileSync(cargo_path, cargo);

console.log(`Version bumped: ${old_version} → ${new_version}`);
