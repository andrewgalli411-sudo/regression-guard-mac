import { clipboard } from "electron";

/**
 * Read the user's clipboard.
 * User is expected to have already copied the text they want analyzed (Cmd+C).
 * Returns the clipboard contents, or empty string if nothing is there.
 */
export function captureSelection(): string {
  return clipboard.readText().trim();
}
