import { Tray, Menu, nativeImage, shell, app } from "electron";
import path from "path";
import { execSync } from "child_process";
import { getHotkey } from "./storage";
import { createSettingsWindow } from "./windows/settings";

let tray: Tray | null = null;

export function createTray(): Tray {
  // macOS stores NSStatusItem preferred positions in com.apple.controlcenter,
  // keyed by the app bundle ID. Values are measured from the RIGHT edge of the
  // screen — smaller = further right. Writing 5 here places the icon just left
  // of the clock, keeping it clear of the MacBook Pro notch dead zone.
  try {
    const plistPath = path.join(app.getAppPath(), "..", "..", "Info.plist");
    const bundleId = execSync(
      `defaults read "${plistPath}" CFBundleIdentifier`
    ).toString().trim();
    execSync(
      `defaults write com.apple.controlcenter ` +
      `"NSStatusItem Preferred Position ${bundleId}" -float 600`
    );
  } catch {
    // Non-fatal: icon may still appear under notch on very crowded menu bars
  }
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
