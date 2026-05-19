/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { ESPCDFPaginatedAPIResponse } from "../cdf";
import { ESPCDFAutomation } from "../../entities/ESPCDFAutomation";

export interface ESPCDFAutomationsByIDMap {
  [id: string]: ESPCDFAutomation;
}

export interface ESPSDKAdaptorAutomationsPaginationData {
  hasNextPage: boolean;
  fetchNext?: () => Promise<ESPCDFPaginatedAPIResponse<ESPCDFAutomation[]>>;
}

export interface ESPSDKAdaptorAutomationsPaginationMap {
  [sdkIdentifier: string]: ESPSDKAdaptorAutomationsPaginationData;
}
