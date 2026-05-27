import { safeStorage } from "electron";
import Store from "electron-store";

interface Schema {
  apiKey?: string; // base64-encoded encrypted bytes
  hotkey: string;
  openAtLogin: boolean;
}

const store = new Store<Schema>({
  defaults: {
    hotkey: "CommandOrControl+Shift+R",
    openAtLogin: false,
  },
});

export function getApiKey(): string | null {
  const encrypted = store.get("apiKey");
  if (!encrypted) return null;
  if (!safeStorage.isEncryptionAvailable()) {
    console.warn("[storage] safeStorage not available");
    return null;
  }
  try {
    return safeStorage.decryptString(Buffer.from(encrypted, "base64"));
  } catch (err) {
    console.error("[storage] decrypt failed:", err);
    return null;
  }
}

export function setApiKey(key: string): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("Encryption not available — cannot store API key");
  }
  const encrypted = safeStorage.encryptString(key).toString("base64");
  store.set("apiKey", encrypted);
}

export function clearApiKey(): void {
  store.delete("apiKey");
}

export function getHotkey(): string {
  return store.get("hotkey");
}

export function setHotkey(accelerator: string): void {
  store.set("hotkey", accelerator);
}
