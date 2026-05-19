/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { ESPCDFDeviceParam } from "../../entities/ESPCDFDeviceParam";
import { ESPCDFAttributeInterface } from "./common";
import { ESPCDFDeviceParamInterface } from "./deviceParam";

/**
 * Operation types for device operations
 */
export type ESPCDFDeviceOperationType = "getParams";

export interface ESPCDFDeviceOperation {
  getParams(): Promise<ESPCDFDeviceParam[]>;
}

export interface ESPCDFDeviceInterface extends ESPCDFAttributeInterface {
  name: string;
  params: ESPCDFDeviceParamInterface[]; // ESPCDFDeviceParam[] - using any to avoid circular dependency
  attributes?: ESPCDFAttributeInterface[];
  displayName?: string;
  type?: string;
  operations: ESPCDFDeviceOperation;
  _raw: any;
}
