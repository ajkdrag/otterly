import { describe, expect, it } from "vitest";
import { summarize_query_error } from "$lib/features/search/domain/query_error_message";

describe("summarize_query_error", () => {
  it("keeps the reason from the last error line of a regex parse error", () => {
    const raw =
      "regex parse error:\n    gamma (\n          ^\nerror: unclosed group";
    expect(summarize_query_error(raw)).toBe("Invalid regex: unclosed group");
  });

  it("falls back to the first line when there is no error line", () => {
    const raw = "Compiled regex exceeds size limit of 10485760 bytes.\nmore";
    expect(summarize_query_error(raw)).toBe(
      "Invalid regex: Compiled regex exceeds size limit of 10485760 bytes.",
    );
  });
});
