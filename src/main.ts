import { app, ipcMain, BrowserWindow } from "electron";
import { initUpdater } from "./updater";
import { createTray, rebuildMenu } from "./tray";
import { registerHotkey, unregisterAll } from "./hotkey";
import { showResultWindow, getResultWindow } from "./windows/result";
import { createOnboardingWindow, getOnboardingWindow } from "./windows/onboarding";
import { analyzePrompt, rewritePrompt, type ApiError } from "./api";
import { getApiKey, setApiKey, getHotkey, setHotkey } from "./storage";

let trayRef: Electron.Tray | null = null;

// Hoisted so save-hotkey IPC can re-register with the real callback
function analyzeCallback(text: string): void {
  const apiKey = getApiKey();
  if (!apiKey) {
    createOnboardingWindow();
    return;
  }
  showResultWindow(trayRef, { state: "loading", text });
  analyzePrompt(apiKey, text)
    .then((result) => {
      showResultWindow(trayRef, {
        state: "success",
        text,
        score: result.overall_score,
        issues: result.quality?.issues ?? [],
      });
    })
    .catch((err) => {
      const apiErr = err as ApiError;
      showResultWindow(trayRef, {
        state: "error",
        message: errorMessage(apiErr),
        upgrade_url:
          apiErr.type === "quota_exceeded" ? apiErr.upgrade_url : undefined,
      });
    });
}

app.whenReady().then(() => {
  app.dock?.hide();
  trayRef = createTray();

  // No-op in dev; checks GitHub Releases every 4h in production
  initUpdater();

  // First-run: no API key → show onboarding
  if (!getApiKey()) {
    createOnboardingWindow();
  }

  registerHotkey(analyzeCallback);

  // ── Phase 2 IPC ──────────────────────────────────────────
  ipcMain.handle("rewrite", async (_event, text: string, issues: unknown[]) => {
    const apiKey = getApiKey();
    if (!apiKey) return { error: "No API key set." };
    try {
      const result = await rewritePrompt(apiKey, text, issues as never);
      return {
        rewritten_template: result.rewritten_template,
        reasoning: result.reasoning,
      };
    } catch (err) {
      return { error: errorMessage(err as ApiError) };
    }
  });

  // Unified close: hides whichever window sent the message
  ipcMain.on("close-window", (event) => {
    BrowserWindow.fromWebContents(event.sender)?.hide();
  });

  // ── Phase 3 IPC ──────────────────────────────────────────
  ipcMain.handle("get-settings", () => ({
    hasApiKey: !!getApiKey(),
    hotkey: getHotkey(),
    openAtLogin: app.getLoginItemSettings().openAtLogin,
  }));

  ipcMain.handle("save-api-key", (_event, key: string) => {
    try {
      setApiKey(key);
      return { ok: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not save key";
      return { ok: false, error: msg };
    }
  });

  ipcMain.handle("save-hotkey", (_event, accelerator: string) => {
    setHotkey(accelerator);
    const ok = registerHotkey(analyzeCallback); // re-register with real callback
    rebuildMenu();
    return ok
      ? { ok: true }
      : { ok: false, error: "Hotkey may be in use by another app" };
  });

  ipcMain.handle("set-open-at-login", (_event, enabled: boolean) => {
    app.setLoginItemSettings({ openAtLogin: enabled, openAsHidden: true });
    return { ok: true };
  });

  ipcMain.handle("validate-api-key", async (_event, key: string) => {
    try {
      await analyzePrompt(key, "Validation probe.");
      return { valid: true };
    } catch (err) {
      const apiErr = err as ApiError;
      if (apiErr.type === "unauthorized")
        return { valid: false, error: "Invalid API key" };
      if (apiErr.type === "quota_exceeded" || apiErr.type === "rate_limited")
        return { valid: true }; // key works, just over limit
      if (apiErr.type === "network")
        return { valid: false, error: "Network error — check your connection" };
      return { valid: false, error: "Could not validate — try again" };
    }
  });

  ipcMain.handle("get-app-version", () => app.getVersion());

  ipcMain.on("complete-onboarding", () => {
    getOnboardingWindow()?.close();
    rebuildMenu();
  });

  // Keep result window close working (result-renderer still calls closeWindow)
  void getResultWindow; // referenced via close-window handler above

  console.log("[main] regression.guard ready.");
});

function errorMessage(err: ApiError): string {
  switch (err.type) {
    case "unauthorized":   return "Invalid API key. Update it in Settings.";
    case "quota_exceeded": return "Monthly quota exceeded. Upgrade for more.";
    case "rate_limited":   return "Too many requests — try again in a minute.";
    case "network":        return "Network error. Check your connection.";
    case "server":         return `Server error (HTTP ${err.status}).`;
  }
}

app.on("will-quit", () => unregisterAll());
app.on("window-all-closed", () => { /* menu bar app */ });
