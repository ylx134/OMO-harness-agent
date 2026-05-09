function nowIso() {
  return new Date().toISOString();
}

function requestId() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `REQ-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function lower(s: any): string {
  return String(s || '').toLowerCase();
}

function unique(values: any[]): string[] {
  return Array.from(new Set((values || []).filter(Boolean)));
}

function includesAny(message: string, keywords: string[]): boolean {
  return keywords.some((keyword) => message.includes(keyword));
}

function formatSection(items: string[], fallback = 'none'): string {
  const filtered = (items || []).filter(Boolean);
  if (filtered.length === 0) return fallback;
  return filtered.map((item) => `- ${item}`).join('\n');
}

function formatSignalList(events: any[] = []): string {
  if (!events.length) return '- none';
  return events.map((event: any) => {
    const bits = [
      event.at || '',
      event.actor || '',
      event.status || '',
      event.summary || '',
    ].filter(Boolean);
    const line = bits.join(' | ');
    const extras: string[] = [];
    if ((event.artifacts || []).length) extras.push(`artifacts=${event.artifacts.join(', ')}`);
    if ((event.blockers || []).length) extras.push(`blockers=${event.blockers.join(', ')}`);
    if ((event.nextActions || []).length) extras.push(`next=${event.nextActions.join(', ')}`);
    return `- ${line}${extras.length ? ` (${extras.join('; ')})` : ''}`;
  }).join('\n');
}

function normalizeCommandName(command: any): string {
  return String(command || '').replace(/^\//, '').trim();
}

function isHarnessCommand(command: string): boolean {
  return ['control', 'plan', 'drive', 'check'].includes(normalizeCommandName(command));
}

function completedManagerPhase(managerName: string): string {
  if (managerName === 'execution-manager') return 'execution';
  if (managerName === 'acceptance-manager') return 'acceptance';
  if (managerName === 'summary-manager') return 'summary';
  return 'planning';
}

function withoutFirst(values: (string | undefined)[], target: string): string[] {
  const next = [...(values || [])];
  const index = next.indexOf(target);
  if (index >= 0) next.splice(index, 1);
  return next as string[];
}

function chatMessageSessionID(input: any): string {
  return input?.sessionID || input?.sessionId || input?.body?.sessionID || input?.path?.id || '';
}

function isSyntheticHarnessExpansionMessage(message: string): boolean {
  const msg = String(message || '');
  return msg.includes('[analyze-mode]')
    || msg.includes('<auto-slash-command>')
    || msg.includes('# /control Command')
    || msg.includes('MANDATORY delegate_task params')
    || msg.includes('<system-reminder>')
    || msg.includes('<!-- OMO_INTERNAL_INITIATOR -->')
    || msg.includes('[BACKGROUND TASK COMPLETED]')
    || msg.includes('[ALL BACKGROUND TASKS COMPLETE]');
}

function isSyntheticAutoDispatchEcho(message: string): boolean {
  const msg = String(message || '').trim();
  return msg.startsWith('You are being auto-dispatched by the Harness plugin as ')
    || msg.startsWith('You are being re-dispatched by the Harness plugin as acceptance-manager for final closure.');
}

function toolCountsAsChildProgress(toolName: string): boolean {
  return toolName !== 'skill';
}

export {
  nowIso,
  requestId,
  lower,
  unique,
  includesAny,
  formatSection,
  formatSignalList,
  normalizeCommandName,
  isHarnessCommand,
  completedManagerPhase,
  withoutFirst,
  chatMessageSessionID,
  isSyntheticHarnessExpansionMessage,
  isSyntheticAutoDispatchEcho,
  toolCountsAsChildProgress,
};
