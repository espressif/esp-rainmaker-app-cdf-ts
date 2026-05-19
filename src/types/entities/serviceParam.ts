/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { ESPCDFParamInterface, ESPCDFParamOperation } from "./param";

/**
 * Operation types for service param operations
 */
export type ESPCDFServiceParamOperationType = "setValue";

export type ESPCDFServiceParamOperation = ESPCDFParamOperation;

/**
 * Service param interface; extends base with service-specific properties.
 * type is required for service params.
 */
export interface ESPCDFServiceParamInterface extends ESPCDFParamInterface {
  type: string;
  serviceName?: string;
  operations: ESPCDFServiceParamOperation;
}
