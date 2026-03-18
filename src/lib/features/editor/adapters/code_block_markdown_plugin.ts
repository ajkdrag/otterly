import { codeBlockSchema } from "@milkdown/kit/preset/commonmark";
import { $remark } from "@milkdown/kit/utils";
import {
  attach_code_block_visual_metadata,
  normalize_persisted_code_block_height,
  read_code_block_visual_height,
  serialize_code_block_visual_comment,
} from "./code_block_visual_metadata";

const code_block_visual_metadata_remark = $remark(
  "otterlyCodeBlockVisualMetadata",
  () => () => (tree) => {
    return attach_code_block_visual_metadata(tree);
  },
);

const code_block_schema_with_visual_height = codeBlockSchema.extendSchema(
  (prev) => (ctx) => {
    const spec = prev(ctx);

    return {
      ...spec,
      attrs: {
        ...spec.attrs,
        visual_height: {
          default: null,
        },
      },
      parseMarkdown: {
        ...spec.parseMarkdown,
        runner: (state, node, type) => {
          const language = typeof node.lang === "string" ? node.lang : "";
          const value = typeof node.value === "string" ? node.value : null;
          const visual_height = read_code_block_visual_height(node);

          state.openNode(type, { language, visual_height });
          if (value) state.addText(value);
          state.closeNode();
        },
      },
      toMarkdown: {
        ...spec.toMarkdown,
        runner: (state, node) => {
          const visual_height = normalize_persisted_code_block_height(
            node.attrs["visual_height"],
          );

          if (visual_height !== null) {
            state.addNode(
              "html",
              undefined,
              serialize_code_block_visual_comment(visual_height),
            );
          }

          state.addNode("code", undefined, node.textContent, {
            lang:
              typeof node.attrs["language"] === "string"
                ? node.attrs["language"]
                : "",
          });
        },
      },
    };
  },
);

export {
  code_block_schema_with_visual_height,
  code_block_visual_metadata_remark,
};
