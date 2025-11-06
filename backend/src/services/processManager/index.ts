/**
 * Process Manager - Modular architecture
 *
 * This module re-exports the refactored process manager components
 */

export { ProcessLifecycle } from './lifecycle.js';
export type { ProcessState } from './lifecycle.js';

export { ProcessEventManager } from './eventHandlers.js';
export type { ProcessEventHandlers } from './eventHandlers.js';

export { PortConflictResolver } from './portConflict.js';
export { DockerContainerHelper } from './dockerHelper.js';
