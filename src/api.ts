const API_BASE = "https://prompt-regression-guard.vercel.app/api";

export interface QualityIssue {
  severity: "high" | "medium" | "low" | string;
  description: string;
}

export interface AnalyzeResult {
  overall_score: number;
  quality: { issues: QualityIssue[] };
}

export interface RewriteResult {
  rewritten_template: string;
  reasoning: string;
}

export type ApiError =
  | { type: "unauthorized" }
  | { type: "quota_exceeded"; upgrade_url?: string }
  | { type: "rate_limited" }
  | { type: "network" }
  | { type: "server"; status: number; body?: string };

async function call<T>(path: string, apiKey: string, body: object): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw { type: "network" } as ApiError;
  }
  if (res.status === 401) throw { type: "unauthorized" } as ApiError;
  if (res.status === 429) {
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    throw {
      type: "quota_exceeded",
      upgrade_url: data?.upgrade_url as string | undefined,
    } as ApiError;
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw { type: "server", status: res.status, body: text } as ApiError;
  }
  return res.json() as Promise<T>;
}

export function analyzePrompt(apiKey: string, text: string): Promise<AnalyzeResult> {
  return call<AnalyzeResult>("/analyze-raw", apiKey, {
    text,
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    temperature: 1.0,
  });
}

export function rewritePrompt(
  apiKey: string,
  text: string,
  issues?: QualityIssue[]
): Promise<RewriteResult> {
  return call<RewriteResult>("/rewrite-raw", apiKey, {
    text,
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    temperature: 1.0,
    mode: "address-issues",
    issues,
  });
}
