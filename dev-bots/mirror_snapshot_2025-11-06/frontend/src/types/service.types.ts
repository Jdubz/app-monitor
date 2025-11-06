// Shared types between frontend and backend for services
export interface ProcessInfo {
  name: string;
  displayName: string;
  status: "running" | "stopped" | "starting" | "stopping" | "error";
  pid?: number;
  ports?: number[];
  uptime?: number;
  error?: string;
  startedAt?: number;
  dockerContainer?: {
    name: string;
    status: "running" | "stopped" | "exited" | "unknown";
    workerStatus?: "running" | "idle" | "stopped" | "unknown";
    containerId?: string;
  };
}

export interface ServiceConfig {
  name: string;
  displayName: string;
  description: string;
  icon?: string;
}

export interface ServiceControlResponse {
  success: boolean;
  message?: string;
  status?: ProcessInfo;
}
