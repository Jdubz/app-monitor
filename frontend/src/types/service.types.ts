import type { Service } from './shared.types';

export interface ServiceConfig {
  name: string;
  displayName: string;
  description: string;
  icon?: string;
}

export interface ServiceControlResponse {
  success: boolean;
  message?: string;
  status?: Service;
}
