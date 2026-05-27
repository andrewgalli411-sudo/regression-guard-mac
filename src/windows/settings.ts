import { BrowserWindow } from "electron";
import path from "path";

let settingsWindow: BrowserWindow | null = null;

export function createSettingsWindow(): BrowserWindow {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show();
    settingsWindow.focus();
    return settingsWindow;
  }

  settingsWindow = new BrowserWindow({
    width: 560,
    height: 540,
    show: true,
    resizable: false,
    fullscreenable: false,
    title: "regression.guard Settings",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      // __dirname = dist/windows/ at runtime
      preload: path.join(__dirname, "..", "preload.js"),
    },
  });

  // HTML copied to dist/windows/ by build script
  settingsWindow.loadFile(path.join(__dirname, "settings.html"));

  settingsWindow.on("closed", () => {
    settingsWindow = null;
  });

  return settingsWindow;
}

export function getSettingsWindow(): BrowserWindow | null {
  return settingsWindow;
}
