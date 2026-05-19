/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Enum for CDF event types used in event subscriptions.
 */
export enum ESPCDFEventType {
  localDiscovery = "com.espressif.event.localDiscovery",
  nodeUpdates = "com.espressif.event.nodeUpdates",
}

/**
 * Event shape consumed by subscription store node-update handlers.
 * Single source of truth for the contract between subscription channels and nodeEventHandlers.
 *
 * `event_type` should use `ESP_CDF_NODE_SUBSCRIPTION_EVENTS` values (CDF MQTT-style topics).
 */
export interface ESPCDFNodeUpdateEvent {
  event_type: string;
  node_id: string;
  payload: unknown;
  timestamp: number;
}

/**
 * Input shape for mapping to CDF node-update event (e.g. from SDK subscription channel).
 * Keeps utils/subscriptionHelper free of SDK imports (dependency inversion).
 */
export interface NodeUpdateDataInput {
  eventType: string;
  nodeId: string;
  payload: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

/**
 * Context required for node-update subscriptions (root store or equivalent).
 * Used to forward SDK subscription manager updates into the CDF subscription store.
 */
export interface ESPCDFNodeUpdateSubscriptionContext {
  subscriptionStore: {
    nodeUpdates: { listen(event: ESPCDFNodeUpdateEvent): void };
  };
}
