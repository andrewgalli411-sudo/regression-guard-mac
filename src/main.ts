import { app } from "electron";
import { createTray } from "./tray";
import { registerHotkey, unregisterAll } from "./hotkey";

app.whenReady().then(() => {
  // Hide dock icon — this is a menu bar app, not a windowed app
  app.dock?.hide();

  createTray();

  registerHotkey((text: string) => {
    console.log("[main] Captured selection:");
    console.log("---");
    console.log(text);
    console.log("---");
    console.log(`[main] Length: ${text.length} chars`);
    // Phase 2 will hand this off to the API client + result window
  });

  console.log(
    "[main] regression.guard ready. Hotkey active. Tray icon should be in menu bar."
  );
});

app.on("will-quit", () => {
  unregisterAll();
});

// Prevent app from quitting when all windows close (we have no windows yet)
app.on("window-all-closed", () => {
  // intentionally empty — app lives in the menu bar, not windows
});
