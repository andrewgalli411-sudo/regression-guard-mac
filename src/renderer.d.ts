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

export {};
