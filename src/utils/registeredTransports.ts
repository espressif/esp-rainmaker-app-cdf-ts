/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { ESPCDFNode } from "../entities/ESPCDFNode";
import {
  ESPCDFTransportConfig,
  RegisteredTransportsByNodeId,
} from "../types";

/**
 * Merges client-registered transports from subscriptionStore onto an incoming
 * cloud node.
 *
 * For a list, map over nodes: `nodes.map((n) => applyRegisteredTransports(n, registered))`
 */
export function applyRegisteredTransports(
  node: ESPCDFNode,
  registeredByNodeId: RegisteredTransportsByNodeId = {},
): ESPCDFNode {
  const transports: Record<string, ESPCDFTransportConfig> = {};
  const registered = registeredByNodeId[node.id];

  if (registered) {
    Object.assign(transports, registered);
  }

  if (Object.keys(transports).length === 0) {
    return node;
  }

  // Use Object.create to preserve the ESPCDFNode class prototype (and its methods like
  // subscribe/dispose). A plain object spread `{...node}` would strip the prototype, causing
  // "node.subscribe is not a function" when NodeStoreSynchronizer.attach() is called.
  const merged = Object.assign(
    Object.create(Object.getPrototypeOf(node)) as ESPCDFNode,
    node,
    {
      availableTransports: {
        ...(node.availableTransports || {}),
        ...transports,
      },
    }
  );

  const raw = merged._raw as Record<string, unknown> | undefined;
  if (raw && typeof raw === "object") {
    const prevAt = raw.availableTransports as
      | Record<string, unknown>
      | undefined;
    merged._raw = {
      ...raw,
      availableTransports: { ...(prevAt || {}), ...transports },
    } as typeof merged._raw;
  }

  return merged;
}
