import { BrowserWindow } from "electron";
import path from "path";

let onboardingWindow: BrowserWindow | null = null;

export function createOnboardingWindow(): BrowserWindow {
  if (onboardingWindow && !onboardingWindow.isDestroyed()) {
    onboardingWindow.show();
    onboardingWindow.focus();
    return onboardingWindow;
  }

  onboardingWindow = new BrowserWindow({
    width: 540,
    height: 620,
    show: true,
    resizable: false,
    fullscreenable: false,
    minimizable: false,
    maximizable: false,
    title: "Welcome to regression.guard",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      // __dirname = dist/windows/ at runtime
      preload: path.join(__dirname, "..", "preload.js"),
    },
  });

  // HTML copied to dist/windows/ by build script
  onboardingWindow.loadFile(path.join(__dirname, "onboarding.html"));

  onboardingWindow.on("closed", () => {
    onboardingWindow = null;
  });

  return onboardingWindow;
}

export function getOnboardingWindow(): BrowserWindow | null {
  return onboardingWindow;
}
