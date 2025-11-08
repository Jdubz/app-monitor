import type { ProcessInfo as SharedProcessInfo } from '@/types/contracts';

export type ProcessInfo = SharedProcessInfo;

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
