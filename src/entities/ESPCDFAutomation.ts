/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ESPCDFAPIResponse,
  ESPCDFAutomationOperationType,
  ESPCDFAutomationInterface,
  ESPCDFAutomationOperation,
  ESPCDFAutomationEvent,
  ESPCDFAutomationAction,
  ESPCDFAutomationLocation,
  ESPCDFAutomationEditInput,
  ESPCDFAutomationEventType,
  ESPCDFAutomationEventOperator,
} from "../types";
import {
  ESPCDFOperationEventEmitter,
  ESPCDFOperationListener,
} from "../utils/OperationEventEmitter";

export class ESPCDFAutomation implements ESPCDFAutomationInterface {
  id: string;
  name: string;
  enabled: boolean;
  nodeId?: string;
  eventType: ESPCDFAutomationEventType;
  events: ESPCDFAutomationEvent[];
  eventOperator: ESPCDFAutomationEventOperator;
  actions: ESPCDFAutomationAction[];
  retrigger?: boolean;
  location?: ESPCDFAutomationLocation;
  region?: string;
  metadata?: any;
  operations: ESPCDFAutomationOperation;
  adaptorIdentifier?: string; // Adaptor identifier from the node used to create the automation
  _raw: any;
  readonly operationsEvents: ESPCDFOperationEventEmitter<
    ESPCDFAutomation,
    ESPCDFAutomationOperationType
  >;

  constructor(automationData: ESPCDFAutomationInterface) {
    this.id = automationData.id;
    this.name = automationData.name;
    this.enabled = automationData.enabled ?? false;
    this.nodeId = automationData.nodeId;
    this.eventType = automationData.eventType;
    this.events = automationData.events || [];
    this.eventOperator = automationData.eventOperator;
    this.actions = automationData.actions || [];
    this.retrigger = automationData.retrigger;
    this.location = automationData.location;
    this.region = automationData.region;
    this.metadata = automationData.metadata;
    this.adaptorIdentifier = automationData.adaptorIdentifier;
    this._raw = automationData._raw || automationData;
    this.operationsEvents = new ESPCDFOperationEventEmitter<
      ESPCDFAutomation,
      ESPCDFAutomationOperationType
    >();
    this.operations = automationData.operations;
  }

  /**
   * Subscribe to all operation events
   * @param listener - The callback function to register
   * @returns Unsubscribe function
   */
  subscribe(
    listener: ESPCDFOperationListener<
      ESPCDFAutomation,
      ESPCDFAutomationOperationType
    >
  ): () => void {
    return this.operationsEvents.subscribe(listener);
  }

  /**
   * Remove all listeners and clean up
   */
  dispose(): void {
    this.operationsEvents.dispose();
  }

  /**
   * Internal method to emit callbacks after operations
   */
  private emit(
    operation: ESPCDFAutomationOperationType,
    success: boolean,
    data?: any,
    error?: any
  ): void {
    this.operationsEvents.emit(this, operation, success, data, error);
  }

  /**
   * Wraps an operation with consistent event emission logic
   * @param operation Type of operation being performed
   * @param execute The actual operation to execute
   * @param getData Optional callback to extract data for the event payload
   * @returns The result of the operation
   */
  private async runAndEmit<T>(
    operation: ESPCDFAutomationOperationType,
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

  async update(data: ESPCDFAutomationEditInput): Promise<ESPCDFAPIResponse> {
    return this.runAndEmit(
      "update",
      () => this.operations.update(data),
      () => data
    );
  }

  async delete(): Promise<ESPCDFAPIResponse> {
    return this.runAndEmit(
      "delete",
      () => this.operations.delete(),
      (result) => result
    );
  }

  async enable(enabled: boolean): Promise<ESPCDFAPIResponse> {
    return this.runAndEmit(
      "enable",
      () => this.operations.enable(enabled),
      () => enabled
    );
  }

  /**
   * Checks if the automation is enabled
   * @returns True if the automation is enabled, false otherwise
   */
  isEnabled(): boolean {
    return this.enabled || false;
  }
}
