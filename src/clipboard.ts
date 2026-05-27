import { clipboard } from "electron";
import { execSync } from "child_process";

/**
 * Capture the user's currently-selected text in any app.
 * Saves and restores original clipboard.
 * Returns selected text, or empty string if nothing was selected.
 */
export async function captureSelection(): Promise<string> {
  const savedClipboard = clipboard.readText();

  // Clear clipboard so we can detect if Cmd+C actually copied something
  clipboard.clear();

  // Simulate Cmd+C via AppleScript
  try {
    execSync(
      `osascript -e 'tell application "System Events" to keystroke "c" using command down'`
    );
  } catch (err) {
    console.error("[clipboard] osascript failed:", err);
    if (savedClipboard) clipboard.writeText(savedClipboard);
    return "";
  }

  // Wait for clipboard to update
  await new Promise((r) => setTimeout(r, 200));

  const captured = clipboard.readText();

  // Restore original clipboard
  if (savedClipboard) {
    clipboard.writeText(savedClipboard);
  }

  return captured.trim();
}
