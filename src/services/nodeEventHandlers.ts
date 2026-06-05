/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { action, observable as mobxObservable } from "mobx";
import { ESPCDFNode } from "../entities/ESPCDFNode";
import { ESPCDF } from "../store/index";
import { ESPCDFTransportConfig } from "../types";
import {
  EVENT_NODE_PARAMS_CHANGED,
  EVENT_USER_NODE_ADDED,
  EVENT_USER_NODE_REMOVED,
  EVENT_NODE_CONNECTED,
  EVENT_NODE_DISCONNECTED,
} from "../utils/constants";

/**
 * Safely parses the payload and returns null if parsing fails.
 */
export function safelyParsePayload(payload: any): any {
  if (!payload) return null;
  if (typeof payload === "string") {
    try {
      return JSON.parse(payload);
    } catch {
      return null;
    }
  }
  return payload;
}

type ParamHolder = { params?: { name: string; value?: unknown }[] };

function applyNamedEntityParamUpdates(
  node: ESPCDFNode,
  entityName: string,
  params: Record<string, unknown>,
  kind: "device" | "service",
  holder: ParamHolder | undefined
) {
  if (!holder?.params?.length) return;

  for (const [paramName, value] of Object.entries(params)) {
    const param = holder.params.find((p) => p.name === paramName);
    if (!param) continue;

    const oldValue = (param as { value?: unknown }).value;
    (param as { value?: unknown }).value = value;

    if (kind === "device") {
      node.emitPropertyChange({
        type: "deviceParamChanged",
        deviceName: entityName,
        paramName,
        value,
        oldValue,
        entity: node,
      });
    } else {
      node.emitPropertyChange({
        type: "serviceParamChanged",
        serviceName: entityName,
        paramName,
        value,
        oldValue,
        entity: node,
      });
    }
  }
}

/**
 * Handles the `EVENT_NODE_PARAMS_CHANGED` event.
 * Merges shadow-style param updates into the node. Top-level keys are device or service names;
 * each maps to `{ paramName: value, ... }`. Emits `deviceParamChanged` / `serviceParamChanged`
 * per param so `_raw` stays in sync (see adaptor property-change handlers).
 */
export function handleNodeParamsChanged(
  rootStore: ESPCDF | null,
  node_id: string,
  payload: any
) {
  if (!rootStore || !node_id || !payload) return;

  const node = rootStore.nodeStore.getNodeById(node_id);
  if (!node) return;

  for (const [entityName, params] of Object.entries(
    payload as Record<string, Record<string, unknown>>
  )) {
    if (!params || typeof params !== "object" || Array.isArray(params)) continue;

    const device = node.devices?.find((d: { name: string }) => d.name === entityName);
    if (device) {
      applyNamedEntityParamUpdates(node, entityName, params, "device", device);
      continue;
    }

    const service = node.services?.find((s: { name: string }) => s.name === entityName);
    if (service) {
      applyNamedEntityParamUpdates(node, entityName, params, "service", service);
    }
  }
}

/**
 * Handles the `EVENT_USER_NODE_ADDED` event.
 * Adds nodes to the store.
 */
export async function handleUserNodeAdded(rootStore: ESPCDF | null, payload: any) {
  const activeAdaptorIdentifier = rootStore?.sdkAdaptorRegistry?.getActiveAdaptorIdentifier();
  if (!rootStore || !activeAdaptorIdentifier) return;

  const user = rootStore.userStore.getAuthorizationEntityForAdaptor(activeAdaptorIdentifier)
  if (!user) return;
  try {
    const nodeIds = payload.nodeIds;
    await Promise.all(
      nodeIds.map((nodeId: string) => user.getNodeDetails(nodeId))
    );
  } catch (error) {
    console.error(
      `[NodeEventHandlers] Error handling user node added event:`,
      error
    );
  }
}

/**
 * Handles the `EVENT_USER_NODE_REMOVED` event.
 * Removes nodes from the store.
 */
export function handleUserNodeRemoved(rootStore: ESPCDF | null, payload: any) {
  if (!rootStore || !payload) return;

  const nodeIds = payload.nodeIds || [];
  nodeIds.forEach((nodeId: string) => {
    try {
      rootStore.nodeStore.deleteNode(nodeId);
    } catch (error) {
      console.error(
        `[NodeEventHandlers] Failed to delete node ${nodeId}:`,
        error
      );
    }
  });
}

/**
 * Handles the `EVENT_NODE_CONNECTED` event.
 * Updates node connectivity status and adds cloud transport.
 */
export function handleNodeConnected(
  rootStore: ESPCDF | null,
  node_id: string,
  timestamp: number
) {
  if (!rootStore || !node_id) return;

  const node = rootStore.nodeStore.getNodeById(node_id);
  if (!node) return;

  // Update connectivity status
  rootStore.nodeStore.updateNode(node_id, {
    connectivityStatus: {
      isConnected: true,
      lastConnectionTimestamp: timestamp || Date.now(),
    },
  });
  const updatedNode = rootStore.nodeStore.getNodeById(node_id);
  if (!updatedNode) return;
  updatedNode.emitPropertyChange({
    type: "connectivityStatusChanged",
    connectivityStatus: {
      isConnected: true,
      lastConnectionTimestamp: timestamp || Date.now(),
    },
    entity: updatedNode,
  });
}

