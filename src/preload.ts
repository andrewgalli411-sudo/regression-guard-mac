import { contextBridge, ipcRenderer, clipboard, shell } from "electron";

contextBridge.exposeInMainWorld("api", {
  // Phase 2
  rewrite: (text: string, issues: unknown[]) =>
    ipcRenderer.invoke("rewrite", text, issues),
  copyToClipboard: (text: string) => clipboard.writeText(text),
  closeWindow: () => ipcRenderer.send("close-window"),
  onShowResult: (callback: (data: unknown) => void) => {
    ipcRenderer.on("show-result", (_event, data) => callback(data));
  },
  // Phase 3
  getSettings: () => ipcRenderer.invoke("get-settings"),
  saveApiKey: (key: string) => ipcRenderer.invoke("save-api-key", key),
  saveHotkey: (accelerator: string) =>
    ipcRenderer.invoke("save-hotkey", accelerator),
  setOpenAtLogin: (enabled: boolean) =>
    ipcRenderer.invoke("set-open-at-login", enabled),
  validateApiKey: (key: string) => ipcRenderer.invoke("validate-api-key", key),
  openExternal: (url: string) => shell.openExternal(url),
  completeOnboarding: () => ipcRenderer.send("complete-onboarding"),
  getAppVersion: () => ipcRenderer.invoke("get-app-version"),
});

declare global {
  interface Window {
    api: {
      rewrite: (
        text: string,
        issues: unknown[]
      ) => Promise<
        | { rewritten_template: string; reasoning: string }
        | { error: string }
      >;
      copyToClipboard: (text: string) => void;
      closeWindow: () => void;
      onShowResult: (callback: (data: unknown) => void) => void;
      getSettings: () => Promise<{
        hasApiKey: boolean;
        hotkey: string;
        openAtLogin: boolean;
      }>;
      saveApiKey: (key: string) => Promise<{ ok: boolean; error?: string }>;
      saveHotkey: (
        accelerator: string
      ) => Promise<{ ok: boolean; error?: string }>;
      setOpenAtLogin: (enabled: boolean) => Promise<{ ok: boolean }>;
      validateApiKey: (
        key: string
      ) => Promise<{ valid: boolean; error?: string }>;
      openExternal: (url: string) => void;
      completeOnboarding: () => void;
      getAppVersion: () => Promise<string>;
    };
  }
}
