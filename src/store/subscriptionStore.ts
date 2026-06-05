/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { action, observable } from "mobx";
import { ESPCDFTransportConfig, RegisteredTransportsByNodeId } from "../types";
import { ESPCDF } from "./index";
import {
  handleNodeUpdateEvent,
  handleNodeTransportUpdate,
} from "../services/nodeEventHandlers";

class SubscriptionStore {
  private readonly rootStore: ESPCDF | null;

  /**
   * Client-registered transports by node id → transport type (`local`,
   * `matter_local`, …). Survives cloud sync / node object replacement.
   */
  @observable accessor registeredTransports: RegisteredTransportsByNodeId = {};

  constructor(rootStore?: ESPCDF) {
    this.rootStore = rootStore || null;
  }

  /**
   * Returns a shallow snapshot of registered transports for merge helpers.
   *
   * @returns Copy of the registered transport registry.
   */
  getRegisteredTransportsSnapshot(): RegisteredTransportsByNodeId {
    const snapshot: RegisteredTransportsByNodeId = {};
    for (const nodeId of Object.keys(this.registeredTransports)) {
      snapshot[nodeId] = { ...this.registeredTransports[nodeId] };
    }
    return snapshot;
  }

  /**
   * Persists a client-side transport for a node id.
   *
   * @param nodeId - CDF node id.
   * @param transport - Transport config (any type key in `transport.type`).
   */
  registerTransport = action(
    (nodeId: string, transport: ESPCDFTransportConfig): void => {
      if (!nodeId || !transport?.type) return;
      const existing = this.registeredTransports[nodeId] ?? {};
      this.registeredTransports = {
        ...this.registeredTransports,
        [nodeId]: {
          ...existing,
          [transport.type]: transport,
        },
      };
    },
  );

  /**
   * Removes one discovery transport for a node id.
   *
   * @param nodeId - CDF node id.
   * @param transportType - Transport map key to remove.
   */
  unregisterTransport = action(
    (nodeId: string, transportType: string): void => {
      if (!nodeId || !transportType) return;
      const existing = this.registeredTransports[nodeId];
      if (!existing?.[transportType]) return;

      const nextForNode = { ...existing };
      delete nextForNode[transportType];

      const nextRegistry = { ...this.registeredTransports };
      if (Object.keys(nextForNode).length === 0) {
        delete nextRegistry[nodeId];
      } else {
        nextRegistry[nodeId] = nextForNode;
      }
      this.registeredTransports = nextRegistry;
    },
  );

  /**
   * Clears all registered discovery transports for a node.
   *
   * @param nodeId - CDF node id.
   */
  clearTransportsForNode = action((nodeId: string): void => {
    if (!nodeId || !this.registeredTransports[nodeId]) return;
    const nextRegistry = { ...this.registeredTransports };
    delete nextRegistry[nodeId];
    this.registeredTransports = nextRegistry;
  });

  /**
   * Clears the entire discovery transport registry (e.g. logout).
   */
  clearRegisteredTransports = action((): void => {
    this.registeredTransports = {};
  });

  /**
   * Transport module to handle transport-related operations.
   */
  transport = {
    /**
     * Listens for transport details and updates the device store.
     * @param nodeId - The ID of the node to update.
     * @param transportDetails - The transport details to process.
     */
    listen: action(
      ({
        nodeId,
        transportDetails,
      }: {
        nodeId: string;
        transportDetails: ESPCDFTransportConfig;
      }) => {
        if (!this.rootStore) return;
        handleNodeTransportUpdate(
          this.rootStore,
          nodeId,
          transportDetails,
          "add",
        );
      },
    ),
  };

  nodeUpdates = {
    /**
     * Listens for node update events and routes them to appropriate handlers.
     * @param event - The node update event from the SDK.
     */
    listen: action((event: unknown) => {
      handleNodeUpdateEvent(event, this.rootStore);
    }),
  };
}

export default SubscriptionStore;
