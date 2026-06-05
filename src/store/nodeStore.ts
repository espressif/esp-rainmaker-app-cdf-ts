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

class NodeStore {
  #rootStore: ESPCDF;
  #synchronizer: NodeStoreSynchronizer;
  [key: string]: any;
  @observable accessor _nodesByIDMap: ESPCDFNodesByIDMap = {};

  constructor(rootStore: ESPCDF) {
    this.#rootStore = rootStore;
    this.#synchronizer = new NodeStoreSynchronizer(this);
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
  @action setNodesList(nodesList: ESPCDFNode[]) {
    const registered =
      this.#rootStore.subscriptionStore.getRegisteredTransportsSnapshot();

    this.nodesByIDMap = nodesList.reduce((acc, node) => {
      const mergedNode = applyRegisteredTransports(node, registered);

      const observableNode = makeEverythingObservable(
        mergedNode,
        new Set(["_raw", "operations"])
      );

      this.#synchronizer.attach(observableNode);

      acc[node.id] = observableNode;
      return acc;
    }, this.nodesByIDMap as ESPCDFNodesByIDMap);
  }

  @action addNode(node: ESPCDFNode): ESPCDFNode {
    const registered =
      this.#rootStore.subscriptionStore.getRegisteredTransportsSnapshot();
    const mergedNode = applyRegisteredTransports(node, registered);

    const observableNode = makeEverythingObservable(
      mergedNode,
      new Set(["_raw", "operations"])
    );

    this.#synchronizer.attach(observableNode);

    this.nodesByIDMap[node.id] = observableNode as ESPCDFNode;
    return observableNode;
  }

  @action updateNode(nodeId: string, update: Partial<ESPCDFNode>) {
    if (!this.getNodeById(nodeId)) {
      throw new Error(ERROR_MESSAGE_MAP.NODE_NOT_FOUND(nodeId));
    }
    Object.assign(this.nodesByIDMap[nodeId], update) as ESPCDFNode;
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
  }
}

export default NodeStore;
