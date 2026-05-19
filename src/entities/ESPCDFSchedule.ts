/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ESPCDFAPIResponse,
  ESPCDFScheduleOperationType,
  ESPCDFScheduleInterface,
  ESPCDFScheduleOperation,
  ESPCDFScheduleEditInput,
  ESPCDFScheduleAction,
  ESPCDFScheduleTrigger,
  ESPCDFScheduleValidity,
} from "../types";
import {
  ESPCDFOperationEventEmitter,
  ESPCDFOperationListener,
} from "../utils/OperationEventEmitter";

export class ESPCDFSchedule implements ESPCDFScheduleInterface {
  id: string;
  name: string;
  info?: string;
  nodes: string[];
  triggers: ESPCDFScheduleTrigger[];
  action: ESPCDFScheduleAction;
  enabled?: boolean;
  validity?: ESPCDFScheduleValidity;
  flags?: number;
  devicesCount: number;
  operations: ESPCDFScheduleOperation;
  adaptorIdentifier?: string; // Adaptor identifier from the node used to create the schedule
  outOfSyncMeta?: Record<string, any>;
  _raw: any;
  readonly events: ESPCDFOperationEventEmitter<
    ESPCDFSchedule,
    ESPCDFScheduleOperationType
  >;

  constructor(scheduleData: ESPCDFScheduleInterface) {
    // Validate required schedule properties
    if (!scheduleData.id || !scheduleData.name) {
      throw new Error("Schedule must have both id and name");
    }
    if (!scheduleData.triggers || scheduleData.triggers.length === 0) {
      throw new Error("Schedule must have at least one trigger");
    }
    if (!scheduleData.action || Object.keys(scheduleData.action).length === 0) {
      throw new Error("Schedule must have at least one action");
    }

    this.id = scheduleData.id;
    this.name = scheduleData.name;
    this.info = scheduleData.info;
    this.nodes = scheduleData.nodes || [];
    this.triggers = scheduleData.triggers || [];
    this.action = scheduleData.action || {};
    this.enabled = scheduleData.enabled;
    this.validity = scheduleData.validity;
    this.flags = scheduleData.flags;
    this.devicesCount = scheduleData.devicesCount || 0;
    this.adaptorIdentifier = scheduleData.adaptorIdentifier;
    this.outOfSyncMeta = scheduleData.outOfSyncMeta || {};
    this._raw = scheduleData._raw || scheduleData;
    this.events = new ESPCDFOperationEventEmitter<
      ESPCDFSchedule,
      ESPCDFScheduleOperationType
    >();
    this.operations = scheduleData.operations;
  }

  /**
   * Subscribe to all operation events
   * @param listener - The callback function to register
   * @returns Unsubscribe function
   */
  subscribe(
    listener: ESPCDFOperationListener<
      ESPCDFSchedule,
      ESPCDFScheduleOperationType
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
    operation: ESPCDFScheduleOperationType,
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
    operation: ESPCDFScheduleOperationType,
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

  async add(): Promise<ESPCDFAPIResponse> {
    return this.runAndEmit("add", () => this.operations.add(), (result) => result);
  }

  async edit(data: ESPCDFScheduleEditInput): Promise<ESPCDFAPIResponse> {
    return this.runAndEmit("edit", () => this.operations.edit(data), (result) => result);
  }

  async remove(): Promise<ESPCDFAPIResponse> {
    return this.runAndEmit("remove", () => this.operations.remove(), (result) => result);
  }

  async enable(): Promise<ESPCDFAPIResponse> {
    return this.runAndEmit("enable", () => this.operations.enable(), (result) => result);
  }

  async disable(): Promise<ESPCDFAPIResponse> {
    return this.runAndEmit("disable", () => this.operations.disable(), (result) => result);
  }

  /**
   * Checks if the schedule is enabled
   * @returns True if the schedule is enabled, false otherwise
   */
  isEnabled(): boolean {
    return this.enabled || false;
  }

  /**
   * Adds out-of-sync metadata for a specific node
   *
   * This method stores metadata indicating that a node's schedule configuration
   * is not synchronized with the server state.
   * @param nodeId - The identifier of the node
   * @param value - The metadata value to store
   * @example
   * schedule.addOutOfSyncMeta('node1', { lastSync: timestamp });
   */
  addOutOfSyncMeta(nodeId: string, value: any): void {
    if (!this.outOfSyncMeta) {
      this.outOfSyncMeta = {};
    }
    this.outOfSyncMeta[nodeId] = value;
  }

  /**
   * Retrieves out-of-sync metadata for a specific node
   * @param nodeId - The identifier of the node
   * @returns The stored metadata for the node
   * @example
   * const syncStatus = schedule.getOutOfSyncMeta('node1');
   */
  getOutOfSyncMeta(nodeId: string): any {
    return this.outOfSyncMeta?.[nodeId];
  }

  /**
   * Removes out-of-sync metadata for a specific node
   *
   * This method clears the stored metadata indicating that a node's schedule
   * configuration has been synchronized.
   * @param nodeId - The identifier of the node
   * @example
   * schedule.removeOutOfSyncMeta('node1');
   */
  removeOutOfSyncMeta(nodeId: string): void {
    if (this.outOfSyncMeta) {
      delete this.outOfSyncMeta[nodeId];
    }
  }

  /**
   * Clears all out-of-sync metadata
   *
   * This method removes all stored metadata about node synchronization status,
   * effectively marking all nodes as synchronized.
   * @example
   * schedule.clearOutOfSyncMeta();
   */
  clearOutOfSyncMeta(): void {
    this.outOfSyncMeta = {};
  }
}
