# Terminal Panel: Security Analysis

## Threat Model Context

Carbide is a Tauri desktop app with existing filesystem and shell access (git commands via git2). An embedded PTY terminal does not fundamentally change the threat model — it runs as the same user who launched the app and can't do anything the user couldn't already do in Terminal.app. There is no remote attack surface (unlike web-based terminals like Jupyter or code-server).

## Real Risks and Mitigations

### 1. Markdown/Plugin to Terminal Injection

**Risk:** If a malicious `.md` file or plugin can programmatically send commands to the terminal, that's a code execution vector.

**Mitigation:** Never allow document content or plugins to write to the PTY stdin. The terminal must be user-input-only. No API path from document rendering or plugin context to terminal input.

### 2. Terminal Escape Sequence Attacks

**Risk:** Malicious output (e.g., from `cat`-ing a crafted file) can exploit terminal emulator vulnerabilities: title-bar injection, clipboard hijacking, OSC 52 clipboard writes, or link spoofing.

**Mitigation:** Use a well-maintained terminal emulator library (xterm.js). Sanitize/limit which escape sequences are honored. Disable OSC 52 (clipboard write) by default.

### 3. Tauri IPC Surface Expansion

**Risk:** New Tauri commands (`spawn_pty`, `write_pty`, `resize_pty`, etc.) are new IPC endpoints the webview can call.

**Mitigation:** Scope these commands tightly in Tauri capability/permission config. Don't allow arbitrary command execution from the frontend — the backend should spawn a fixed shell (user's default shell) only.

### 4. Session Persistence / Credential Leakage

**Risk:** If terminal history or scrollback is persisted to disk, it could contain secrets (tokens, passwords typed in prompts).

**Mitigation:** Don't persist terminal scrollback. If persistence is needed, treat it as sensitive data with appropriate access controls.

### 5. Working Directory Trust

**Risk:** The terminal opens in the vault directory. If a vault is cloned from an untrusted source, tools like direnv (`.envrc`) or asdf (`.tool-versions`) could auto-execute.

**Mitigation:** This is inherent to opening any terminal in any directory — not specific to Carbide. No special mitigation needed beyond what the user's shell already provides.

## Implementation Guardrails

- Use **xterm.js** on the frontend + a Rust PTY crate (`portable-pty` or raw `openpty`) on the backend
- **One-way data flow**: only user keystrokes go to PTY stdin; never programmatic writes from document/plugin context
- **Scope Tauri permissions** for PTY commands in the capability config
- **Disable OSC 52** (clipboard write escape sequence) by default
- **Don't persist scrollback** to disk
