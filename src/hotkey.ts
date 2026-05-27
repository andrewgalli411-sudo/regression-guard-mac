import { globalShortcut, Notification } from "electron";
import { captureSelection } from "./clipboard";
import { getHotkey } from "./storage";

let registered: string | null = null;

export function registerHotkey(onCapture: (text: string) => void): boolean {
  const accelerator = getHotkey();

  if (registered === accelerator) return true;
  if (registered) globalShortcut.unregister(registered);

  const success = globalShortcut.register(accelerator, async () => {
    const text = await captureSelection();

    if (!text) {
      new Notification({
        title: "regression.guard",
        body:
          "Select text first, then press " +
          accelerator.replace(/CommandOrControl/g, "⌘"),
      }).show();
      return;
    }

    onCapture(text);
  });

  if (success) {
    registered = accelerator;
    console.log(`[hotkey] Registered ${accelerator}`);
  } else {
    console.error(
      `[hotkey] Failed to register ${accelerator} — may be in use by another app`
    );
  }

  return success;
}

export function unregisterAll(): void {
  globalShortcut.unregisterAll();
  registered = null;
}
