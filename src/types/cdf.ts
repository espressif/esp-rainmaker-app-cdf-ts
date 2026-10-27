/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { AdaptorRegistry } from "../registry";
import type { ESPCDFSnapshotConfig } from "./snapshot";

export interface ESPCDFconfig {
  sdkAdaptorRegistry: AdaptorRegistry;
  /** Disk snapshot of the home tree for cold start. Omit to keep everything in memory. */
  snapshot?: ESPCDFSnapshotConfig;
}

/** Options for `user.syncHomeWithNodes`. */
export interface ESPCDFSyncOptions {
  /**
   * Sync even when the tree is already synced. Pull-to-refresh, login and
   * provisioning pass this; everything else is served from the store until a
   * push event or a mutation marks the tree stale.
   */
  force?: boolean;
}

export interface ESPCDFBatchOperationResult<TSuccess, TError = any> {
  successfulResults: TSuccess[];
  failedResults: TError[];
}

export interface ESPCDFAPIResponse<RESPONSE_DATA = any> {
  status: string;
  description?: string;
  data?: RESPONSE_DATA;
}

export interface ESPCDFAPIError extends ESPCDFAPIResponse {
  statusCode: number;
  errorCode: string;
  additionalInfo?: string | string[];
}

export interface ESPCDFAPIDataResponse<
  RESPONSE_DATA = any,
> extends ESPCDFAPIResponse<RESPONSE_DATA> {
  data: RESPONSE_DATA;
}

export interface ESPCDFPaginatedAPIResponse<
  RESPONSE_DATA = any,
> extends ESPCDFAPIDataResponse<RESPONSE_DATA> {
  pagination: {
    hasNext: boolean;
    fetchNext?: () => Promise<ESPCDFPaginatedAPIResponse<RESPONSE_DATA>>;
  };
}
