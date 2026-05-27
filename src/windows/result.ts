import { BrowserWindow, Tray, screen } from "electron";
import path from "path";

let resultWindow: BrowserWindow | null = null;

export function getResultWindow(): BrowserWindow | null {
  return resultWindow;
}

export function createResultWindow(): BrowserWindow {
  if (resultWindow && !resultWindow.isDestroyed()) return resultWindow;

  resultWindow = new BrowserWindow({
    width: 420,
    height: 520,
    show: false,
    frame: false,
    transparent: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    fullscreenable: false,
    movable: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "..", "preload.js"),
    },
  });

  // __dirname = dist/windows/ at runtime; result.html is copied there by build
  resultWindow.loadFile(path.join(__dirname, "result.html"));

  resultWindow.on("blur", () => {
    if (resultWindow && !resultWindow.isDestroyed()) resultWindow.hide();
  });

  return resultWindow;
}

export function showResultWindow(
  tray: Tray | null,
  data:
    | { state: "loading"; text: string }
    | { state: "success"; text: string; score: number; issues: unknown[] }
    | { state: "error"; message: string; upgrade_url?: string }
): void {
  const win = createResultWindow();
  positionNearTray(win, tray);
  win.show();
  win.focus();

  if (win.webContents.isLoading()) {
    win.webContents.once("did-finish-load", () =>
      win.webContents.send("show-result", data)
    );
  } else {
    win.webContents.send("show-result", data);
  }
}

function positionNearTray(win: BrowserWindow, tray: Tray | null): void {
  if (!tray) {
    win.center();
    return;
  }
  const trayBounds = tray.getBounds();
  const winBounds = win.getBounds();
  const display = screen.getDisplayMatching(trayBounds);

  let x = Math.round(trayBounds.x + trayBounds.width / 2 - winBounds.width / 2);
  let y = Math.round(trayBounds.y + trayBounds.height + 8);

  x = Math.max(
    display.workArea.x + 8,
    Math.min(x, display.workArea.x + display.workArea.width - winBounds.width - 8)
  );
  y = Math.max(display.workArea.y + 8, y);

  win.setPosition(x, y, false);
}
