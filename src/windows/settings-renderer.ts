export {};
const keyInput = document.getElementById("api-key") as HTMLInputElement;
const saveKeyBtn = document.getElementById("save-key") as HTMLButtonElement;
const keyStatus = document.getElementById("key-status")!;
const hotkeyDisplay = document.getElementById("hotkey-display")!;
const recordBtn = document.getElementById("record-hotkey") as HTMLButtonElement;
const resetBtn = document.getElementById("reset-hotkey") as HTMLButtonElement;
const hotkeyStatus = document.getElementById("hotkey-status")!;
const openAtLogin = document.getElementById("open-at-login") as HTMLInputElement;
const versionSpan = document.getElementById("version")!;

const DEFAULT_HOTKEY = "CommandOrControl+Shift+R";

(async function init() {
  const settings = await window.api.getSettings();
  hotkeyDisplay.textContent = formatHotkey(settings.hotkey);
  openAtLogin.checked = settings.openAtLogin;
  if (settings.hasApiKey) {
    keyInput.placeholder =
      "•••••••••••••••• (set — paste a new key to replace)";
  }
  versionSpan.textContent = "v" + (await window.api.getAppVersion());
})();

saveKeyBtn.addEventListener("click", async () => {
  const key = keyInput.value.trim();
  if (key.length < 8) {
    keyStatus.className = "status error";
    keyStatus.textContent = "Key looks too short";
    return;
  }
  saveKeyBtn.disabled = true;
  keyStatus.className = "status";
  keyStatus.textContent = "Validating…";

  const validation = await window.api.validateApiKey(key);
  if (!validation.valid) {
    keyStatus.className = "status error";
    keyStatus.textContent = validation.error || "Invalid key";
    saveKeyBtn.disabled = false;
    return;
  }

  const saved = await window.api.saveApiKey(key);
  saveKeyBtn.disabled = false;
  if (!saved.ok) {
    keyStatus.className = "status error";
    keyStatus.textContent = saved.error || "Could not save";
    return;
  }

  keyStatus.className = "status ok";
  keyStatus.textContent = "Saved ✓";
  keyInput.value = "";
  keyInput.placeholder =
    "•••••••••••••••• (set — paste a new key to replace)";
  setTimeout(() => {
    keyStatus.textContent = "";
  }, 2000);
});

// Hotkey recording
let recording = false;

recordBtn.addEventListener("click", () => {
  if (recording) return;
  recording = true;
  hotkeyDisplay.classList.add("recording");
  hotkeyDisplay.textContent = "Press your hotkey…";
  recordBtn.disabled = true;
  hotkeyStatus.className = "status";
  hotkeyStatus.textContent = "Listening for keys…";
});

document.addEventListener("keydown", (e) => {
  if (!recording) return;
  e.preventDefault();

  const parts: string[] = [];
  if (e.metaKey) parts.push("CommandOrControl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  if (e.ctrlKey && !e.metaKey) parts.push("Control");

  const key = e.key.toUpperCase();
  if (
    !["META", "ALT", "SHIFT", "CONTROL"].includes(key) &&
    /^[A-Z0-9]$/.test(key)
  ) {
    parts.push(key);
    finishRecording(parts.join("+"));
  }
});

async function finishRecording(accelerator: string) {
  recording = false;
  hotkeyDisplay.classList.remove("recording");
  recordBtn.disabled = false;

  const hasModifier = /CommandOrControl|Alt|Control/.test(accelerator);
  if (!hasModifier) {
    hotkeyStatus.className = "status error";
    hotkeyStatus.textContent =
      "Must include Cmd, Option, or Control";
    hotkeyDisplay.textContent = formatHotkey(DEFAULT_HOTKEY);
    return;
  }

  const result = await window.api.saveHotkey(accelerator);
  if (!result.ok) {
    hotkeyStatus.className = "status error";
    hotkeyStatus.textContent =
      result.error || "Could not register hotkey — may be in use";
    hotkeyDisplay.textContent = formatHotkey(DEFAULT_HOTKEY);
    return;
  }

  hotkeyDisplay.textContent = formatHotkey(accelerator);
  hotkeyStatus.className = "status ok";
  hotkeyStatus.textContent = "Hotkey saved ✓";
  setTimeout(() => {
    hotkeyStatus.textContent = "";
  }, 2000);
}

resetBtn.addEventListener("click", async () => {
  const result = await window.api.saveHotkey(DEFAULT_HOTKEY);
  if (result.ok) {
    hotkeyDisplay.textContent = formatHotkey(DEFAULT_HOTKEY);
    hotkeyStatus.className = "status ok";
    hotkeyStatus.textContent = "Reset to default ✓";
    setTimeout(() => {
      hotkeyStatus.textContent = "";
    }, 2000);
  }
});

openAtLogin.addEventListener("change", async () => {
  await window.api.setOpenAtLogin(openAtLogin.checked);
});

document.getElementById("open-dashboard")!.addEventListener("click", () => {
  window.api.openExternal(
    "https://prompt-regression-guard.vercel.app/dashboard"
  );
});
document.getElementById("open-site")!.addEventListener("click", () => {
  window.api.openExternal("https://prompt-regression-guard.vercel.app");
});
document.getElementById("open-docs")!.addEventListener("click", () => {
  window.api.openExternal(
    "https://prompt-regression-guard.vercel.app/api-docs"
  );
});
document.getElementById("open-pricing")!.addEventListener("click", () => {
  window.api.openExternal(
    "https://prompt-regression-guard.vercel.app/pricing"
  );
});

function formatHotkey(accelerator: string): string {
  return accelerator
    .replace(/CommandOrControl/g, "⌘")
    .replace(/Command/g, "⌘")
    .replace(/Control/g, "⌃")
    .replace(/Option|Alt/g, "⌥")
    .replace(/Shift/g, "⇧")
    .replace(/\+/g, " ");
}
