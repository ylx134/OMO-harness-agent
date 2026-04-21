// @ts-nocheck
import { promises as fs } from 'fs';
import path from 'path';
import { recoverGraphRuntimeState } from '../dispatch/recovery.js';
import { ensureGraphState } from './migration.js';
function stateFilePath(workspace) {
    return path.join(workspace, '.agent-memory', 'harness-plugin-state.json');
}
export async function loadPluginState(workspace) {
    const filePath = stateFilePath(workspace);
    try {
        const raw = JSON.parse(await fs.readFile(filePath, 'utf8'));
        return { path: filePath, state: recoverGraphRuntimeState(ensureGraphState(raw)) };
    }
    catch {
        return { path: filePath, state: null };
    }
}
export async function savePluginState(workspace, state) {
    const filePath = stateFilePath(workspace);
    const nextState = recoverGraphRuntimeState(ensureGraphState(state));
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(nextState, null, 2) + '\n', 'utf8');
    return nextState;
}
