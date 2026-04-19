import { describe, expect, it } from "vitest";
import { get_asset_write_options } from "$lib/features/note/application/note_action_helpers";
import { DEFAULT_EDITOR_SETTINGS } from "$lib/shared/types/editor_settings";

describe("get_asset_write_options", () => {
  it("returns attachment_folder when store_attachments_with_note is false", () => {
    const settings = {
      ...DEFAULT_EDITOR_SETTINGS,
      store_attachments_with_note: false,
      attachment_folder: "my-assets",
    };

    expect(get_asset_write_options(settings)).toEqual({
      attachment_folder: "my-assets",
    });
  });

  it("falls back to .assets when attachment_folder is empty", () => {
    const settings = {
      ...DEFAULT_EDITOR_SETTINGS,
      store_attachments_with_note: false,
      attachment_folder: "",
    };

    expect(get_asset_write_options(settings)).toEqual({
      attachment_folder: ".assets",
    });
  });

  it("returns only store_with_note: true and omits attachment_folder when store_attachments_with_note is true", () => {
    const settings = {
      ...DEFAULT_EDITOR_SETTINGS,
      store_attachments_with_note: true,
      attachment_folder: "my-assets",
    };

    expect(get_asset_write_options(settings)).toEqual({
      store_with_note: true,
    });
  });
});
