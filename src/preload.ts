import { contextBridge, ipcRenderer, clipboard } from "electron";

contextBridge.exposeInMainWorld("api", {
  rewrite: (text: string, issues: unknown[]) =>
    ipcRenderer.invoke("rewrite", text, issues),
  copyToClipboard: (text: string) => clipboard.writeText(text),
  closeWindow: () => ipcRenderer.send("close-result-window"),
  onShowResult: (callback: (data: unknown) => void) => {
    ipcRenderer.on("show-result", (_event, data) => callback(data));
  },
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
    };
  }
}
