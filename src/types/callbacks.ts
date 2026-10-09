/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ESPCDFGroup } from "../entities/ESPCDFGroup";
import type { ESPCDFNode } from "../entities/ESPCDFNode";

export interface GroupStoreCallbacks {
  setGroupsList(groups: ESPCDFGroup[]): void;
  setCurrentHomeId(id: string | null): void;
  /** Add a single group to the store (e.g. after createHome) */
  addGroup(group: ESPCDFGroup): void;
  /** Add nodes to a group; CDF updates group.nodeDetails and nodeStore */
  addNodesToGroup(groupId: string, nodes: ESPCDFNode[]): void;
  /** Handle node update events */
  onNodeUpdate?: (update: Record<string, any>) => void;
  /** `true` while the home tree in the store is synced and nothing has marked it stale. */
  isTreeSynced?: () => boolean;
  /** Records that a full home sync finished. */
  markTreeSynced?: () => void;
  /** The currently selected home, if any. */
  getCurrentHome?: () => ESPCDFGroup | null;
  /** A node already held by the store, if any. */
  getNodeById?: (nodeId: string) => ESPCDFNode | undefined;
  /** Saves the home tree to disk after a successful full sync (fire-and-forget). */
  persistSnapshot?: () => void;
}
