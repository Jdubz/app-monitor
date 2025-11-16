/**
 * Alert Type Definition
 *
 * Defines the structure for system alerts
 */

export interface Alert {
  /** Unique identifier for the alert */
  id: string;

  /** Chain ID associated with the alert */
  chainId: string;

  /** Reason or description of the alert */
  reason: string;

  /** Timestamp when the alert was created */
  timestamp: number;

  /** Whether the alert has been dismissed */
  dismissed: boolean;
}
