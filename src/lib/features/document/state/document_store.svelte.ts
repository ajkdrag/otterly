import type { DocumentFileType } from "$lib/features/document/types/document";

export type DocumentViewerState = {
  tab_id: string;
  file_path: string;
  file_type: DocumentFileType;
  zoom: number;
  scroll_top: number;
  pdf_page: number;
  content: string | null;
  asset_url: string | null;
};

export class DocumentStore {
  viewer_states = $state<Map<string, DocumentViewerState>>(new Map());

  set_viewer_state(tab_id: string, state: DocumentViewerState): void {
    this.viewer_states = new Map(this.viewer_states).set(tab_id, state);
  }

  get_viewer_state(tab_id: string): DocumentViewerState | undefined {
    return this.viewer_states.get(tab_id);
  }

  remove_viewer_state(tab_id: string): void {
    const next = new Map(this.viewer_states);
    next.delete(tab_id);
    this.viewer_states = next;
  }

  update_zoom(tab_id: string, zoom: number): void {
    this.#patch(tab_id, { zoom });
  }

  update_scroll(tab_id: string, scroll_top: number): void {
    this.#patch(tab_id, { scroll_top });
  }

  update_pdf_page(tab_id: string, page: number): void {
    this.#patch(tab_id, { pdf_page: page });
  }

  #patch(tab_id: string, fields: Partial<DocumentViewerState>): void {
    const state = this.viewer_states.get(tab_id);
    if (!state) return;
    this.viewer_states = new Map(this.viewer_states).set(tab_id, {
      ...state,
      ...fields,
    });
  }
}
