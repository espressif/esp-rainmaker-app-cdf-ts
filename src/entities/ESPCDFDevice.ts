/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { ESPCDFDeviceParam } from "./ESPCDFDeviceParam";
import {
  ESPCDFDeviceOperationType,
  ESPCDFDeviceInterface,
  ESPCDFDeviceOperation,
  ESPCDFAttributeInterface,
} from "../types";
import {
  ESPCDFOperationEventEmitter,
  ESPCDFOperationListener,
} from "../utils/OperationEventEmitter";

/**
 * Represents a device entity with operations
 */
export class ESPCDFDevice {
  name: string;
  params: ESPCDFDeviceParam[];
  attributes?: ESPCDFAttributeInterface[];
  displayName?: string;
  type?: string;
  operations: ESPCDFDeviceOperation;
  _raw: any;
  readonly events: ESPCDFOperationEventEmitter<
    ESPCDFDevice,
    ESPCDFDeviceOperationType
  >;

  constructor(deviceData: ESPCDFDeviceInterface) {
    this.name = deviceData.name;
    this.params = deviceData.params.map(
      (param) => new ESPCDFDeviceParam(param)
    );
    this.attributes = deviceData.attributes;
    this.displayName = deviceData.displayName;
    this.type = deviceData.type;
    this._raw = deviceData._raw;

    // Create operations interface
    this.operations = deviceData.operations;
    this.events = new ESPCDFOperationEventEmitter<
      ESPCDFDevice,
      ESPCDFDeviceOperationType
    >();
  }

  /**
   * Subscribe to all operation events
   * @param listener - The callback function to register
   * @returns Unsubscribe function
   */
  subscribe(
    listener: ESPCDFOperationListener<ESPCDFDevice, ESPCDFDeviceOperationType>
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
   * Internal method to emit callbacks after operations
   */
  private emit(
    operation: ESPCDFDeviceOperationType,
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
    operation: ESPCDFDeviceOperationType,
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
   * Get parameters for this device
   */
  async getParams(): Promise<ESPCDFDeviceParam[]> {
    return this.runAndEmit(
      "getParams",
      () => this.operations.getParams(),
      (result) => result
    );
  }
}
