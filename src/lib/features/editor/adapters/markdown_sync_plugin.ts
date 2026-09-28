import { Plugin } from "@milkdown/kit/prose/state";
import { $prose } from "@milkdown/kit/utils";

export function create_markdown_sync_plugin(publish_markdown: () => void) {
  return $prose(
    () =>
      new Plugin({
        view: () => {
          let pending_update: ReturnType<typeof setTimeout> | undefined;
          return {
            update(view, previous_state) {
              if (view.state.doc === previous_state.doc) return;
              clearTimeout(pending_update);
              // Read the live buffer when the timer fires, not a previous tab's transaction.
              pending_update = setTimeout(publish_markdown, 200);
            },
            destroy() {
              clearTimeout(pending_update);
            },
          };
        },
      }),
  );
}
