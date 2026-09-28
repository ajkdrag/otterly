const EDITOR_ZOOM_STEP = 0.1;
const EDITOR_ZOOM_MIN = 0.5;
const EDITOR_ZOOM_MAX = 2;

// Round to one decimal so repeated steps don't drift (0.1 + 0.2 != 0.3).
export function step_editor_zoom(zoom: number, direction: 1 | -1): number {
  const next = Math.round((zoom + direction * EDITOR_ZOOM_STEP) * 10) / 10;
  return Math.min(EDITOR_ZOOM_MAX, Math.max(EDITOR_ZOOM_MIN, next));
}
