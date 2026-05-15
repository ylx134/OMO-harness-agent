import { loadPluginState } from '../state/storage.js';
import { listTasks, createTask, archiveTask } from '../state/task-board.js';
import { guardFileWrite } from '../dispatch/phase-guard.js';

type ToolInputSchema = {
  type: 'object';
  properties: Record<string, { type: string; description: string }>;
  required?: string[];
};

type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: ToolInputSchema;
};

const WORKSPACE_ROOT_PROP = {
  workspaceRoot: {
    type: 'string' as const,
    description: 'Workspace root directory path. Defaults to HARNESS_WORKSPACE_ROOT env var.',
  },
};

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'opencode_harness_status',
    description:
      'Read the current harness plugin state from .agent-memory/harness-plugin-state.json. Returns the full state object including route info, phase, pending actors, and dispatch status.',
    inputSchema: {
      type: 'object',
      properties: { ...WORKSPACE_ROOT_PROP },
    },
  },
  {
    name: 'opencode_harness_next_action',
    description:
      'Return the next expected actor from the harness state. Useful for determining what should happen next in the route lifecycle.',
    inputSchema: {
      type: 'object',
      properties: { ...WORKSPACE_ROOT_PROP },
    },
  },
  {
    name: 'opencode_harness_task_list',
    description: 'List all non-archived tasks from the task board.',
    inputSchema: {
      type: 'object',
      properties: { ...WORKSPACE_ROOT_PROP },
    },
  },
  {
    name: 'opencode_harness_task_create',
    description:
      'Create a new task with a git worktree. Returns the created task record.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_ROOT_PROP,
        task: { type: 'string', description: 'Task description' },
      },
      required: ['task'],
    },
  },
  {
    name: 'opencode_harness_task_archive',
    description:
      'Archive a task by taskId. Removes the git worktree and branch, and marks the task as archived.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_ROOT_PROP,
        taskId: { type: 'string', description: 'Task ID to archive' },
      },
      required: ['taskId'],
    },
  },
  {
    name: 'opencode_harness_validate_write',
    description:
      'Check whether a given actor is authorized to write to a specific file path per the harness phase-actor ownership model.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_ROOT_PROP,
        actor: { type: 'string', description: 'Actor name to check (e.g. "code-agent")' },
        filePath: { type: 'string', description: 'Absolute or relative file path to check' },
      },
      required: ['actor', 'filePath'],
    },
  },
  {
    name: 'opencode_harness_reconcile',
    description:
      'Re-read the harness plugin state from disk. Useful for refreshing state after external changes without restarting the server.',
    inputSchema: {
      type: 'object',
      properties: { ...WORKSPACE_ROOT_PROP },
    },
  },
];

function resolveWorkspaceRoot(args: Record<string, unknown>): string {
  return (args.workspaceRoot as string) || process.env.HARNESS_WORKSPACE_ROOT || process.cwd();
}

export async function handleToolCall(
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const root = resolveWorkspaceRoot(args);

  switch (name) {
    case 'opencode_harness_status': {
      const result = await loadPluginState(root);
      return {
        state: result.state,
        statePath: result.path,
      };
    }

    case 'opencode_harness_next_action': {
      const { state } = await loadPluginState(root);
      return {
        nextExpectedActor: state?.nextExpectedActor ?? 'none',
        currentPhase: state?.currentPhase ?? 'unknown',
        routeId: state?.routeId ?? null,
        requestId: state?.requestId ?? null,
        blocked: state?.blocked ?? false,
        deferredDispatchState: state?.deferredDispatchState ?? 'unknown',
      };
    }

    case 'opencode_harness_task_list': {
      const tasks = await listTasks(root);
      return { tasks };
    }

    case 'opencode_harness_task_create': {
      const task = args.task as string;
      if (!task) throw new Error('Missing required parameter: task');
      const record = await createTask(root, task);
      return { task: record };
    }

    case 'opencode_harness_task_archive': {
      const taskId = args.taskId as string;
      if (!taskId) throw new Error('Missing required parameter: taskId');
      const record = await archiveTask(root, taskId);
      return { task: record };
    }

    case 'opencode_harness_validate_write': {
      const actor = args.actor as string;
      const filePath = args.filePath as string;
      if (!actor) throw new Error('Missing required parameter: actor');
      if (!filePath) throw new Error('Missing required parameter: filePath');
      const blockReason = guardFileWrite(actor, filePath, '', null);
      return {
        allowed: !blockReason,
        blockReason: blockReason ?? null,
      };
    }

    case 'opencode_harness_reconcile': {
      const { state } = await loadPluginState(root);
      return {
        state,
        reconciled: true,
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
