export interface ClipboardPort {
  write_text: (text: string) => Promise<void>;
  // Reads natively. The web clipboard API shows a Paste button whenever the
  // text came from another app.
  read_text: () => Promise<string>;
}
