import DOMPurify from "dompurify";
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";
import { looks_like_markdown } from "./markdown_paste_utils";

const converter = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-",
});
converter.use(gfm);

export function clipboard_html_to_markdown(
  html: string,
  plain_text: string,
): string {
  if (looks_like_markdown(plain_text)) return plain_text;
  return converter.turndown(DOMPurify.sanitize(html));
}
