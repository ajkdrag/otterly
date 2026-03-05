import type { Vault } from "$lib/shared/types/vault";

export function clamp_vault_selection(index: number, total: number): number {
  if (total <= 0) {
    return -1;
  }
  if (index < 0) {
    return 0;
  }
  if (index >= total) {
    return total - 1;
  }
  return index;
}

export function move_vault_selection(
  current: number,
  total: number,
  direction: 1 | -1,
): number {
  if (total <= 0) {
    return -1;
  }

  if (current < 0) {
    return direction === 1 ? 0 : total - 1;
  }

  return (current + direction + total) % total;
}

export function duplicate_vault_names(vaults: Vault[]): Set<string> {
  const name_counts = new Map<string, number>();
  for (const vault of vaults) {
    name_counts.set(vault.name, (name_counts.get(vault.name) ?? 0) + 1);
  }

  const duplicates = new Set<string>();
  for (const [name, count] of name_counts.entries()) {
    if (count > 1) {
      duplicates.add(name);
    }
  }
  return duplicates;
}

export function format_vault_path(
  path: string,
  vault_name: string,
  duplicate_names: Set<string>,
): string {
  if (duplicate_names.has(vault_name)) {
    return path;
  }
  const parts = path.split(/[/\\]/);
  if (parts.length > 3) {
    return `.../${parts.slice(-2).join("/")}`;
  }
  return path;
}
