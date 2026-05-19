/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Base operation for param entities (device param and service param).
 * Both support setValue; extend in deviceParam/serviceParam for specific operation types.
 */
export interface ESPCDFParamOperation {
  setValue(value: any): Promise<any>;
}

/**
 * Base param interface with common fields shared by device and service params.
 * DeviceParam and ServiceParam extend this with their specific properties.
 */
export interface ESPCDFParamInterface {
  name: string;
  value?: any;
  properties?: string[];
  dataType?: string;
  type?: string;
  bounds?: Record<string, any>;
  operations: ESPCDFParamOperation;
  _raw: any;
}

