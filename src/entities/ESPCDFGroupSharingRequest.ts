/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ESPCDFAPIResponse,
  ESPCDFGroupSharingRequestOperationType,
  ESPCDFGroupSharingRequestInterface,
  ESPCDFGroupSharingRequestOperation,
  ESPCDFGroupSharingStatus,
} from "../types";
import {
  ESPCDFOperationEventEmitter,
  ESPCDFOperationListener,
} from "../utils/OperationEventEmitter";

export class ESPCDFGroupSharingRequest implements ESPCDFGroupSharingRequestInterface {
  id: string;
  status: ESPCDFGroupSharingStatus;
  timestamp: number;
  groupIds: string[];
  groupnames: string[];
  username: string;
  primaryUsername: string;
  transfer: boolean;
  newRole: string;
  metadata: Record<string, any>;
  operations: ESPCDFGroupSharingRequestOperation;
  _raw: any;
  readonly events: ESPCDFOperationEventEmitter<
    ESPCDFGroupSharingRequest,
    ESPCDFGroupSharingRequestOperationType
  >;

  constructor(requestData: ESPCDFGroupSharingRequestInterface) {
    this.id = requestData.id;
    this.status = requestData.status;
    this.timestamp = requestData.timestamp;
    this.groupIds = requestData.groupIds;
    this.groupnames = requestData.groupnames;
    this.username = requestData.username;
    this.primaryUsername = requestData.primaryUsername;
    this.transfer = requestData.transfer;
    this.newRole = requestData.newRole;
    this.metadata = requestData.metadata;
    this.operations = requestData.operations;
    this._raw = requestData._raw;
    this.events = new ESPCDFOperationEventEmitter<
      ESPCDFGroupSharingRequest,
      ESPCDFGroupSharingRequestOperationType
    >();
  }

  /**
   * Subscribe to all operation events
   * @param listener - The callback function to register
   * @returns Unsubscribe function
   */
  subscribe(
    listener: ESPCDFOperationListener<
      ESPCDFGroupSharingRequest,
      ESPCDFGroupSharingRequestOperationType
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
    operation: ESPCDFGroupSharingRequestOperationType,
    success: boolean,
    data?: any,
    error?: any
  ): void {
    this.events.emit(this, operation, success, data, error);
  }

  /**
   * Wraps an operation with consistent event emission logic.
   * Supports optional getSuccess to derive success from result (e.g. result.status === "success").
   */
  private async runAndEmit<T>(
    operation: ESPCDFGroupSharingRequestOperationType,
    execute: () => Promise<T>,
    getData?: (result: T) => unknown,
    getSuccess?: (result: T) => boolean
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
      const success = succeeded ? (getSuccess?.(result) ?? true) : false;
      this.emit(
        operation,
        success,
        succeeded ? getData?.(result) : undefined,
        error
      );
    }
  }

  async accept(): Promise<ESPCDFAPIResponse> {
    return this.runAndEmit(
      "accept",
      () => this.operations.accept(),
      (result) => result,
      (result) => result.status === "success"
    );
  }

  async decline(): Promise<ESPCDFAPIResponse> {
    return this.runAndEmit(
      "decline",
      () => this.operations.decline(),
      (result) => result,
      (result) => result.status === "success"
    );
  }

  async remove(): Promise<ESPCDFAPIResponse> {
    return this.runAndEmit(
      "remove",
      () => this.operations.remove(),
      (result) => result,
      (result) => result.status === "success"
    );
  }
}
