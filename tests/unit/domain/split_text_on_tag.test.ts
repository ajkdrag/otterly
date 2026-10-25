import { describe, expect, it } from "vitest";
import { split_text_on_tag } from "$lib/features/tags/domain/split_text_on_tag";

const tag = (text: string) => ({ text, is_tag: true });
const plain = (text: string) => ({ text, is_tag: false });

describe("split_text_on_tag", () => {
  it("splits around a tag and keeps the original spelling", () => {
    expect(
      split_text_on_tag("ship the beta #Project by Friday", ["project"]),
    ).toEqual([plain("ship the beta "), tag("#Project"), plain(" by Friday")]);
  });

  it("matches precomposed and decomposed spellings as one tag", () => {
    const decomposed = "café";
    expect(split_text_on_tag("go to #café now", [decomposed])).toEqual([
      plain("go to "),
      tag("#café"),
      plain(" now"),
    ]);
  });

  it("does not match a tag that is only the start of a longer tag", () => {
    expect(split_text_on_tag("#ab and #a/b and #a", ["a"])).toEqual([
      plain("#ab and #a/b and "),
      tag("#a"),
    ]);
  });

  it("marks several tags and leaves the other tags alone", () => {
    expect(split_text_on_tag("#a, #b and #c", ["a", "c"])).toEqual([
      tag("#a"),
      plain(", #b and "),
      tag("#c"),
    ]);
  });

  it("drops a trailing underscore or slash from the match, like the index", () => {
    expect(split_text_on_tag("_see #todo_ and #x/", ["todo", "x"])).toEqual([
      plain("_see "),
      tag("#todo"),
      plain("_ and "),
      tag("#x"),
      plain("/"),
    ]);
  });

  it("ignores a hash glued to the end of a word", () => {
    expect(split_text_on_tag("C#project and ##project", ["project"])).toEqual([
      plain("C#project and ##project"),
    ]);
  });

  it("finds a tag after an astral letter without splitting it", () => {
    expect(split_text_on_tag("\u{1D4D0}#x", ["x"])).toEqual([
      plain("\u{1D4D0}#x"),
    ]);
  });

  it("marks a tag that holds emoji whole and ignores a hash after one", () => {
    expect(
      split_text_on_tag(
        "#\u{1F525}hot and \u{1F525}#hot and #\u{1F9D1}\u{1F3FD}",
        ["\u{1F525}hot", "hot", "\u{1F9D1}\u{1F3FD}"],
      ),
    ).toEqual([
      tag("#\u{1F525}hot"),
      plain(" and \u{1F525}#hot and "),
      tag("#\u{1F9D1}\u{1F3FD}"),
    ]);
  });

  it("returns the whole text when there is nothing to mark", () => {
    expect(split_text_on_tag("plain text", ["x"])).toEqual([
      plain("plain text"),
    ]);
    expect(split_text_on_tag("", ["x"])).toEqual([]);
  });
});
