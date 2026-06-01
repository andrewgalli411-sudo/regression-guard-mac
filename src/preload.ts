import { contextBridge, ipcRenderer, clipboard, shell } from "electron";

contextBridge.exposeInMainWorld("api", {
  // Phase 2
  rewrite: (text: string, issues: unknown[]) =>
    ipcRenderer.invoke("rewrite", text, issues),
  copyToClipboard: (text: string) => clipboard.writeText(text),
  notify: (title: string, body: string) => ipcRenderer.send("notify", title, body),
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
