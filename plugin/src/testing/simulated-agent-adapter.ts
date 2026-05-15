import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';

export class DeterministicAgentAdapter {
  #workspace: string;

  constructor(workspace: string) {
    this.#workspace = workspace;
  }

  async dispatch(actor: string, stepId: string, phase: string): Promise<{ sessionID: string }> {
    const dir = join(this.#workspace, '.agent-memory', 'simulated-outputs');
    await mkdir(dir, { recursive: true });

    const fileName = `${actor}-${stepId}.md`;
    const content = `# ${actor} - ${stepId}\nSimulated execution\nPhase: ${phase}\n`;

    await writeFile(join(dir, fileName), content, 'utf8');

    const sessionID = `sim_${actor}_${Date.now()}`;
    return { sessionID };
  }

  supportsActor(_actor: string): boolean {
    return true;
  }

  async cleanup(): Promise<void> {
    const dir = join(this.#workspace, '.agent-memory', 'simulated-outputs');
    await rm(dir, { recursive: true, force: true });
  }
}
