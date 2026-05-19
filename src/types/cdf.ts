/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { AdaptorRegistry } from "../registry";

export interface ESPCDFconfig {
  sdkAdaptorRegistry: AdaptorRegistry;
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
