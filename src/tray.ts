import { Tray, Menu, nativeImage } from "electron";
import path from "path";
import { getHotkey } from "./storage";

let tray: Tray | null = null;

export function createTray(): Tray {
  const iconPath = path.join(
    __dirname,
    "..",
    "src",
    "assets",
    "trayIconTemplate.png"
  );
  const icon = nativeImage.createFromPath(iconPath);
  icon.setTemplateImage(true);

  tray = new Tray(icon);
  tray.setToolTip("regression.guard");
  rebuildMenu();
  return tray;
}

export function rebuildMenu(): void {
  if (!tray) return;
  const hotkey = getHotkey().replace(/CommandOrControl/g, "⌘");
  const menu = Menu.buildFromTemplate([
    { label: `Analyze selection  (${hotkey})`, enabled: false },
    { type: "separator" },
    { label: "Settings…", enabled: false }, // Phase 3
    { label: "About regression.guard", enabled: false }, // Phase 3
    { type: "separator" },
    { label: "Quit", role: "quit" },
  ]);
  tray.setContextMenu(menu);
}
