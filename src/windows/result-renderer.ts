export {};
const content = document.getElementById("content")!;
const closeBtn = document.getElementById("close")!;

// ── Category metadata ─────────────────────────────────────────────────────────

const CAT_COLOR: Record<string, string> = {
  structure:   "#C8413A",
  clarity:     "#2D9DA8",
  context:     "#6B7A4B",
  "model-fit": "#7B4FB5",
  model_fit:   "#7B4FB5",
  modelfit:    "#7B4FB5",
};

const CAT_LABEL: Record<string, string> = {
  structure:   "Structure",
  clarity:     "Clarity",
  context:     "Context",
  "model-fit": "Model-fit",
  model_fit:   "Model-fit",
  modelfit:    "Model-fit",
};

// Severity fallback when no category field
const SEV_COLOR: Record<string, string> = {
  high:   "#C8413A",
  medium: "#E8985B",
  low:    "#2D9DA8",
};
const SEV_LABEL: Record<string, string> = {
  high:   "Structure",
  medium: "Clarity",
  low:    "Context",
};

function issueColor(issue: Issue): string {
  const cat = (issue.category || "").toLowerCase();
  return CAT_COLOR[cat] ?? SEV_COLOR[(issue.severity || "low").toLowerCase()] ?? "#E8985B";
}

function issueLabel(issue: Issue): string {
  const cat = (issue.category || "").toLowerCase();
  return CAT_LABEL[cat] ?? SEV_LABEL[(issue.severity || "low").toLowerCase()] ?? "Issue";
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface Issue {
  severity?: string;
  description?: string;
  category?: string;
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

// ── Score ring ────────────────────────────────────────────────────────────────

function scoreColor(s: number): string {
  if (s <= 40) return "#C8413A";
  if (s <= 70) return "#E8985B";
  return "#6B7A4B";
}

function renderRing(score: number): string {
  const color = scoreColor(score);
  const r = 38;
  const cx = 40;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - score / 100);

  // background arc: color at ~12% opacity via rgba
  const [cr, cg, cb] = hexToRgb(color);

  return `
    <div class="score-ring-wrap">
      <svg width="80" height="80" viewBox="0 0 80 80" style="transform:rotate(-90deg);display:block;">
        <circle cx="${cx}" cy="${cx}" r="${r}" fill="none"
          stroke="rgba(${cr},${cg},${cb},0.12)" stroke-width="4"/>
        <circle cx="${cx}" cy="${cx}" r="${r}" fill="none"
          stroke="${color}" stroke-width="4"
          stroke-dasharray="${circumference.toFixed(2)}"
          stroke-dashoffset="${offset.toFixed(2)}"
          stroke-linecap="round"/>
      </svg>
      <div class="score-number" style="color:${color};">${score}</div>
    </div>
  `;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// ── Events ────────────────────────────────────────────────────────────────────

closeBtn.addEventListener("click", () => window.api.closeWindow());
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") window.api.closeWindow();
});

window.api.onShowResult((raw: unknown) => {
  const data = raw as ShowData;
  if (data.state === "loading") {
    currentText = data.text;
    renderLoading(data.text.length);
  } else if (data.state === "success") {
    currentText = data.text;
    currentIssues = data.issues;
    renderSuccess(data.score, data.issues);
  } else if (data.state === "error") {
    renderError(data.message, data.upgrade_url);
  }
});

// ── Render: loading ───────────────────────────────────────────────────────────

function renderLoading(charCount: number) {
  setContent(`<div class="loading">Analyzing ${charCount} chars…</div>`);
}

// ── Render: success ───────────────────────────────────────────────────────────

