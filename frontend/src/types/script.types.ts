export type ScriptCategory = 'build' | 'test' | 'quality' | 'database' | 'deployment' | 'utility';
export type DangerLevel = 'safe' | 'warning' | 'danger';
export type ScriptStatus = 'running' | 'completed' | 'failed';

export interface Script {
  id: string;
  name: string;
  displayName: string;
  description: string;
  category: ScriptCategory;
  command: string;
  args: string[];
  cwd: string;
  requiresConfirmation?: boolean;
  dangerLevel?: DangerLevel;
  icon?: string;
}

export interface ScriptExecution {
  id: string;
  scriptId: string;
  config: Script;
  pid?: number;
  status: ScriptStatus;
  exitCode?: number;
  startTime: Date;
  endTime?: Date;
  output: string[];
}

export interface ScriptExecutionSummary {
  id: string;
  scriptId: string;
  displayName: string;
  status: ScriptStatus;
  exitCode?: number;
  startTime: Date;
  endTime?: Date;
  outputLines: number;
}
