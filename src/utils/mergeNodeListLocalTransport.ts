/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { ESPCDFNode } from "../entities/ESPCDFNode";
import {
  ESPCDFNodesByIDMap,
  ESPCDFNodeTransport,
  ESPCDFTransportConfig,
} from "../types";

/**
 * Re-applies `local` transport (from mDNS / local discovery) onto an incoming node list
 * when the API refresh only carries `cloud`. Keeps “Available on WLAN” until service-lost
 * or a new discovery update clears it.
 *
 * Use at sync boundaries before `nodeStore.setNodesList`, not inside the store.
 */
export function mergeLocalTransportFromNodeMap(
  incomingNodes: ESPCDFNode[],
  previousById: ESPCDFNodesByIDMap
): ESPCDFNode[] {
  const localKey = ESPCDFNodeTransport.LOCAL;
  return incomingNodes.map((node) => {
    const previous = previousById[node.id];
    const prevTransports = previous?.availableTransports as
      | Record<string, ESPCDFTransportConfig>
      | undefined;
    const prevLocal = prevTransports?.[localKey];
    const prevBaseUrl = prevLocal?.metadata?.baseUrl;
    if (
      !prevLocal ||
      prevBaseUrl == null ||
      String(prevBaseUrl).trim().length === 0
    ) {
      return node;
    }
    const merged = {
      ...node,
      availableTransports: {
        ...(node.availableTransports || {}),
        [localKey]: prevLocal,
      },
    } as unknown as ESPCDFNode;
    const raw = merged._raw as Record<string, unknown> | undefined;
    if (raw && typeof raw === "object") {
      const prevAt = raw.availableTransports as Record<string, unknown> | undefined;
      merged._raw = {
        ...raw,
        availableTransports: { ...(prevAt || {}), [localKey]: prevLocal },
      } as typeof merged._raw;
    }
    return merged;
  });
}
