/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { ESPCDFServiceParam } from "../../entities/ESPCDFServiceParam";
import { ESPCDFServiceParamInterface } from "./serviceParam";

/**
 * Operation types for service operations
 */
export type ESPCDFServiceOperationType = "getParams";

export interface ESPCDFServiceOperation {
  getParams(): Promise<ESPCDFServiceParam[]>;
}

export interface ESPCDFServiceInterface {
  name: string;
  params: ESPCDFServiceParamInterface[]; // ESPCDFServiceParam[] - using any to avoid circular dependency
  type: string;
  operations: ESPCDFServiceOperation;
  _raw: any;
}
