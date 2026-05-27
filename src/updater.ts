import { autoUpdater } from "electron-updater";
import { dialog } from "electron";

export function initUpdater(): void {
  // Skip update check in dev (no NODE_ENV set = dev via npm run dev)
  if (!process.env.NODE_ENV || process.env.NODE_ENV === "development") {
    console.log("[updater] Skipping update check in dev");
    return;
  }

  autoUpdater.autoDownload = false; // Ask user before downloading
  autoUpdater.autoInstallOnAppQuit = true; // Install when user quits

  autoUpdater.on("error", (err) => {
    console.error("[updater] Error:", err);
  });

  autoUpdater.on("update-available", async (info) => {
    const response = await dialog.showMessageBox({
      type: "info",
      buttons: ["Download now", "Later"],
      defaultId: 0,
      cancelId: 1,
      title: "Update available",
      message: `regression.guard ${info.version} is available`,
      detail: "A new version is ready to download. Install on next quit.",
    });
    if (response.response === 0) {
      autoUpdater.downloadUpdate();
    }
  });

  autoUpdater.on("update-downloaded", () => {
    console.log("[updater] Update downloaded — will install on quit");
  });

  // Initial check, then every 4 hours
  autoUpdater
    .checkForUpdates()
    .catch((err) => console.error("[updater] check failed:", err));
  setInterval(
    () => {
      autoUpdater
        .checkForUpdates()
        .catch((err) => console.error("[updater] check failed:", err));
    },
    4 * 60 * 60 * 1000
  );
}
