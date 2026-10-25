import { describe, it, expect } from "vitest";
import {
  parse_search_query,
  set_search_query_target,
} from "$lib/features/search/domain/search_query_parser";

describe("parse_search_query", () => {
  it("parses path scope", () => {
    const result = parse_search_query("path: foo bar");
    expect(result.scope).toBe("path");
    expect(result.text).toBe("foo bar");
    expect(result.domain).toBe("notes");
    expect(result.target).toBe("path");
  });

  it("parses content scope without space", () => {
    const result = parse_search_query("content:foo");
    expect(result.scope).toBe("content");
    expect(result.text).toBe("foo");
    expect(result.domain).toBe("notes");
    expect(result.target).toBe("content");
  });

  it("defaults to all scope and notes domain", () => {
    const result = parse_search_query("hello world");
    expect(result.scope).toBe("all");
    expect(result.text).toBe("hello world");
    expect(result.domain).toBe("notes");
    expect(result.target).toBe("all");
  });

  it("returns empty text and notes domain for blank input", () => {
    const result = parse_search_query("   ");
    expect(result.text).toBe("");
    expect(result.scope).toBe("all");
    expect(result.domain).toBe("notes");
    expect(result.target).toBe("all");
  });

  it("detects commands domain with > prefix", () => {
    const result = parse_search_query(">open settings");
    expect(result.domain).toBe("commands");
    expect(result.text).toBe("open settings");
    expect(result.scope).toBe("all");
    expect(result.target).toBe("all");
  });

  it("detects commands domain with > prefix and extra spaces", () => {
    const result = parse_search_query(">  create note");
    expect(result.domain).toBe("commands");
    expect(result.text).toBe("create note");
  });

  it("detects commands domain with bare > prefix", () => {
    const result = parse_search_query(">");
    expect(result.domain).toBe("commands");
    expect(result.text).toBe("");
  });

  it("detects planned domain with #planned prefix", () => {
    const result = parse_search_query("#planned architecture");
    expect(result.domain).toBe("planned");
    expect(result.text).toBe("architecture");
    expect(result.scope).toBe("all");
    expect(result.target).toBe("all");
  });

  it("detects planned domain case-insensitively", () => {
    const result = parse_search_query("#Planned docs");
    expect(result.domain).toBe("planned");
    expect(result.text).toBe("docs");
  });

  it("keeps #planned with a trailing space in the planned domain", () => {
    expect(parse_search_query("#planned ").domain).toBe("planned");
  });

  it("reads a last token that starts with # as a tag filter", () => {
    expect(parse_search_query("#pro")).toMatchObject({
      domain: "tags",
      text: "pro",
      before_tag: "",
    });
    expect(parse_search_query("meeting  #pro")).toMatchObject({
      domain: "tags",
      text: "pro",
      before_tag: "meeting",
    });
    expect(parse_search_query("#")).toMatchObject({
      domain: "tags",
      text: "",
    });
    expect(parse_search_query("#planned")).toMatchObject({
      domain: "tags",
      text: "planned",
    });
  });

  it("ends the tag token at a trailing space and ignores # inside a word", () => {
    expect(parse_search_query("#pro ").domain).toBe("notes");
    expect(parse_search_query("#pro meeting").domain).toBe("notes");
    expect(parse_search_query("C#").domain).toBe("notes");
    expect(parse_search_query("> #x").domain).toBe("commands");
  });

  it("preserves raw value", () => {
    const result = parse_search_query("path: test");
    expect(result.raw).toBe("path: test");
  });

  it("parses title scope case-insensitively", () => {
    const result = parse_search_query("Title:meeting notes");
    expect(result.scope).toBe("title");
    expect(result.text).toBe("meeting notes");
    expect(result.domain).toBe("notes");
    expect(result.target).toBe("title");
  });

  it("parses @file as a files-target query", () => {
    const result = parse_search_query("@file meeting");
    expect(result.scope).toBe("all");
    expect(result.text).toBe("meeting");
    expect(result.target).toBe("files");
  });

  it("parses @content as a content-target query", () => {
    const result = parse_search_query("@content roadmap");
    expect(result.scope).toBe("content");
    expect(result.text).toBe("roadmap");
    expect(result.target).toBe("content");
  });

  it("sets the query target without losing the query text", () => {
    expect(set_search_query_target("meeting notes", "files")).toBe(
      "@file meeting notes",
    );
    expect(set_search_query_target("@content meeting notes", "all")).toBe(
      "meeting notes",
    );
    expect(set_search_query_target("path: planning/q1", "content")).toBe(
      "@content planning/q1",
    );
  });
});
