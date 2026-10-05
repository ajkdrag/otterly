import { getContext, setContext } from "svelte";
import type { AppContext } from "$lib/app/di/create_app_context";
import type { DocumentWindowContext } from "$lib/app/di/create_document_window_context";

const APP_CONTEXT_KEY = Symbol("app-context");

export function provide_app_context(value: AppContext): void {
  setContext(APP_CONTEXT_KEY, value);
}

export function use_app_context(): AppContext {
  const value = getContext<AppContext | undefined>(APP_CONTEXT_KEY);
  if (!value) {
    throw new Error("app context is not available");
  }
  return value;
}

const DOCUMENT_WINDOW_CONTEXT_KEY = Symbol("document-window-context");

export function provide_document_window_context(
  value: DocumentWindowContext,
): void {
  setContext(DOCUMENT_WINDOW_CONTEXT_KEY, value);
}

export function use_document_window_context(): DocumentWindowContext {
  const value = getContext<DocumentWindowContext | undefined>(
    DOCUMENT_WINDOW_CONTEXT_KEY,
  );
  if (!value) {
    throw new Error("document window context is not available");
  }
  return value;
}
