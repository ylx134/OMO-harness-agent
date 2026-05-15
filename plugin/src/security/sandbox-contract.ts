export interface SandboxState {
  sandboxId: string;
  sandboxRoot: string;
  createdAt: string;
  fileCount: number;
}

export interface SandboxConfig {
  workspaceRoot: string;
  sandboxId?: string;
  allowedCommands?: string[];
  maxFileCount?: number;
  maxFileSize?: number;
}
