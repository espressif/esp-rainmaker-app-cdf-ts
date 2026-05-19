/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ESPCDFAPIResponse,
  ESPCDFSceneOperationType,
  ESPCDFSceneInterface,
  ESPCDFSceneOperation,
  ESPCDFSceneEditInput,
} from "../types";
import {
  ESPCDFOperationEventEmitter,
  ESPCDFOperationListener,
} from "../utils/OperationEventEmitter";

export class ESPCDFScene implements ESPCDFSceneInterface {
  id: string;
  name: string;
  info?: string;
  nodes: string[];
  actions: {
    [key: string]: {
      [key: string]: any;
    };
  };
  devicesCount: number;
  operations: ESPCDFSceneOperation;
  adaptorIdentifier?: string; // Adaptor identifier from the node used to create the scene
  _raw: any;
  readonly events: ESPCDFOperationEventEmitter<
    ESPCDFScene,
    ESPCDFSceneOperationType
  >;

  constructor(sceneData: ESPCDFSceneInterface) {
    // Validate required scene properties
    if (!sceneData.id || !sceneData.name) {
      throw new Error("Scene must have both id and name");
    }

    this.id = sceneData.id;
    this.name = sceneData.name;
    this.info = sceneData.info;
    this.nodes = sceneData.nodes || [];
    this.actions = sceneData.actions || {};
    this.devicesCount = sceneData.devicesCount || 0;
    this.adaptorIdentifier = sceneData.adaptorIdentifier;
    this._raw = sceneData._raw || sceneData;
    this.events = new ESPCDFOperationEventEmitter<
      ESPCDFScene,
      ESPCDFSceneOperationType
    >();
    this.operations = sceneData.operations;
  }

  /**
   * Subscribe to all operation events
   * @param listener - The callback function to register
   * @returns Unsubscribe function
   */
  subscribe(
    listener: ESPCDFOperationListener<ESPCDFScene, ESPCDFSceneOperationType>
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
    operation: ESPCDFSceneOperationType,
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
    operation: ESPCDFSceneOperationType,
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

  async edit(data: ESPCDFSceneEditInput): Promise<ESPCDFAPIResponse> {
    return this.runAndEmit("edit", () => this.operations.edit(data), (result) => result);
  }

  async remove(): Promise<ESPCDFAPIResponse> {
    return this.runAndEmit("remove", () => this.operations.remove(), (result) => result);
  }

  async activate(): Promise<ESPCDFAPIResponse> {
    return this.runAndEmit("activate", () => this.operations.activate(), (result) => result);
  }
}
