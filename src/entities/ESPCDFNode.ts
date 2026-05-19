/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { ESPCDFNodeConfig } from "./ESPCDFNodeConfig";
import { ESPCDFDevice } from "./ESPCDFDevice";
import { ESPCDFService } from "./ESPCDFService";
import {
  ESPCDFAPIResponse,
  ESPCDFAPIDataResponse,
  ESPCDFNodeOperationType,
  ESPCDFNodeInterface,
  ESPCDFNodeOperation,
  ESPCDFConnectivityStatusInterface,
  ESPCDFOTAUpdateResponse,
  ESPCDFTransportConfig,
  ESPCDFPropertyChangeCallback,
  ESPCDFPropertyChangeEvent,
} from "../types";
import {
  ESPCDFOperationEventEmitter,
  ESPCDFOperationListener,
} from "../utils/OperationEventEmitter";

/**
 * Property change event emitter for node property changes
 * Separate from operation events as it's a different concern
 */
class PropertyChangeEventEmitter {
  private callbacks: Set<ESPCDFPropertyChangeCallback> = new Set();

  /**
   * Register a callback for property change events
   * @param callback - The callback function to register
   * @returns Unsubscribe function
   */
  subscribe(callback: ESPCDFPropertyChangeCallback): () => void {
    this.callbacks.add(callback);
    return () => {
      this.callbacks.delete(callback);
    };
  }

  /**
   * Unregister a property change callback
   */
  unsubscribe(callback: ESPCDFPropertyChangeCallback): void {
    this.callbacks.delete(callback);
  }

  /**
   * Emit property change event to all registered callbacks
   */
  emit(event: ESPCDFPropertyChangeEvent): void {
    this.callbacks.forEach((callback) => {
      try {
        callback(event);
      } catch (err) {
        console.error(`[ESPCDFNode] Error in property change callback:`, err);
      }
    });
  }

  /**
   * Remove all callbacks
   */
  dispose(): void {
    this.callbacks.clear();
  }
}

export class ESPCDFNode implements ESPCDFNodeInterface {
  identifier: string;
  id: string;
  type?: string;
  isPrimaryUser?: boolean;
  connectivityStatus?: ESPCDFConnectivityStatusInterface;
  nodeConfig?: ESPCDFNodeConfig;
  devices?: ESPCDFDevice[];
  services?: ESPCDFService[];
  metadata?: Record<string, any>;
  tags?: string[];
  role?: string;
  transportOrder?: string[];
  availableTransports?: Partial<Record<string, ESPCDFTransportConfig>>;
  operations: ESPCDFNodeOperation;
  _raw: any;
  [key: string]: any;
  readonly events: ESPCDFOperationEventEmitter<
    ESPCDFNode,
    ESPCDFNodeOperationType
  >;
  private propertyChangeEmitter: PropertyChangeEventEmitter;

  constructor(nodeData: ESPCDFNodeInterface) {
    this.identifier = nodeData.identifier;
    this.id = nodeData.id;
    this.connectivityStatus = nodeData.connectivityStatus;
    this.isPrimaryUser = nodeData.isPrimaryUser;
    this.nodeConfig = nodeData.nodeConfig
      ? new ESPCDFNodeConfig(nodeData.nodeConfig)
      : undefined;
    if (nodeData.devices) {
      this.devices = nodeData.devices.map((device) => new ESPCDFDevice(device));
    }
    if (nodeData.services) {
      this.services = nodeData.services.map(
        (service) => new ESPCDFService(service)
      );
    }
    this.metadata = nodeData.metadata;
    this.tags = nodeData.tags;
    this.role = nodeData.role;
    this.transportOrder = nodeData.transportOrder || [];
    this.availableTransports = nodeData.availableTransports || {};
    this.operations = nodeData.operations;
    this._raw = nodeData._raw;
    this.events = new ESPCDFOperationEventEmitter<
      ESPCDFNode,
      ESPCDFNodeOperationType
    >();
    this.propertyChangeEmitter = new PropertyChangeEventEmitter();
  }

  /**
   * Subscribe to all operation events
   * @param listener - The callback function to register
   * @returns Unsubscribe function
   */
  subscribe(
    listener: ESPCDFOperationListener<ESPCDFNode, ESPCDFNodeOperationType>
  ): () => void {
    return this.events.subscribe(listener);
  }

  /**
   * Remove all listeners and clean up
   */
  dispose(): void {
    this.events.dispose();
    this.propertyChangeEmitter.dispose();
  }

  /**
   * Internal method to emit callbacks after operations
   */
  private emit(
    operation: ESPCDFNodeOperationType,
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
    operation: ESPCDFNodeOperationType,
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
   * Register a callback for property change events
   * This allows adaptors to listen to property changes and sync to _raw
   * @param callback - The callback function to register
   * @returns Unsubscribe function
   */
  onPropertyChange(callback: ESPCDFPropertyChangeCallback): () => void {
    return this.propertyChangeEmitter.subscribe(callback);
  }

  /**
   * Unregister a property change callback
   */
  offPropertyChange(callback: ESPCDFPropertyChangeCallback): void {
    this.propertyChangeEmitter.unsubscribe(callback);
  }

  /**
   * Emit a property change event
   * This is called internally when properties are updated
   * Can also be called externally (e.g., from store handlers)
   * @param event - The typed property change event
   */
  emitPropertyChange(event: ESPCDFPropertyChangeEvent): void {
    this.propertyChangeEmitter.emit(event);
  }

  // Node management operations
  async setMultipleParams(
    params: Record<string, any>
  ): Promise<ESPCDFAPIResponse> {
    return this.runAndEmit(
      "setMultipleParams",
      () => this.operations.setMultipleParams(params),
      () => params
    );
  }

  async delete(): Promise<ESPCDFAPIResponse> {
    return this.runAndEmit("delete", () => this.operations.delete(), () => this);
  }

  // Metadata operations
  async updateMetadata(params: any): Promise<any> {
    return this.runAndEmit(
      "updateMetadata",
      async () => {
        if (!this.operations.updateMetadata) {
          throw new Error("updateMetadata operation not supported");
        }
        return this.operations.updateMetadata(params);
      },
      () => params
    );
  }

  // OTA operations
  async checkOTAUpdate?(): Promise<
    ESPCDFAPIDataResponse<ESPCDFOTAUpdateResponse>
  > {
    return this.runAndEmit(
      "checkOTAUpdate",
      async () => {
        const fn = this.operations.checkOTAUpdate;
        if (!fn) throw new Error("checkOTAUpdate operation not supported");
        return fn.call(this.operations);
      },
      (result) => result?.data
    );
  }

  async pushOTAUpdate(params: any): Promise<any> {
    return this.runAndEmit(
      "pushOTAUpdate",
      async () => {
        if (!this.operations.pushOTAUpdate) {
          throw new Error("pushOTAUpdate operation not supported");
        }
        return this.operations.pushOTAUpdate(params);
      },
      (result) => result
    );
  }

  async getOTAUpdateStatus(otaJobId: string): Promise<any> {
    return this.runAndEmit(
      "getOTAStatus",
      async () => {
        if (!this.operations.getOTAUpdateStatus) {
          throw new Error("getOTAUpdateStatus operation not supported");
        }
        return this.operations.getOTAUpdateStatus(otaJobId);
      },
      (result) => result
    );
  }

  async setTimeZone(timeZone: string): Promise<ESPCDFAPIResponse> {
    return this.runAndEmit(
      "setTimeZone",
      () => this.operations.setTimeZone(timeZone),
      () => timeZone
    );
  }
}