function renderSuccess(rawScore: number, issues: Issue[]) {
  const score = Math.round(rawScore * 10);
  const noIssues = issues.length === 0;

  const cardRows = issues
    .slice(0, 5)
    .map((issue, idx) => renderCard(issue, idx))
    .join("");

  const issuesBlock = noIssues
    ? `<div class="no-issues">No issues found — your prompt is in good shape.</div>`
    : `<div class="section-label">Issues</div><div class="cards">${cardRows}</div>`;

  const summaryText = noIssues
    ? "No issues detected"
    : `${issues.slice(0, 5).length} issue${issues.length !== 1 ? "s" : ""} found`;

  setContent(`
    <div class="score-header">
      ${renderRing(score)}
      <div class="score-meta">
        <div class="score-label">Prompt Health</div>
        <div class="score-summary">${summaryText}</div>
      </div>
    </div>
    ${issuesBlock}
    ${noIssues ? "" : `
    <div class="bottom-actions">
      <button class="ghost" id="dismiss-all">Done</button>
      <button class="primary" id="rewrite-all">Rewrite prompt</button>
    </div>`}
  `);

  // Card expand/collapse
  content.querySelectorAll<HTMLElement>(".card").forEach((card) => {
    card.addEventListener("click", (e) => {
      // Don't toggle if clicking a button inside the card
      if ((e.target as HTMLElement).closest("button")) return;
      card.classList.toggle("open");
    });
  });

  // Per-card Apply Rewrite
  content.querySelectorAll<HTMLButtonElement>(".card-apply").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.idx);
      handleRewrite(btn, [issues[idx]]);
    });
  });

  // Per-card Dismiss
  content.querySelectorAll<HTMLButtonElement>(".card-dismiss").forEach((btn) => {
    btn.addEventListener("click", () => {
      const card = btn.closest<HTMLElement>(".card");
      card?.remove();
      // If all cards gone, show no-issues state
      if (content.querySelectorAll(".card").length === 0) {
        content.querySelector(".cards")?.replaceWith(
          Object.assign(document.createElement("div"), {
            className: "no-issues",
            textContent: "No issues found — your prompt is in good shape.",
          })
        );
        content.querySelector(".section-label")?.remove();
        content.querySelector(".bottom-actions")?.remove();
      }
    });
  });

  document.getElementById("dismiss-all")?.addEventListener("click", () =>
    window.api.closeWindow()
  );
  document.getElementById("rewrite-all")?.addEventListener("click", () => {
    const btn = document.getElementById("rewrite-all") as HTMLButtonElement;
    handleRewrite(btn, currentIssues);
  });
}

function renderCard(issue: Issue, idx: number): string {
  const color = issueColor(issue);
  const label = issueLabel(issue);
  const desc = escapeHtml(issue.description || "");

  return `
    <div class="card" style="border-left-color:${color};">
      <div class="card-body">
        <div class="card-cat" style="color:${color};">${label}</div>
        <div class="card-desc">${desc}</div>
      </div>
      <div class="card-expanded">
        <div class="card-actions">
          <button class="primary card-apply" data-idx="${idx}">Apply Rewrite</button>
          <button class="ghost card-dismiss">Dismiss</button>
        </div>
      </div>
    </div>
  `;
}

// ── Render: rewrite ───────────────────────────────────────────────────────────

async function handleRewrite(triggerBtn: HTMLButtonElement, issues: Issue[]) {
  triggerBtn.disabled = true;
  triggerBtn.textContent = "Rewriting…";

  const result = await window.api.rewrite(currentText, issues);

  if ("error" in result) {
    renderError(result.error);
    return;
  }

  renderRewriteResult(result.rewritten_template);
}

function renderRewriteResult(text: string) {
  setContent(`
    <div class="rewrite-label">Rewritten prompt</div>
    <div class="rewrite-block">${escapeHtml(text)}</div>
    <div class="bottom-actions">
      <button class="ghost" id="done">Done</button>
      <button class="primary" id="apply-rewrite">Apply Rewrite</button>
    </div>
  `);

  document.getElementById("done")!.addEventListener("click", () =>
    window.api.closeWindow()
  );

  document.getElementById("apply-rewrite")!.addEventListener("click", () => {
    window.api.copyToClipboard(text);
    window.api.notify(
      "regression.guard",
      "Couldn't apply the rewrite — it's on your clipboard."
    );
    setTimeout(() => window.api.closeWindow(), 300);
  });
}

// ── Render: error ─────────────────────────────────────────────────────────────

function renderError(message: string, upgradeUrl?: string) {
  const isQuota = upgradeUrl !== undefined;

  if (isQuota) {
    setContent(`
      <div class="upgrade-card">
        <p>You've used all your rewrites this month. Upgrade for unlimited.</p>
        <button class="upgrade-btn" id="upgrade-btn">Upgrade →</button>
      </div>
      <div class="bottom-actions">
        <button class="ghost" id="dismiss-err">Close</button>
      </div>
    `);
    document.getElementById("upgrade-btn")!.addEventListener("click", () =>
      window.api.openExternal(upgradeUrl!)
    );
    document.getElementById("dismiss-err")!.addEventListener("click", () =>
      window.api.closeWindow()
    );
    return;
  }

  setContent(`
    <div class="error-card">${escapeHtml(message)}</div>
    <div class="bottom-actions" style="margin-top:0;">
      <button class="ghost" id="dismiss-err">Close</button>
    </div>
  `);
  document.getElementById("dismiss-err")!.addEventListener("click", () =>
    window.api.closeWindow()
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function setContent(html: string) {
  content.innerHTML = html;
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!)
  );
}
