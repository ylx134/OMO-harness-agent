# Harness Metrics Template

Record these metrics at the end of each auto-pilot run or significant multi-round session.
Store in `.agent-memory/metrics.json`.

## Template

```json
{
  "run_id": "run-{timestamp}",
  "started_at": "2026-04-03T10:00:00Z",
  "ended_at": "2026-04-03T16:00:00Z",
  "duration_minutes": 360,
  "model": "claude-opus-4-6",
  "task_type": "产品型",
  "flow_tier": "重流程",
  "route_id": "P-H1",

  "features": {
    "total": 45,
    "completed": 38,
    "blocked": 5,
    "skipped": 2,
    "completion_rate": 0.844
  },

  "rounds": {
    "total": 52,
    "successful": 38,
    "rejected_then_fixed": 9,
    "blocked": 5,
    "first_pass_rate": 0.731
  },

  "agents": {
    "planner": {
      "invocations": 1,
      "total_duration_minutes": 15,
      "retries": 0
    },
    "executor": {
      "invocations": 52,
      "total_duration_minutes": 280,
      "retries": 14,
      "context_resets": 2
    },
    "checker": {
      "invocations": 61,
      "total_duration_minutes": 45,
      "contract_reviews": 52,
      "contract_rejections": 8,
      "acceptance_reviews": 52,
      "acceptance_rejections": 14,
      "calibration_checks": 4,
      "drift_detected": 1
    }
  },

  "quality": {
    "average_scores": {
      "product_depth": 7.8,
      "functional_completeness": 8.2,
      "visual_design": 7.1,
      "code_quality": 7.9
    },
    "final_product_score": 7.8,
    "guardrails_rules_added": 3,
    "guardrails_rules_relaxed": 0
  },

  "recovery": {
    "smoke_test_failures": 1,
    "git_reverts": 1,
    "features_json_corruptions": 0,
    "context_resets": 2,
    "user_escalations": 1
  },

  "efficiency": {
    "tokens_estimated": "~2.5M",
    "cost_estimated": "$125",
    "minutes_per_feature": 8.0,
    "rejection_overhead_percent": 27
  }
}
```

## How to Collect

### Automated (via activity.jsonl)
Parse `activity.jsonl` to compute:
- Agent invocation counts and durations
- Context reset count
- File write counts

### Manual (at run end)
Control fills in:
- Feature completion stats (from features.json)
- Quality scores (from last acceptance-report.md)
- Recovery events (from activity.jsonl)

## Key Indicators

| Metric | Healthy Range | Action if Outside |
|--------|---------------|-------------------|
| First-pass acceptance rate | > 70% | Review Sprint Contract quality |
| Contract rejection rate | < 20% | Review executor prompt |
| Calibration drift detected | < 1 per 20 rounds | Review calibration examples |
| Context resets | < 1 per 20 features | Check model context handling |
| Minutes per feature | < 15 min | Check for over-engineering |
| Guardrails rules added | < 1 per 10 features | Stabilizing = fewer new rules |
