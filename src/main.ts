import { app, ipcMain } from "electron";
import { createTray } from "./tray";
import { registerHotkey, unregisterAll } from "./hotkey";
import { showResultWindow, getResultWindow } from "./windows/result";
import { analyzePrompt, rewritePrompt, type ApiError } from "./api";
import { getApiKey } from "./storage";

let trayRef: Electron.Tray | null = null;

app.whenReady().then(() => {
  app.dock?.hide();
  trayRef = createTray();

  registerHotkey(async (text: string) => {
    const apiKey = getApiKey();
    if (!apiKey) {
      showResultWindow(trayRef, {
        state: "error",
        message: "No API key set. Settings window arrives in Phase 3.",
      });
      return;
    }

    showResultWindow(trayRef, { state: "loading", text });

    try {
      const result = await analyzePrompt(apiKey, text);
      showResultWindow(trayRef, {
        state: "success",
        text,
        score: result.overall_score,
        issues: result.quality?.issues ?? [],
      });
    } catch (err) {
      const apiErr = err as ApiError;
      showResultWindow(trayRef, {
        state: "error",
        message: errorMessage(apiErr),
        upgrade_url:
          apiErr.type === "quota_exceeded" ? apiErr.upgrade_url : undefined,
      });
    }
  });

  ipcMain.handle("rewrite", async (_event, text: string, issues: unknown[]) => {
    const apiKey = getApiKey();
    if (!apiKey) return { error: "No API key set." };
    try {
      const result = await rewritePrompt(
        apiKey,
        text,
        issues as never
      );
      return {
        rewritten_template: result.rewritten_template,
        reasoning: result.reasoning,
      };
    } catch (err) {
      return { error: errorMessage(err as ApiError) };
    }
  });

  ipcMain.on("close-result-window", () => getResultWindow()?.hide());

  console.log("[main] regression.guard ready. Press ⌘⇧R to analyze.");
});

function errorMessage(err: ApiError): string {
  switch (err.type) {
    case "unauthorized":
      return "Invalid API key. Update it in settings.";
    case "quota_exceeded":
      return "Monthly quota exceeded. Upgrade for more.";
    case "rate_limited":
      return "Too many requests — try again in a minute.";
    case "network":
      return "Network error. Check your connection.";
    case "server":
      return `Server error (HTTP ${err.status}).`;
  }
}

app.on("will-quit", () => unregisterAll());
app.on("window-all-closed", () => {
  /* menu bar app — no windows to close */
});
