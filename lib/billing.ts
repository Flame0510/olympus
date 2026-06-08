import type { ModelCost } from '@/lib/types';

export type BillingMode = 'usage' | 'fixed' | 'credits' | 'unknown';

/**
 * Economic dollar costs should only include providers we actually bill per usage.
 * Today that is primarily OpenRouter, plus a small set of explicit pay-per-use aliases
 * stored without provider prefixes in older rows.
 */
const BILLABLE_MODEL_PREFIXES = ['openrouter/'] as const;
const BILLABLE_ALIAS_PREFIXES = ['deepseek', 'deepseek4', 'or-', 'openrouter', 'qwen', 'kimi', 'glm'] as const;
const NON_BILLABLE_ALIAS_PATTERNS = [
  /^gpt-5(\.|-|$)/,
  /^codex(\.|-|$)/,
  /^claude(\.|-|$)/,
  /^claude-cli(\/|$)/,
  /^anthropic(\/|$)/,
  /^openai-codex(\/|$)/,
  /^github-copilot(\/|$)/,
] as const;

export interface BillingBucket {
  mode: BillingMode;
  cost_usd: number;
  sessions: number;
  tokens_in: number;
  tokens_out: number;
  models: ModelCost[];
}

export interface BillingSummary {
  usageBasedCost: number;
  dbEstimatedCost: number;
  buckets: Record<BillingMode, BillingBucket>;
  usageModels: ModelCost[];
  fixedModels: ModelCost[];
  creditModels: ModelCost[];
  unknownModels: ModelCost[];
}

export function isBillableDollarModel(model?: string | null): boolean {
  const m = (model ?? '').trim().toLowerCase();
  if (!m || m === 'unknown') return false;
  if (BILLABLE_MODEL_PREFIXES.some((prefix) => m.startsWith(prefix))) return true;
  if (NON_BILLABLE_ALIAS_PATTERNS.some((pattern) => pattern.test(m))) return false;
  if (m.includes('/')) return false;
  return BILLABLE_ALIAS_PREFIXES.some((prefix) => m.startsWith(prefix));
}

export function classifyBillingModel(model?: string | null): BillingMode {
  const m = (model ?? '').toLowerCase();
  if (!m || m === 'unknown') return 'unknown';
  if (isBillableDollarModel(m)) return 'usage';
  if (m.startsWith('openai-codex/')) return 'fixed';
  if (m.startsWith('anthropic/') || m.includes('claude-cli')) return 'fixed';
  if (m.startsWith('github-copilot/')) return 'credits';

  // Olympus DB often stores model aliases without provider prefix.
  if (/^gpt-5\.(2|3|4|5)(-codex|-mini|-pro)?$/.test(m)) return 'fixed';
  if (/^claude-(haiku|sonnet|opus)-/.test(m)) return 'fixed';
  if (/^gemini-.*(flash|pro)/.test(m)) return 'credits';

  // Known OpenRouter/free/usage-style aliases seen in this workspace.
  if (/^(deepseek|deepseek4|or-|openrouter|qwen|kimi|glm)/.test(m)) return 'usage';
  return 'unknown';
}

function emptyBucket(mode: BillingMode): BillingBucket {
  return { mode, cost_usd: 0, sessions: 0, tokens_in: 0, tokens_out: 0, models: [] };
}

export function summarizeBilling(models: ModelCost[]): BillingSummary {
  const buckets: Record<BillingMode, BillingBucket> = {
    usage: emptyBucket('usage'),
    fixed: emptyBucket('fixed'),
    credits: emptyBucket('credits'),
    unknown: emptyBucket('unknown'),
  };

  for (const model of models) {
    const mode = classifyBillingModel(model.model);
    const bucket = buckets[mode];
    const cost = Number(model.cost_usd ?? 0);
    bucket.cost_usd += cost;
    bucket.sessions += Number(model.sessions ?? 0);
    bucket.tokens_in += Number(model.tokens_in ?? 0);
    bucket.tokens_out += Number(model.tokens_out ?? 0);
    bucket.models.push(model);
  }

  return {
    usageBasedCost: buckets.usage.cost_usd,
    dbEstimatedCost: models.reduce((sum, model) => sum + Number(model.cost_usd ?? 0), 0),
    buckets,
    usageModels: buckets.usage.models,
    fixedModels: buckets.fixed.models,
    creditModels: buckets.credits.models,
    unknownModels: buckets.unknown.models,
  };
}
