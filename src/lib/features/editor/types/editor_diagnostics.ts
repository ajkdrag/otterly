export type EditorEngine = "source" | "milkdown";

export type EditorEngineDiagnostics = {
  selection: { anchor: number; head: number; coordinates: string } | null;
  parser: {
    parsed_to: number;
    document_length: number;
    complete: boolean;
    viewport_from: number;
    viewport_to: number;
  } | null;
};

export type EditorDiagnosticRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type EditorDiagnosticSnapshot = {
  engine: EditorEngine;
  note_path: string;
  captured_at: string;
  source: string;
  details: EditorEngineDiagnostics | null;
  focus: string;
  dom_selection: {
    anchor: string;
    anchor_offset: number;
    focus: string;
    focus_offset: number;
    collapsed: boolean;
    caret: EditorDiagnosticRect | null;
  } | null;
  scroll: { element: string; top: number; left: number; height: number }[];
  blocks: {
    element: string;
    from: string | null;
    rect: EditorDiagnosticRect;
  }[];
  trace: {
    time: number;
    event: string;
    detail: string;
    target: string;
    selection: EditorEngineDiagnostics["selection"];
    caret: EditorDiagnosticRect | null;
    scroll: { element: string; top: number; left: number }[];
  }[];
};
