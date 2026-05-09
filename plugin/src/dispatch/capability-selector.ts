import { routeConfig } from '../routing/table.js';

function lower(s: string): string {
  return String(s || '').toLowerCase();
}

function unique(values: (string | undefined)[]): string[] {
  return Array.from(new Set(values.filter(Boolean) as string[]));
}

function includesAny(message: string, keywords: string[]): boolean {
  return keywords.some((keyword) => message.includes(keyword));
}

export function selectCapabilityHands(state: {
  routeId?: string;
  rawUserInput?: string;
  requiredCapabilityHands?: string[];
}): string[] {
  const routeId = state?.routeId || 'J-L1';
  const required = unique(state?.requiredCapabilityHands || routeConfig(routeId).capability || []);
  const msg = lower(state?.rawUserInput || '');

  if (required.length === 0) return [];

  if (routeId === 'P-H1' || routeId === 'A-M1') return required;

  if (routeId === 'F-M1') {
    const selected = ['shell-agent', 'code-agent', 'evidence-agent'].filter((name) => required.includes(name));
    return selected.length ? selected : required;
  }

  if (routeId === 'C-M1') {
    const selected = ['docs-agent', 'code-agent'];
    if (includesAny(msg, ['build', 'test', '运行', '启动', 'compile', '编译', 'migration', 'migrate', '命令', '脚本', 'api'])) {
      selected.push('shell-agent');
    }
    selected.push('evidence-agent');
    return unique(selected.filter((name) => required.includes(name)));
  }

  const selected = ['docs-agent'];
  if (required.includes('evidence-agent') && includesAny(msg, ['evidence', 'proof', '日志', 'screenshot', 'artifact', '依据', '证据', '输出'])) {
    selected.push('evidence-agent');
  }
  for (const requiredHand of required) {
    if (!selected.includes(requiredHand)) selected.push(requiredHand);
  }
  return unique(selected);
}

export function selectProbes(state: {
  routeId?: string;
  rawUserInput?: string;
  requiredProbes?: string[];
}): string[] {
  const routeId = state?.routeId || 'J-L1';
  const required = unique(state?.requiredProbes || routeConfig(routeId).probes || []);
  const msg = lower(state?.rawUserInput || '');

  if (routeId === 'P-H1') {
    return unique(['ui-probe-agent', 'regression-probe-agent', 'artifact-probe-agent'].filter((name) => required.includes(name)));
  }
  if (routeId === 'A-M1') {
    return unique(['api-probe-agent', 'regression-probe-agent', 'artifact-probe-agent'].filter((name) => required.includes(name)));
  }
  if (routeId === 'F-M1') {
    return unique(['regression-probe-agent', 'artifact-probe-agent'].filter((name) => required.includes(name)));
  }
  if (routeId === 'C-M1') {
    const selected = ['regression-probe-agent', 'artifact-probe-agent'];
    if (includesAny(msg, ['api', 'endpoint', '接口', 'contract']) && required.includes('api-probe-agent')) {
      selected.unshift('api-probe-agent');
    }
    return unique(selected.filter((name) => required.includes(name)));
  }
  return required;
}
