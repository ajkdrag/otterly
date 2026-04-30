/**
 * Simple password hashing for local user authentication.
 * Uses SHA-256 with a salt for basic security.
 * Note: This is for local desktop app user switching, not network security.
 */

const SALT_PREFIX = "leapgrow_user_";

export async function hash_password(password: string): Promise<string> {
  if (!password) return "";
  const data = new TextEncoder().encode(SALT_PREFIX + password);
  const hash_buffer = await crypto.subtle.digest("SHA-256", data);
  const hash_array = Array.from(new Uint8Array(hash_buffer));
  return hash_array.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function verify_password(
  password: string,
  stored_hash: string,
): Promise<boolean> {
  if (!stored_hash) return true; // no password set = always pass
  if (!password) return false;
  const input_hash = await hash_password(password);
  return input_hash === stored_hash;
}
