export interface IntakeGateResult {
  blockingQuestions: string[];
  nonBlockingQuestions: string[];
  assumptions: string[];
  riskFlags: Record<string, boolean>;
  planConfidence: number;
  checkerReviewRequired: boolean;
}

interface RiskCategory {
  key: string;
  blocking: boolean;
  patterns: RegExp[];
  question: (desc: string, routeId: string) => string;
}

const RISK_CATEGORIES: RiskCategory[] = [
  {
    key: 'ambiguous_goal',
    blocking: true,
    patterns: [
      /\bmaybe\b/i,
      /大概/,
      /\bpossibly\b/i,
      /不确定/,
      /\bperhaps\b/i,
      /或许/,
      /\bor something\b/i,
      /之类的/,
    ],
    question: (desc, routeId) =>
      `Route ${routeId}: The goal appears ambiguous. Can you clarify the exact scope and desired outcome? Task: "${desc.slice(0, 120)}"`,
  },
  {
    key: 'destructive_change',
    blocking: true,
    patterns: [
      /\bdelete\b/i,
      /删除/,
      /\bdrop\b/i,
      /\bdestroy\b/i,
      /\bremove\s+all\b/i,
      /\brm\s+-rf\b/i,
      /\bpurge\b/i,
      /清除所有/,
      /\bwipe\b/i,
    ],
    question: (_desc, routeId) =>
      `Route ${routeId}: This appears to involve destructive operations (delete/drop/destroy). Have you backed up relevant data? Are you sure this is intended?`,
  },
  {
    key: 'external_credential',
    blocking: true,
    patterns: [
      /\bapi[_\s]?key\b/i,
      /\btoken\b/i,
      /\bcredential\b/i,
      /\bpassword\b/i,
      /密钥/,
      /\bsecret\b/i,
      /\baccess[_\s]?key\b/i,
      /\bapi[_\s]?secret\b/i,
    ],
    question: (_desc, routeId) =>
      `Route ${routeId}: This task may involve credentials or secrets. Ensure they are handled through secure channels and never exposed in plain text.`,
  },
  {
    key: 'cost_or_real_money',
    blocking: false,
    patterns: [
      /\bdeploy\b/i,
      /\bproduction\b/i,
      /\bpublish\b/i,
      /部署/,
      /发布/,
      /\brelease\b/i,
      /上线/,
      /\blive\b/i,
    ],
    question: (_desc, routeId) =>
      `Route ${routeId}: This may involve deploying to production or incurring costs. Please confirm you're aware of the impact.`,
  },
  {
    key: 'safety_boundary',
    blocking: true,
    patterns: [
      /\bdata\s+loss\b/i,
      /\bcorrupt\b/i,
      /数据丢失/,
      /不可恢复/,
      /\birreversible\b/i,
      /永久删除/,
      /数据损坏/,
      /\bunrecoverable\b/i,
    ],
    question: (_desc, routeId) =>
      `Route ${routeId}: This task touches safety boundaries (data loss/corruption risk). Confirm safeguards are in place before proceeding.`,
  },
  {
    key: 'new_route_or_goal_change',
    blocking: false,
    patterns: [
      /\balso\b/i,
      /\badditionally\b/i,
      /另外/,
      /\bin\s+addition\b/i,
      /\band\s+also\b/i,
      /此外/,
      /同时/,
      /\bfurthermore\b/i,
      /\bmoreover\b/i,
    ],
    question: (_desc, routeId) =>
      `Route ${routeId}: This may expand the original scope. Should this be tracked as a separate task or is it truly part of the current route?`,
  },
];

function detectRisks(taskDescription: string, routeId: string): {
  blockingQuestions: string[];
  nonBlockingQuestions: string[];
  riskFlags: Record<string, boolean>;
  assumptions: string[];
} {
  const blockingQuestions: string[] = [];
  const nonBlockingQuestions: string[] = [];
  const riskFlags: Record<string, boolean> = {};
  const assumptions: string[] = [];

  for (const category of RISK_CATEGORIES) {
    const matched = category.patterns.some((p) => p.test(taskDescription));
    riskFlags[category.key] = matched;

    if (matched) {
      const question = category.question(taskDescription, routeId);
      if (category.blocking) {
        blockingQuestions.push(question);
      } else {
        nonBlockingQuestions.push(question);
      }

      if (!category.blocking) {
        assumptions.push(
          `${category.key}: auto-confirmed based on user intent — will proceed with standard safeguards`,
        );
      }
    }
  }

  if (assumptions.length === 0) {
    assumptions.push('No risk flags detected — proceeding with standard intake');
  }
  assumptions.push(`Route ${routeId}: execution will follow standard managed-agent boundaries`);

  return { blockingQuestions, nonBlockingQuestions, riskFlags, assumptions };
}

function computeConfidence(riskFlags: Record<string, boolean>): number {
  let confidence = 1.0;

  const penalties: Record<string, number> = {
    ambiguous_goal: 0.25,
    destructive_change: 0.30,
    external_credential: 0.20,
    cost_or_real_money: 0.10,
    safety_boundary: 0.35,
    new_route_or_goal_change: 0.10,
  };

  for (const [key, flagged] of Object.entries(riskFlags)) {
    if (flagged && penalties[key] !== undefined) {
      confidence -= penalties[key];
    }
  }

  return Math.max(0, Math.min(1, Math.round(confidence * 100) / 100));
}

export function buildPlanIntakeGate(
  taskDescription: string,
  routeId: string,
): IntakeGateResult {
  const { blockingQuestions, nonBlockingQuestions, riskFlags, assumptions } =
    detectRisks(taskDescription, routeId);

  const planConfidence = computeConfidence(riskFlags);

  const checkerReviewRequired =
    blockingQuestions.length > 0 || planConfidence < 0.6;

  return {
    blockingQuestions,
    nonBlockingQuestions,
    assumptions,
    riskFlags,
    planConfidence,
    checkerReviewRequired,
  };
}
