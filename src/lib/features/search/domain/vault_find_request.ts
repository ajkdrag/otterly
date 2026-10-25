import type { TagMatch } from "$lib/features/tags";
import type { VaultFindRequest } from "$lib/features/search/types/vault_find";

export type VaultFindInputs = {
  query: string;
  regex: boolean;
  case_sensitive: boolean;
  whole_word: boolean;
  include: string;
  exclude: string;
};

export type VaultFindChips = {
  tags: string[];
  tag_match: TagMatch;
};

// The Text mode inputs and the omnibar's chips as a request, or null when
// there is nothing to search. The replacement and the selection are not part
// of it: typing a replacement or moving through matches must not search again.
export function build_vault_find_request(
  inputs: VaultFindInputs,
  chips: VaultFindChips,
): VaultFindRequest | null {
  if (!inputs.query) return null;
  return {
    text: inputs.query,
    regex: inputs.regex,
    case_sensitive: inputs.case_sensitive,
    whole_word: inputs.whole_word,
    include: inputs.include,
    exclude: inputs.exclude,
    tags: chips.tags,
    tag_match: chips.tag_match,
  };
}

// Equal keys mean the same search. The reactor uses it to skip a search that
// would change nothing, and Text mode to tell whether the rows on screen
// belong to the inputs (`results.request`) or to an older request.
export function vault_find_request_key(request: VaultFindRequest): string {
  return JSON.stringify([
    request.text,
    request.regex,
    request.case_sensitive,
    request.whole_word,
    request.include,
    request.exclude,
    request.tags,
    request.tag_match,
  ]);
}

// One match in the results. The ordinal goes first: it has no ":", so any
// path is fine after it.
export function vault_find_match_key(path: string, index: number): string {
  return `${String(index)}:${path}`;
}
