import { Tray, Menu, nativeImage, shell } from "electron";
import path from "path";
import { getHotkey } from "./storage";
import { createSettingsWindow } from "./windows/settings";

let tray: Tray | null = null;

export function createTray(): Tray {
  // nativeImage.createFromPath uses native OS loaders that cannot read inside
  // an .asar archive. Explicitly resolve to the unpacked path in production.
  const iconPath = path.join(
    __dirname.replace("app.asar", "app.asar.unpacked"),
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
  const hotkey = formatHotkey(getHotkey());

  const menu = Menu.buildFromTemplate([
    { label: `Analyze selection  (${hotkey})`, enabled: false },
    { type: "separator" },
    {
      label: "Settings…",
      accelerator: "CommandOrControl+,",
      click: () => createSettingsWindow(),
    },
    {
      label: "About regression.guard",
      click: () =>
        shell.openExternal("https://prompt-regression-guard.vercel.app"),
    },
    { type: "separator" },
    { label: "Quit", role: "quit" },
  ]);

  tray.setContextMenu(menu);
}

function formatHotkey(accelerator: string): string {
  return accelerator
    .replace(/CommandOrControl/g, "⌘")
    .replace(/Command/g, "⌘")
    .replace(/Control/g, "⌃")
    .replace(/Option|Alt/g, "⌥")
    .replace(/Shift/g, "⇧")
    .replace(/\+/g, " ");
}
