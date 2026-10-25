import type {
  OmnibarQueryTarget,
  SearchQuery,
  SearchScope,
} from "$lib/shared/types/search";

const scope_tokens: Array<{
  token: string;
  scope: SearchScope;
  target: OmnibarQueryTarget;
}> = [
  { token: "@file", scope: "all", target: "files" },
  { token: "@path", scope: "path", target: "path" },
  { token: "path:", scope: "path", target: "path" },
  { token: "title:", scope: "title", target: "title" },
];

function consume_token(
  lower: string,
  trimmed: string,
  token: string,
): string | null {
  if (lower === token) {
    return "";
  }

  if (lower.startsWith(`${token} `)) {
    return trimmed.slice(token.length).trim();
  }

  if (token.endsWith(":") && lower.startsWith(token)) {
    return trimmed.slice(token.length).trim();
  }

  return null;
}

// The last whitespace separated token starts with `#`: the user is picking a
// tag filter. Matched on the raw query, so a trailing space ends the token.
// That covers `#pro` and `meeting #pro` without tracking the caret.
const tag_token = /(^|\s)#(\S*)$/;

export function parse_search_query(raw: string): SearchQuery {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { raw, text: "", scope: "all", domain: "notes", target: "all" };
  }

  const lower = trimmed.toLowerCase();

  if (trimmed.startsWith(">")) {
    return {
      raw,
      text: trimmed.slice(1).trim(),
      scope: "all",
      domain: "commands",
      target: "all",
    };
  }

  // Before #planned, so a bare `#planned` is a tag token. It used to show an
  // empty planned list. `#planned ` and `#planned docs` stay planned.
  const tag = tag_token.exec(raw);
  if (tag) {
    return {
      raw,
      text: tag[2] ?? "",
      scope: "all",
      domain: "tags",
      target: "all",
      before_tag: raw.slice(0, tag.index + (tag[1] ?? "").length).trimEnd(),
    };
  }

  if (lower === "#planned" || lower.startsWith("#planned ")) {
    return {
      raw,
      text: trimmed.slice("#planned".length).trim(),
      scope: "all",
      domain: "planned",
      target: "all",
    };
  }

  for (const { token, scope, target } of scope_tokens) {
    const text = consume_token(lower, trimmed, token);
    if (text !== null) {
      return {
        raw,
        text,
        scope,
        domain: "notes",
        target,
      };
    }
  }

  return { raw, text: trimmed, scope: "all", domain: "notes", target: "all" };
}

const query_prefix_tokens = scope_tokens.map((entry) => entry.token);

function strip_query_prefix(trimmed: string): string {
  const lower = trimmed.toLowerCase();

  for (const token of query_prefix_tokens) {
    const text = consume_token(lower, trimmed, token);
    if (text !== null) {
      return text;
    }
  }

  return trimmed;
}

export function set_search_query_target(
  raw: string,
  target: OmnibarQueryTarget,
): string {
  const parsed = parse_search_query(raw);
  if (parsed.domain !== "notes") {
    return raw;
  }

  const text = strip_query_prefix(raw.trim());
  if (!text) {
    switch (target) {
      case "files":
        return "@file ";
      case "path":
        return "@path ";
      case "title":
        return "title: ";
      default:
        return "";
    }
  }

  switch (target) {
    case "files":
      return `@file ${text}`;
    case "path":
      return `@path ${text}`;
    case "title":
      return `title: ${text}`;
    default:
      return text;
  }
}
