export {};
const content = document.getElementById("content")!;
const closeBtn = document.getElementById("close")!;

interface Issue {
  severity?: string;
  description?: string;
}

interface SuccessData {
  state: "success";
  text: string;
  score: number;
  issues: Issue[];
}

interface LoadingData {
  state: "loading";
  text: string;
}

interface ErrorData {
  state: "error";
  message: string;
  upgrade_url?: string;
}

type ShowData = SuccessData | LoadingData | ErrorData;

let currentText = "";
let currentIssues: Issue[] = [];

closeBtn.addEventListener("click", () => window.api.closeWindow());
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") window.api.closeWindow();
});

window.api.onShowResult((raw: unknown) => {
  const data = raw as ShowData;
  if (data.state === "loading") {
    currentText = data.text;
    content.innerHTML = `<div class="loading">Analyzing ${data.text.length} chars…</div>`;
  } else if (data.state === "success") {
    currentText = data.text;
    currentIssues = data.issues;
    renderSuccess(data.score, data.issues);
  } else if (data.state === "error") {
    renderError(data.message, data.upgrade_url);
  }
});

function renderSuccess(score: number, issues: Issue[]) {
  const scoreClass = score >= 7 ? "good" : score >= 5 ? "mid" : "bad";
  const issueRows = issues
    .slice(0, 5)
    .map((i) => {
      const sev = (i.severity || "low").toLowerCase();
      const safeSev = ["high", "medium", "low"].includes(sev) ? sev : "low";
      return `<div class="issue"><span class="sev ${safeSev}">${escapeHtml(i.severity || "low")}</span>${escapeHtml(i.description || "")}</div>`;
    })
    .join("");

  content.innerHTML = `
    <div class="score-card">
      <div>
        <div class="score-label">score</div>
        <div class="score-value ${scoreClass}">${score.toFixed(1)}</div>
      </div>
      <div style="color: var(--muted); font-size: 11px;">out of 10</div>
    </div>
    <div class="section-label">top issues</div>
    <div class="issues">${issueRows || '<div class="issue" style="color: var(--brand);">No issues found.</div>'}</div>
    <div class="actions">
      <button id="dismiss">Dismiss</button>
      <button class="primary" id="rewrite">Rewrite this prompt</button>
    </div>
  `;

  document.getElementById("dismiss")!.addEventListener("click", () =>
    window.api.closeWindow()
  );
  document.getElementById("rewrite")!.addEventListener("click", handleRewrite);
}

async function handleRewrite() {
  const rewriteBtn = document.getElementById("rewrite") as HTMLButtonElement;
  rewriteBtn.disabled = true;
  rewriteBtn.textContent = "Rewriting…";

  const result = await window.api.rewrite(currentText, currentIssues);

  if ("error" in result) {
    renderError(result.error);
    return;
  }

  content.innerHTML = `
    <div class="section-label">rewritten prompt</div>
    <div class="rewrite-result">${escapeHtml(result.rewritten_template)}</div>
    <div class="actions">
      <button id="dismiss">Done</button>
      <button class="primary" id="copy">Copy fix</button>
    </div>
  `;

  document.getElementById("dismiss")!.addEventListener("click", () =>
    window.api.closeWindow()
  );
  document.getElementById("copy")!.addEventListener("click", () => {
    window.api.copyToClipboard(result.rewritten_template);
    const btn = document.getElementById("copy")!;
    btn.textContent = "Copied!";
    setTimeout(() => window.api.closeWindow(), 600);
  });
}

function renderError(message: string, upgradeUrl?: string) {
  const upgrade = upgradeUrl
    ? `<div style="margin-top:8px;"><a href="${escapeHtml(upgradeUrl)}">Upgrade →</a></div>`
    : "";
  content.innerHTML = `
    <div class="error">${escapeHtml(message)}${upgrade}</div>
    <div class="actions" style="margin-top: 12px;">
      <button id="dismiss">Close</button>
    </div>
  `;
  document.getElementById("dismiss")!.addEventListener("click", () =>
    window.api.closeWindow()
  );
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!)
  );
}
