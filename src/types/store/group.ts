/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { ESPCDFGroupSharingRequest } from "../../entities/ESPCDFGroupSharingRequest";
import { ESPCDFGroup } from "../../entities/ESPCDFGroup";
import { ESPCDFPaginatedAPIResponse } from "../cdf";

export type ESPCDFGroupsByIDMap = Record<string, ESPCDFGroup>;
export type ESPCDFGroupSharingRequestsByIDMap = Record<
  string,
  ESPCDFGroupSharingRequest
>;

export interface ESPSDKAdaptorGroupsPaginationData {
  hasNext: boolean;
  fetchNext?: () => Promise<ESPCDFPaginatedAPIResponse<ESPCDFGroup[]>>;
}

export interface ESPSDKAdaptorGroupSharingRequestsPaginationData {
  hasNext: boolean;
  fetchNext?: () => Promise<
    ESPCDFPaginatedAPIResponse<ESPCDFGroupSharingRequest[]>
  >;
}

export interface ESPSDKAdaptorGroupsPaginationMap {
  [sdkIdentifier: string]: ESPSDKAdaptorGroupsPaginationData;
}

export interface ESPSDKAdaptorGroupSharingRequestsPaginationMap {
  [sdkIdentifier: string]: ESPSDKAdaptorGroupSharingRequestsPaginationData;
}
