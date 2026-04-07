/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { ESPCDFSimpleTSDataResponse, ESPCDFTSDataRequest } from "../../types";
import { ESPCDFSimpleTSDataRequest } from "../../types";
import { ESPCDFParamInterface, ESPCDFParamOperation } from "./param";

/**
 * Operation types for device param operations
 */
export type ESPCDFDeviceParamOperationType = "setValue";

export interface ESPCDFDeviceParamOperation extends ESPCDFParamOperation {
  getSimpleTSData?(request: ESPCDFSimpleTSDataRequest): Promise<ESPCDFSimpleTSDataResponse>;
  getRawTSData?(request: ESPCDFTSDataRequest): Promise<ESPCDFSimpleTSDataResponse>;
  getTSData?(request: ESPCDFTSDataRequest): Promise<ESPCDFSimpleTSDataResponse>;
}

/**
 * Device param interface; extends base with device-specific properties.
 */
export interface ESPCDFDeviceParamInterface extends ESPCDFParamInterface {
  uiType?: string;
  deviceName?: string;
  operations: ESPCDFDeviceParamOperation;
}
