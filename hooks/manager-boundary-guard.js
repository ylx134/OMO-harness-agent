const DETAIL_FILE_PATTERNS = [
  '/.agent-memory/evidence-ledger.md',
  '/.agent-memory/journal.md',
  '/.agent-memory/activity.jsonl',
  '/evidence/'
];

const MANAGER_MARKERS = [
  'control',
  'plan',
  'drive',
  'check',
  'planning-manager',
  'execution-manager',
  'acceptance-manager',
  'manager'
];

function getTargetPath(input = {}) {
  return input.file_path || input.path || '';
}

function getNewContent(input = {}, toolName = '') {
  if (toolName === 'Write') return input.content || '';
  return input.new_string || '';
}

function getActorHints() {
  const env = Deno.env.toObject();
  return [
    env.OPENCODE_SKILL,
    env.OMO_ACTIVE_SKILL,
    env.ACTIVE_SKILL,
    env.AGENT_ROLE,
    env.AGENT_NAME,
    env.TASK_SUBAGENT_TYPE
  ].filter(Boolean);
}

function isManagerActor(hints) {
  const joined = hints.join(' ').toLowerCase();
  return MANAGER_MARKERS.some((marker) => joined.includes(marker));
}

function targetsDetailSurface(targetPath) {
  return DETAIL_FILE_PATTERNS.some((pattern) => targetPath.includes(pattern));
}

export default {
  name: 'manager-boundary-guard',
  description: 'Block managers from directly overwriting hand/probe detail files unless an explicit override marker is present.',
  match: ['Edit', 'Write'],
  handler: async ({ input, toolName }) => {
    try {
      const targetPath = getTargetPath(input);
      if (!targetPath || !targetsDetailSurface(targetPath)) {
        return { continue: true, suppressOutput: true };
      }

      const actorHints = getActorHints();
      if (!isManagerActor(actorHints)) {
        return { continue: true, suppressOutput: true };
      }

      const newContent = getNewContent(input, toolName);
      if (newContent.includes('MANAGER_OVERRIDE_ALLOWED')) {
        return { continue: true, suppressOutput: true };
      }

      const message = [
        'Manager boundary guard blocked this write.',
        `Target: ${targetPath}`,
        `Detected actor hints: ${actorHints.join(', ') || 'none'}`,
        'This file belongs to capability/probe detail or evidence surfaces.',
        'Expected action: delegate the change to a capability/probe agent, or add MANAGER_OVERRIDE_ALLOWED only for an explicitly recorded emergency patch.'
      ].join('\n');

      console.error(JSON.stringify({
        event: 'manager_boundary_guard_blocked',
        file: targetPath,
        actor_hints: actorHints
      }));

      return { continue: false, output: message };
    } catch (error) {
      console.error('manager-boundary-guard error:', error.message);
      return { continue: true, suppressOutput: true };
    }
  }
};
