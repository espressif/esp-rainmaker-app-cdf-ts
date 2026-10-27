/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ESPCDFStorageAdapterInterface } from "./storage";

/**
 * Disk snapshot of the home tree, supplied through `initCDF({ snapshot })`.
 * Saved whenever the tree changes, restored on cold start so the first screen
 * paints before the network answers. Off when omitted.
 */
export interface ESPCDFSnapshotConfig {
  /** Where the snapshot JSON is kept (the app's AsyncStorage adapter). */
  storage: ESPCDFStorageAdapterInterface;
  /** Snapshots older than this are ignored on restore. */
  maxAgeMs: number;
  /** How long a restored entity waits for the first live sync before an operation fails. Default 15 s. */
  liveTimeoutMs?: number;
  /**
   * Quiet time after a store change before the snapshot is written, so a burst of
   * changes (a sync, a run of param updates) costs one write. Default 1.5 s.
   */
  persistDelayMs?: number;
  /** Storage key prefix. Default `espcdf.snapshot`. */
  keyPrefix?: string;
}
