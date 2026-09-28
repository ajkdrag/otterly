import { Plugin } from "@milkdown/kit/prose/state";
import { splitListItem } from "@milkdown/kit/prose/schema-list";
import { $prose } from "@milkdown/kit/utils";

export const task_list_enter_plugin = $prose(
  () =>
    new Plugin({
      props: {
        handleKeyDown(view, event) {
          if (
            event.key !== "Enter" ||
            event.shiftKey ||
            event.altKey ||
            event.ctrlKey ||
            event.metaKey ||
            event.isComposing ||
            view.composing
          ) {
            return false;
          }

          const { $from } = view.state.selection;
          if ($from.depth < 2) return false;

          const item = $from.node(-1);
          if (item.type.name !== "list_item" || item.attrs.checked === null) {
            return false;
          }

          return splitListItem(item.type)(view.state, (tr) => {
            const { $from: $next } = tr.selection;
            const next_item_depth = $next.depth - 1;
            if (
              next_item_depth >= 1 &&
              $next.node(next_item_depth).type === item.type
            ) {
              // The split command's attrs argument is ignored for mid-text splits.
              tr.setNodeAttribute(
                $next.before(next_item_depth),
                "checked",
                false,
              );
            }
            view.dispatch(tr);
          });
        },
      },
    }),
);
