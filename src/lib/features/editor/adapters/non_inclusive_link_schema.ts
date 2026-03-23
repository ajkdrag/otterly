import { linkSchema } from "@milkdown/kit/preset/commonmark";
type LinkSchemaExtender = Parameters<typeof linkSchema.extendSchema>[0];

export const override_link_schema_to_be_non_inclusive: LinkSchemaExtender =
  (previous) => (ctx) => ({
    ...previous(ctx),
    inclusive: false,
  });

export const non_inclusive_link_schema = linkSchema.extendSchema(
  override_link_schema_to_be_non_inclusive,
);