/**
 * Handles the `EVENT_NODE_DISCONNECTED` event.
 * Updates node connectivity status and removes cloud transport.
 */
export function handleNodeDisconnected(
  rootStore: ESPCDF | null,
  node_id: string,
  timestamp: number
) {
  if (!rootStore || !node_id) return;

  const node = rootStore.nodeStore.getNodeById(node_id);
  if (!node) return;

  // Update connectivity status
  rootStore.nodeStore.updateNode(node_id, {
    connectivityStatus: {
      isConnected: false,
      lastConnectionTimestamp: timestamp || Date.now(),
    },
  });

  const updatedNode = rootStore.nodeStore.getNodeById(node_id);
  if (!updatedNode) return;

  updatedNode.emitPropertyChange({
    type: "connectivityStatusChanged",
    connectivityStatus: {
      isConnected: false,
      lastConnectionTimestamp: timestamp || Date.now(),
    },
    entity: updatedNode,
  });
}

/**
 * Handles node update events from the SDK.
 * Routes events to appropriate handlers based on event type.
 */
export function handleNodeUpdateEvent(event: any, rootStore: ESPCDF | null) {
  if (!event || !rootStore) return;

  const { event_type, timestamp, node_id = null, payload = null } = event;

  // Parse payload safely
  const parsedPayload = safelyParsePayload(payload);

  // Handle events based on their type
  switch (event_type) {
    case EVENT_NODE_PARAMS_CHANGED:
      handleNodeParamsChanged(rootStore, node_id, parsedPayload);
      break;

    case EVENT_USER_NODE_ADDED:
      handleUserNodeAdded(rootStore, parsedPayload);
      break;

    case EVENT_USER_NODE_REMOVED:
      handleUserNodeRemoved(rootStore, parsedPayload);
      break;

    case EVENT_NODE_CONNECTED:
      handleNodeConnected(rootStore, node_id, timestamp);
      break;

    case EVENT_NODE_DISCONNECTED:
      handleNodeDisconnected(rootStore, node_id, timestamp);
      break;

    default:
      break;
  }
}

/**
 * Handles adding a transport to a node.
 * Updates the node's available transports and emits property change events.
 * @param rootStore - The root CDF store instance
 * @param nodeId - The ID of the node to update
 * @param transportDetails - The transport configuration to add
 */
export const handleAddNodeTransport = action(
  (rootStore: ESPCDF | null, nodeId: string, transport: ESPCDFTransportConfig) => {
    if (!rootStore || !nodeId || !transport?.type) return;

    rootStore.subscriptionStore.registerTransport(nodeId, transport);

    const node = rootStore.nodeStore.getNodeById(nodeId);
    if (!node) return;

    const oldAvailableTransports = { ...node.availableTransports };
    const newAvailableTransports = { ...node.availableTransports };

    newAvailableTransports[transport.type] = transport;

    rootStore.nodeStore.updateNode(node.id, {
      availableTransports: mobxObservable.object(newAvailableTransports),
    });

    node.emitPropertyChange({
      type: "availableTransportsChanged",
      availableTransports: newAvailableTransports,
      oldAvailableTransports: oldAvailableTransports,
      entity: node,
    });
  }
);
/**
 * Handles removing a transport from a node.
 * Updates the node's available transports and emits property change events.
 * @param rootStore - The root CDF store instance
 * @param nodeId - The ID of the node to update
 * @param transportDetails - The transport configuration to remove
 */
export const handleRemoveNodeTransport = action(
  (rootStore: ESPCDF | null, nodeId: string, transport: ESPCDFTransportConfig) => {
    if (!rootStore || !nodeId || !transport?.type) return;

    rootStore.subscriptionStore.unregisterTransport(nodeId, transport.type);

    const node = rootStore.nodeStore.getNodeById(nodeId);
    if (!node) return;

    const oldAvailableTransports = { ...node.availableTransports };
    const newAvailableTransports = { ...node.availableTransports };
    delete newAvailableTransports[transport.type];

    rootStore.nodeStore.updateNode(node.id, {
      availableTransports: mobxObservable.object(newAvailableTransports),
    });

    node.emitPropertyChange({
      type: "availableTransportsChanged",
      availableTransports: newAvailableTransports,
      oldAvailableTransports: oldAvailableTransports,
      entity: node,
    });
  }
);


/**
 * Handles updating node transport (add or remove).
 * Routes to the appropriate handler based on the operation type.
 * @param rootStore - The root CDF store instance
 * @param nodeId - The ID of the node to update
 * @param transportDetails - The transport configuration
 * @param operation - The operation to perform: "add" (default) or "remove"
 */
export function handleNodeTransportUpdate(
  rootStore: ESPCDF | null,
  nodeId: string,
  transportDetails: ESPCDFTransportConfig,
  operation: "add" | "remove" = "add"
): void {
  switch (operation) {
    case "add":
      handleAddNodeTransport(rootStore, nodeId, transportDetails);
      break;
    case "remove":
      handleRemoveNodeTransport(rootStore, nodeId, transportDetails);
      break;
  }
}
