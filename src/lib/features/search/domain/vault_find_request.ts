import type { VaultFindRequest } from "$lib/features/search/types/vault_find";

export type VaultFindInputs = {
  query: string;
  regex: boolean;
  case_sensitive: boolean;
  whole_word: boolean;
  replacement: string;
  replace_open: boolean;
  include: string;
  exclude: string;
};

// The panel inputs as a request, or null when there is nothing to search.
// Replacement previews only show while the replace row is open and has text.
export function build_vault_find_request(
  inputs: VaultFindInputs,
): VaultFindRequest | null {
  if (!inputs.query) return null;
  return {
    text: inputs.query,
    regex: inputs.regex,
    case_sensitive: inputs.case_sensitive,
    whole_word: inputs.whole_word,
    include: inputs.include,
    exclude: inputs.exclude,
    replacement:
      inputs.replace_open && inputs.replacement ? inputs.replacement : null,
  };
}
