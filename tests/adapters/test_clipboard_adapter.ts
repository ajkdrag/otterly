import type { ClipboardPort } from "$lib/features/clipboard";

export function create_test_clipboard_adapter(): ClipboardPort & {
  _calls: { write_text: string[] };
} {
  const calls = { write_text: [] as string[] };

  return {
    _calls: calls,
    write_text(text) {
      calls.write_text.push(text);
      return Promise.resolve();
    },
    read_text: () => Promise.resolve(""),
  };
}
