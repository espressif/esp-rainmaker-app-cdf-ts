/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ESPCDFNodeConfigInterface,
  ESPCDFNodeInfoInterface,
  ESPCDFAttributeInterface,
} from "../types";

/**
 * Represents node configuration entity
 */
export class ESPCDFNodeConfig {
  configVersion: string;
  attributes?: ESPCDFAttributeInterface[];
  info?: ESPCDFNodeInfoInterface;

  constructor(configData: ESPCDFNodeConfigInterface) {
    Object.assign(this, configData);
    this.configVersion = configData.configVersion;
    this.attributes = configData.attributes;
    this.info = configData.info;
  }
}
