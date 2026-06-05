/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ESPCDFServiceParamOperationType,
  ESPCDFServiceParamOperation,
  ESPCDFServiceParamInterface,
} from "../types";
import {
  ESPCDFOperationEventEmitter,
  ESPCDFOperationListener,
} from "../utils/OperationEventEmitter";

/**
 * Represents a service parameter entity
 */
export class ESPCDFServiceParam implements ESPCDFServiceParamInterface {
  name: string;
  value?: any;
  properties?: string[];
  dataType?: string;
  type: string;
  bounds?: Record<string, any>;
  serviceName?: string;
  operations: ESPCDFServiceParamOperation;
  _raw: any;
  readonly events: ESPCDFOperationEventEmitter<
    ESPCDFServiceParam,
    ESPCDFServiceParamOperationType
  >;

  constructor(paramData: ESPCDFServiceParamInterface) {
    Object.assign(this, paramData);
    this.name = paramData.name;
    this.value = paramData.value;
    this.properties = paramData.properties;
    this.dataType = paramData.dataType;
    this.type = paramData.type;
    this.bounds = paramData.bounds;
    this.serviceName = paramData.serviceName;
    this._raw = paramData._raw;

    // Create operations interface
    this.operations = paramData.operations;

    this.events = new ESPCDFOperationEventEmitter<
      ESPCDFServiceParam,
      ESPCDFServiceParamOperationType
    >();
  }

  /**
   * Subscribe to all operation events
   * @param listener - The callback function to register
   * @returns Unsubscribe function
   */
  subscribe(
    listener: ESPCDFOperationListener<
      ESPCDFServiceParam,
      ESPCDFServiceParamOperationType
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
   * Internal method to emit callbacks after operations
   */
  private emit(
    operation: ESPCDFServiceParamOperationType,
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
    operation: ESPCDFServiceParamOperationType,
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
   * Set the value of this parameter (if supported)
   */
  async setValue(value: any): Promise<any> {
    return this.runAndEmit(
      "setValue",
      () => this.operations.setValue(value),
      () => value
    );
  }
}
