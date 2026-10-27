/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { observable, action, computed } from "mobx";
import { makeEverythingObservable } from "../utils/common";
import { ESPCDF } from "./index";
import { ESPCDFNodesByIDMap } from "../types/store/node";
import { ERROR_MESSAGE_MAP } from "../utils/common";
import { ESPCDFNode } from "../entities/ESPCDFNode";
import { NodeStoreSynchronizer } from "./sync/NodeStoreSynchronizer";
import { applyRegisteredTransports } from "../utils/registeredTransports";
import { NON_OBSERVABLE_ENTITY_KEYS } from "../utils/singleFlight";
import type { RegisteredTransportsByNodeId } from "../types";

/**
 * Node keys kept out of MobX: SDK bindings plus the listener registries. A deep-
 * observable `Set` wraps every function added to it in an `autoAction`, so
 * `delete(listener)` no longer matches and unsubscribe silently fails.
 */
const NON_OBSERVABLE_NODE_KEYS: Set<string> = new Set([
  ...NON_OBSERVABLE_ENTITY_KEYS,
  "events",
  "propertyChangeEmitter",
]);

class NodeStore {
  #rootStore: ESPCDF;
  #synchronizer: NodeStoreSynchronizer;
  [key: string]: any;
  @observable accessor _nodesByIDMap: ESPCDFNodesByIDMap = {};

  constructor(rootStore: ESPCDF) {
    this.#rootStore = rootStore;
    this.#synchronizer = new NodeStoreSynchronizer(this, () =>
      rootStore.markTreeChanged()
    );
  }

  /** Releases this store's entity subscriptions. Called by `ESPCDF.dispose`. */
  dispose(): void {
    this.#synchronizer.dispose();
  }

  /**
   * Public getter for nodesByIDMap
   * Following the pattern from existing-app-cdf to avoid MobX deep conversion issues
   */
  public get nodesByIDMap(): ESPCDFNodesByIDMap {
    return this._nodesByIDMap;
  }

  /**
   * Public setter for nodesByIDMap
   * Direct assignment bypasses MobX's accessor deep conversion
   */
  public set nodesByIDMap(value: ESPCDFNodesByIDMap) {
    this._nodesByIDMap = value;
  }

  /**
   * Get the list of nodes from the store
   * @returns The list of nodes
   */
  @computed get nodesList(): ESPCDFNode[] {
    return Object.values(this.nodesByIDMap);
  }

  /**
   * Set the list of nodes in the store.
   * @param nodesList - The list of nodes to set
   */
  /**
   * Upserts nodes from a network response. A node whose id is already in the
   * store is updated in place (same instance), so lists and group references
   * stay valid; new ids are added. Nothing is removed.
   */
  @action setNodesList(nodesList: ESPCDFNode[]) {
    const registered =
      this.#rootStore.subscriptionStore.getRegisteredTransportsSnapshot();
    for (const node of nodesList) {
      this.#upsertNode(node, registered);
    }
    this.#rootStore.markTreeChanged();
  }

  @action addNode(node: ESPCDFNode): ESPCDFNode {
    const registered =
      this.#rootStore.subscriptionStore.getRegisteredTransportsSnapshot();
    const stored = this.#upsertNode(node, registered);
    this.#rootStore.markTreeChanged();
    return stored;
  }

  #upsertNode(
    node: ESPCDFNode,
    registered: RegisteredTransportsByNodeId
  ): ESPCDFNode {
    const mergedNode = applyRegisteredTransports(node, registered);
    const observableNode = makeEverythingObservable(
      mergedNode,
      NON_OBSERVABLE_NODE_KEYS
    );
    const existing = this.nodesByIDMap[node.id];

    if (!existing) {
      this.#synchronizer.attach(observableNode);
      this.nodesByIDMap[node.id] = observableNode;
      return observableNode;
    }

    // Detach while the old devices/services are still reachable, then re-attach the new ones.
    this.#synchronizer.detach(existing.id);
    existing.adoptFrom(observableNode);
    this.#synchronizer.attach(existing);
    return existing;
  }

  @action updateNode(nodeId: string, update: Partial<ESPCDFNode>) {
    if (!this.getNodeById(nodeId)) {
      throw new Error(ERROR_MESSAGE_MAP.NODE_NOT_FOUND(nodeId));
    }
    Object.assign(this.nodesByIDMap[nodeId], update) as ESPCDFNode;
    this.#rootStore.markTreeChanged();
  }

  @action deleteNode(nodeId: string) {
    if (!this.getNodeById(nodeId)) {
      throw new Error(ERROR_MESSAGE_MAP.NODE_NOT_FOUND(nodeId));
    }
    // Detach node from synchronizer before deleting
    this.#synchronizer.detach(nodeId);
    this.#rootStore.subscriptionStore.clearTransportsForNode(nodeId);
    delete this.nodesByIDMap[nodeId];
    // Remove node from all groups to maintain consistency
    // Groups store references to nodes, so we need to clean them up when a node is deleted
    this.#rootStore.groupStore.removeNodeFromAllGroups(nodeId);
    this.#rootStore.markTreeChanged();
  }

  getNodeById(nodeId: string): ESPCDFNode | undefined {
    return this.nodesByIDMap[nodeId];
  }

  @action clear() {
    // Detach all nodes from synchronizer before clearing
    Object.keys(this.nodesByIDMap).forEach((nodeId) => {
      this.#synchronizer.detach(nodeId);
    });
    this.#rootStore.subscriptionStore.clearRegisteredTransports();
    this.nodesByIDMap = {};
    this.#rootStore.markTreeChanged();
  }
}

export default NodeStore;
