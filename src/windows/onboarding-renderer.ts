export {};
const steps = document.querySelectorAll<HTMLElement>(".step");
const dots = document.querySelectorAll<HTMLElement>(".dot");

function setStep(n: number) {
  steps.forEach((s) => s.classList.remove("active"));
  steps[n].classList.add("active");
  dots.forEach((d, i) => d.classList.toggle("active", i <= n));
}

// Step 1 → 2
document.getElementById("start")!.addEventListener("click", () => setStep(1));

// Step 2
document.getElementById("back-1")!.addEventListener("click", () => setStep(0));
document.getElementById("open-dashboard")!.addEventListener("click", () => {
  window.api.openExternal(
    "https://prompt-regression-guard.vercel.app/dashboard"
  );
});

const keyInput = document.getElementById("api-key") as HTMLInputElement;
const saveKeyBtn = document.getElementById("save-key") as HTMLButtonElement;
const keyStatus = document.getElementById("key-status")!;

keyInput.addEventListener("input", () => {
  saveKeyBtn.disabled = keyInput.value.trim().length < 8;
});

saveKeyBtn.addEventListener("click", async () => {
  const key = keyInput.value.trim();
  saveKeyBtn.disabled = true;
  keyStatus.innerHTML = '<div class="ok">Validating…</div>';

  const validation = await window.api.validateApiKey(key);
  if (!validation.valid) {
    keyStatus.innerHTML = `<div class="error">${escapeHtml(validation.error || "Invalid key")}</div>`;
    saveKeyBtn.disabled = false;
    return;
  }

  const saved = await window.api.saveApiKey(key);
  if (!saved.ok) {
    keyStatus.innerHTML = `<div class="error">${escapeHtml(saved.error || "Could not save key")}</div>`;
    saveKeyBtn.disabled = false;
    return;
  }

  keyStatus.innerHTML = '<div class="ok">Key saved ✓</div>';
  setTimeout(async () => {
    await showHotkeyOnStep3();
    setStep(2);
  }, 400);
});

// Step 3
async function showHotkeyOnStep3() {
  const settings = await window.api.getSettings();
  document.getElementById("hotkey-display")!.textContent = formatHotkey(
    settings.hotkey
  );
}

document.getElementById("back-2")!.addEventListener("click", () => setStep(1));
document.getElementById("finish")!.addEventListener("click", () => {
  window.api.completeOnboarding();
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

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!)
  );
}
