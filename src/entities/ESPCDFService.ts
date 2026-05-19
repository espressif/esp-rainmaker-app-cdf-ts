/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ESPCDFServiceOperationType,
  ESPCDFServiceInterface,
  ESPCDFServiceOperation,
} from "../types";
import { ESPCDFServiceParam } from "./ESPCDFServiceParam";
import {
  ESPCDFOperationEventEmitter,
  ESPCDFOperationListener,
} from "../utils/OperationEventEmitter";

/**
 * Represents a service entity
 */
export class ESPCDFService implements ESPCDFServiceInterface {
  name: string;
  params: ESPCDFServiceParam[];
  type: string;
  operations: ESPCDFServiceOperation;
  _raw: any;
  readonly events: ESPCDFOperationEventEmitter<
    ESPCDFService,
    ESPCDFServiceOperationType
  >;

  constructor(serviceData: ESPCDFServiceInterface) {
    this.name = serviceData.name;
    this.params = serviceData.params.map(
      (param) => new ESPCDFServiceParam(param)
    );
    this.type = serviceData.type;
    this._raw = serviceData._raw;

    // Create operations interface
    this.operations = serviceData.operations;

    this.events = new ESPCDFOperationEventEmitter<
      ESPCDFService,
      ESPCDFServiceOperationType
    >();
  }

  /**
   * Subscribe to all operation events
   * @param listener - The callback function to register
   * @returns Unsubscribe function
   */
  subscribe(
    listener: ESPCDFOperationListener<ESPCDFService, ESPCDFServiceOperationType>
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
    operation: ESPCDFServiceOperationType,
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
    operation: ESPCDFServiceOperationType,
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
   * Get parameters for this service
   */
  async getParams(): Promise<ESPCDFServiceParam[]> {
    return this.runAndEmit(
      "getParams",
      () => this.operations.getParams(),
      (result) => result
    );
  }
}
