/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ESPCDFDeviceParamOperationType,
  ESPCDFDeviceParamInterface,
  ESPCDFDeviceParamOperation,
  ESPCDFSimpleTSDataRequest,
  ESPCDFSimpleTSDataResponse,
  ESPCDFTSDataRequest,
} from "../types";
import {
  ESPCDFOperationEventEmitter,
  ESPCDFOperationListener,
} from "../utils/OperationEventEmitter";

/**
 * Represents a device parameter entity with operations
 */
export class ESPCDFDeviceParam implements ESPCDFDeviceParamInterface {
  name: string;
  value?: any;
  properties?: string[];
  dataType?: string;
  type?: string;
  bounds?: Record<string, any>;
  uiType?: string;
  deviceName?: string;
  operations: ESPCDFDeviceParamOperation;
  _raw: any;
  readonly events: ESPCDFOperationEventEmitter<
    ESPCDFDeviceParam,
    ESPCDFDeviceParamOperationType
  >;

  constructor(paramData: ESPCDFDeviceParamInterface) {
    this.name = paramData.name;
    this.value = paramData.value;
    this.properties = paramData.properties;
    this.dataType = paramData.dataType;
    this.type = paramData.type;
    this.bounds = paramData.bounds;
    this.uiType = paramData.uiType;
    this.deviceName = paramData.deviceName;
    this._raw = paramData._raw;

    // Create operations interface
    this.operations = paramData.operations;

    this.events = new ESPCDFOperationEventEmitter<
      ESPCDFDeviceParam,
      ESPCDFDeviceParamOperationType
    >();
  }

  /**
   * Subscribe to all operation events
   * @param listener - The callback function to register
   * @returns Unsubscribe function
   */
  subscribe(
    listener: ESPCDFOperationListener<
      ESPCDFDeviceParam,
      ESPCDFDeviceParamOperationType
    >
  ): () => void {
    return this.events.subscribe(listener);
  }

  /**
   * Remove all listeners and clean up
   */
  dispose(): void {
    this.events.dispose();
  }

  /**
   * Internal method to emit callbacks
   */
  private emit(
    operation: ESPCDFDeviceParamOperationType,
    success: boolean,
    data?: any,
    error?: any
  ): void {
    this.events.emit(this, operation, success, data, error);
  }

  /**
   * Wraps an operation with consistent event emission logic
   */
  private async runAndEmit<T>(
    operation: ESPCDFDeviceParamOperationType,
    execute: () => Promise<T>,
    getData?: (result: T) => unknown
  ): Promise<T> {
    let succeeded = false;
    let result!: T;
    let error: unknown;

    try {
      result = await execute();
      succeeded = true;
      return result;
    } catch (e) {
      error = e;
      throw e;
    } finally {
      this.emit(
        operation,
        succeeded,
        succeeded ? getData?.(result) : undefined,
        error
      );
    }
  }

  /**
   * Set the value of this parameter
   */
  async setValue(value: any): Promise<any> {
    return this.runAndEmit(
      "setValue",
      () => this.operations.setValue(value),
      () => value
    );
  }
  async getSimpleTSData?(request: ESPCDFSimpleTSDataRequest): Promise<ESPCDFSimpleTSDataResponse> {
    if (!this.operations.getSimpleTSData) {
      throw new Error("getSimpleTSData is not implemented");
    }
    return this.operations.getSimpleTSData(request);
  }
  async getRawTSData?(request: ESPCDFTSDataRequest): Promise<ESPCDFSimpleTSDataResponse> {
    if (!this.operations.getRawTSData) {
      throw new Error("getRawTSData is not implemented");
    }
    return this.operations.getRawTSData(request);
  }
  async getTSData?(request: ESPCDFTSDataRequest): Promise<ESPCDFSimpleTSDataResponse> {
    if (!this.operations.getTSData) {
      throw new Error("getTSData is not implemented");
    }
    return this.operations.getTSData(request);
  }
}
