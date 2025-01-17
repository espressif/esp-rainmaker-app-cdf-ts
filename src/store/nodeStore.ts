/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { CDF } from "./index";
import { observable, action, computed, makeAutoObservable } from "mobx";
import {
  ESPRMNode,
  ESPRMDeviceInterface,
  ESPTransportMode,
  ESPTransportConfig,
  ESPNodeSharingRequest,
  ESPPaginatedNodesResponse,
} from "../types/index";
import {
  makeEverythingObservable,
  proxyActionHandler,
  createInterceptor,
  extendObservable,
  capitalize,
  deepMerge,
} from "../utils/common";
import * as constants from "../utils/constants";

class NodeStore {
  private readonly rootStore: CDF | null;

  #fetchNextRef: Function | null;
  #fetchNextIssuedSharingRequestRef: Function | null = null;
  #fetchNextReceivedSharingRequestRef: Function | null = null;

  #makeSharingRequestObservable = (
    sharingRequests: ESPNodeSharingRequest[],
    type: string
  ) => {
    return sharingRequests.map((sharingRequest) => {
      const observableSharingRequest = makeAutoObservable(sharingRequest);
      this.#interceptProxySharingRequest(observableSharingRequest, type);
      return observableSharingRequest;
    });
  };
  #transformSharingRequest = (sharingRequests: ESPNodeSharingRequest[]) => {
    return sharingRequests.reduce(
      (acc: { [key: string]: ESPNodeSharingRequest[] }, sharingRequest) => {
        if (acc[sharingRequest.status] === undefined) {
          acc[sharingRequest.status] = [];
        }
        acc[sharingRequest.status].push(sharingRequest);
        return acc;
      },
      {}
    );
  };
  #interceptProxy(node: ESPRMNode) {
    const deviceSetValueInterceptor = createInterceptor({
      action: (context, args) => {
        context.value = args[0];
      },
      rollback: (context, prevContext) => {
        context.value = prevContext.value;
      },
    });

    const deviceGetParamsInterceptor = createInterceptor({
      onSuccess: (result, args, context) => {
        context.params = result?.map((param: any) => {
          proxyActionHandler(param, "setValue", deviceSetValueInterceptor);
          return makeEverythingObservable(param);
        });
        return context.params;
      },
    });

    const getConnectivityStatusInterceptor = createInterceptor({
      onSuccess: (result, args, context) => {
        context.connectivityStatus = makeEverythingObservable(result);
        return context.connectivityStatus;
      },
    });

    const getNodeConfigInterceptor = createInterceptor({
      onSuccess: (result, args, context) => {
        context.nodeConfig = makeEverythingObservable(result);
        proxyActionHandler(
          context.nodeConfig,
          "devices.getParams",
          deviceGetParamsInterceptor
        );
        proxyActionHandler(
          context.nodeConfig,
          "devices.params.setValue",
          deviceSetValueInterceptor
        );
      },
    });

    const getServicesInterceptor = createInterceptor({
      onSuccess: (result, args, context) => {
        context.services = makeEverythingObservable(result);
        return context.services;
      },
    });

    const deleteInterceptor = createInterceptor({
      // action to be intercepted
      action: (context, args) => {
        const { id } = context;
        delete this.nodesByID[id];
      },
      // rollback action
      rollback: (context, prevContext) => {
        const { id } = prevContext;
        this.nodesByID[id] = prevContext;
      },
    });

    proxyActionHandler(
      node,
      "nodeConfig.devices.getParams",
      deviceGetParamsInterceptor
    );
    proxyActionHandler(
      node,
      "nodeConfig.devices.params.setValue",
      deviceSetValueInterceptor
    );
    proxyActionHandler(
      node,
      "getConnectivityStatus",
      getConnectivityStatusInterceptor
    );

    proxyActionHandler(node, "getNodeConfig", getNodeConfigInterceptor);
    proxyActionHandler(node, "getServices", getServicesInterceptor);
    proxyActionHandler(node, "delete", deleteInterceptor);
  }
  #interceptProxySharingRequest(
    sharingRequest: ESPNodeSharingRequest,
    type: string
  ) {
    const acceptInterceptor = createInterceptor({
      onSuccess: (result, args, context) => {
        context.status = "accepted";
        return context;
      },
    });
    const declineInterceptor = createInterceptor({
      onSuccess: (result, args, context) => {
        context.status = "declined";
        return context;
      },
    });
    const removeInterceptor = createInterceptor({
      onSuccess: (result, args, context) => {
        if (type === "received") {
          this._receivedSharingRequests = this._receivedSharingRequests.filter(
            (request) => request.id !== context.id
          );
        } else {
          this._issuedSharingRequests = this._issuedSharingRequests.filter(
            (request) => request.id !== context.id
          );
        }
        return context;
      },
    });

    proxyActionHandler(sharingRequest, "accept", acceptInterceptor);
    proxyActionHandler(sharingRequest, "decline", declineInterceptor);
    proxyActionHandler(sharingRequest, "remove", removeInterceptor);
  }
  // transport helpers
  #addAvailableTransport(nodeId: string, transportDetails: ESPTransportConfig) {
    const node: ESPRMNode = this.nodesByID[nodeId];
    (node.availableTransports as Record<ESPTransportMode, ESPTransportConfig>)[
      transportDetails.type
    ] = transportDetails;
  }
  #removeAvailableTransport(
    nodeId: string,
    transportDetails: ESPTransportConfig
  ) {
    const node: ESPRMNode = this.nodesByID[nodeId];
    delete (
      node.availableTransports as Record<ESPTransportMode, ESPTransportConfig>
    )[transportDetails.type];
  }

  [key: string]: any;

  // Observable properties
  @observable accessor _nodesByID: { [key: string]: ESPRMNode } = {};
  @observable accessor _issuedSharingRequests: ESPNodeSharingRequest[] = [];
  @observable accessor _receivedSharingRequests: ESPNodeSharingRequest[] = [];

  // pagination handler refs
  @observable accessor _hasNext: boolean = false;
  @observable accessor _hasNextIssuedSharingRequests: boolean = false;
  @observable accessor _hasNextReceivedSharingRequests: boolean = false;

  constructor(rootStore?: CDF) {
    this.rootStore = rootStore || null;
    this.#fetchNextRef = null;
  }

  // Getters and Setters
  public get nodesByID(): { [key: string]: ESPRMNode } {
    return this._nodesByID;
  }
  public set nodesByID(value: { [key: string]: ESPRMNode }) {
    this._nodesByID = value;
  }
  public get hasNext(): boolean {
    return this._hasNext;
  }
  public get hasNextIssuedSharingRequests(): Boolean {
    return this._hasNextIssuedSharingRequests;
  }
  public get hasNextReceivedSharingRequests(): Boolean {
    return this._hasNextReceivedSharingRequests;
  }

  // Issued sharing requests
  public set issuedSharingRequests(value: ESPNodeSharingRequest[]) {
    this._issuedSharingRequests = this.#makeSharingRequestObservable(
      value,
      "issued"
    );
  }
  public get issuedSharingRequests(): {
    [key: string]: ESPNodeSharingRequest[];
  } {
    return this.#transformSharingRequest(this._issuedSharingRequests);
  }

  // Received sharing requests
  public set receivedSharingRequests(value: ESPNodeSharingRequest[]) {
    this._receivedSharingRequests = this.#makeSharingRequestObservable(
      value,
      "received"
    );
  }
  public get receivedSharingRequests(): {
    [key: string]: ESPNodeSharingRequest[];
  } {
    return this.#transformSharingRequest(this._receivedSharingRequests);
  }

  // Computed properties
  /**
   * Gets the list of all nodes.
   * @returns {ESPRMNode[]} The list of nodes.
   *
   * GPT Context: This getter retrieves all nodes in the store as an array.
   */
  @computed get nodeList(): ESPRMNode[] {
    return Object.values(this.nodesByID);
  }

  // Hooks
  beforeSetNodeListHook: (nodes: ESPRMNode[]) => void = () => {};
  afterSetNodeListHook: (nodes: ESPRMNode[]) => void = () => {};

  // Action and helper functions

  /**
   * Sets the node list and makes each node observable.
   * @param {ESPRMNode[]} nodeList - The list of nodes to set.
   *
   * GPT Context: This function initializes or updates the node list in the store, making each node observable for tracking changes.
   */
  @action setNodeList(nodeList: ESPRMNode[]) {
    this.nodesByID = nodeList.reduce(
      (acc, node) => {
        const observableNode = makeEverythingObservable(node);
        this.#interceptProxy(observableNode);
        acc[node.id] = observableNode;

        return acc;
      },
      {} as { [key: string]: ESPRMNode }
    );
  }

  /**
   * Adds a new node to the store and makes it observable.
   * @param {ESPRMNode} node - The node to add.
   * @returns {ESPRMNode} The observable node that was added.
   *
   * GPT Context: This action adds a new node to the store, making it observable for tracking changes. It also intercepts the node to handle specific actions or errors.
   */
  @action addNode(node: ESPRMNode) {
    const observableNode = makeEverythingObservable(node);
    this.#interceptProxy(observableNode);
    this._nodesByID[node.id] = observableNode;
    return observableNode;
  }

  @action updateNode(nodeId: string, update: any) {
    const node = this.nodesByID[nodeId];
    deepMerge(node, update);
  }

  /**
   * Sets the node by ID.
   * @param {{ [key: string]: ESPRMNode }} nodesByID - The node by ID.
   *
   * GPT Context: This setter updates the node mapped by their IDs in the store.
   */
  @action setNodeByID(id: string, node: ESPRMNode): void {
    this.nodesByID[id] = node;
  }

  /**
   * Updates the transport order for a specific node by its ID.
   * @param {string} nodeId - The ID of the node to update.
   * @param {ESPTransportMode} transport - The transport mode to add to the front of the transport order.
   *
   * GPT Context: This method updates the transport order for a specific node by moving the specified transport mode to the front of the transport order. It ensures the transport mode is valid and not already at the front.
   */
  @action updateTransportByID(nodeId: string, order: ESPTransportMode[]): void {
    const node: ESPRMNode = this.nodesByID[nodeId];
    node.transportOrder = order;
  }

  /**
   * Expands the details of nodes based on the provided node IDs.
   * @param {string[]} nodeIds - An array of node IDs to be expanded.
   * @returns {ESPRMNode[]} The list of nodes corresponding to the provided IDs.
   *
   * GPT Context: This action method takes an array of node IDs and retrieves the corresponding node details from the `nodesByID` collection, returning a list of nodes. If a node ID doesn't exist, it returns an empty object in its place.
   */
  @action expand(nodeIds: string[]): ESPRMNode[] {
    return nodeIds.map((nodeId) => this.nodesByID[nodeId] || []);
  }

  /**
   * Adds an available transport to a node.
   * @param {string} nodeId - The ID of the node.
   * @param {ESPTransportConfig} transportDetails - The details of the transport.
   *
   * GPT Context: This action adds an available transport to a node, allowing the node to communicate using the specified transport.
   */
  @action updateNodeTransport(
    nodeId: string,
    transportDetails: ESPTransportConfig,
    operation: "add" | "remove" = "add"
  ): void {
    switch (operation) {
      case "add":
        this.#addAvailableTransport(nodeId, transportDetails);
        break;
      case "remove":
        this.#removeAvailableTransport(nodeId, transportDetails);
        break;
    }
  }

  /**
   * Sets the node list with pre- and post-processing hooks.
   * @param {ESPRMNode[]} nodeList - The list of nodes to set.
   *
   * GPT Context: This function allows developers to inject custom logic before and after setting the node list.
   */
  @action setNodeListWithHooks(nodeList: ESPRMNode[]) {
    this.beforeSetNodeListHook(nodeList);
    this.setNodeList(nodeList);
    this.afterSetNodeListHook(nodeList);
  }

  /**
   * Updates multiple nodes' properties.
   * @param {Partial<ESPRMNode>[]} updates - An array of partial updates for the nodes.
   *
   * GPT Context: This function allows bulk updates to multiple nodes, merging the provided updates with the existing node data.
   */
  @action updateMultipleNodes(updates: Partial<ESPRMNode>[]) {
    updates.forEach((update) => {
      if (update.id && this.nodesByID[update.id]) {
        Object.assign(this.nodesByID[update.id], update);
      }
    });
  }

  /**
   * Deletes nodes by their IDs.
   * @param {string[]} ids - The IDs of the nodes to delete.
   *
   * GPT Context: This function removes multiple nodes from the store based on their IDs, useful for batch deletions.
   */
  @action async deleteNodes(ids: string[]) {
    ids.forEach((id) => delete this.nodesByID[id]);
  }

  /**
   * Resets all properties of the store to their initial state.
   *
   * GPT Context: This function clears all data from the store, resetting all properties to their default values.
   */
  @action clear() {
    this.nodesByID = {};
    this.beforesetNodeListHook = () => {};
    this.aftersetNodeListHook = () => {};
  }

  // Pagination handlers

  /**
   * Fetches the next set of groups from the cloud.
   *
   * This method fetches the next set of groups from the cloud using the `#fetchNextRef` function,
   * which is set when the group list is synchronized.
   *
   * @async
   * @returns {Promise<void>} A promise that resolves when the next set of groups has been fetched.
   * @throws {Error} An error is thrown if there are no more groups to fetch.
   */
  @action async fetchNext() {
    if (this.hasNext && this.#fetchNextRef) {
      let response = await this.#fetchNextRef();
      return this.processNodeDetailsRes(response);
    } else {
      throw new Error(constants.NO_MORE_NODES_TO_FETCH_ERR);
    }
  }

  /**
   * Fetches the next set of issued sharing requests from the cloud.
   *
   * This method fetches the next set of issued sharing requests from the cloud using the `#fetchNextIssuedSharingRequestRef` function,
   * which is set when the issued sharing request list is synchronized.
   *
   * @async
   * @returns {Promise<void>} A promise that resolves when the next set of issued sharing requests has been fetched.
   * @throws {Error} An error is thrown if there are no more issued sharing requests to fetch.
   */
  @action async fetchNextIssuedSharingRequest() {
    if (
      this._hasNextIssuedSharingRequests &&
      this.#fetchNextIssuedSharingRequestRef
    ) {
      let response = await this.#fetchNextIssuedSharingRequestRef();
      return this.processIssuedSharingRequestRes(response);
    } else {
      throw new Error(constants.NO_MORE_SHARING_REQUESTS_TO_FETCH_ERR);
    }
  }

  /**
   * Fetches the next set of received sharing requests from the cloud.
   *
   * This method fetches the next set of received sharing requests from the cloud using the `#fetchNextReceivedSharingRequestRef` function,
   * which is set when the received sharing request list is synchronized.
   *
   * @async
   * @returns {Promise<void>} A promise that resolves when the next set of received sharing requests has been fetched.
   * @throws {Error} An error is thrown if there are no more received sharing requests to fetch.
   */
  @action async fetchNextReceivedSharingRequest() {
    if (
      this._hasNextReceivedSharingRequests &&
      this.#fetchNextReceivedSharingRequestRef
    ) {
      let response = await this.#fetchNextReceivedSharingRequestRef();
      return this.processReceivedSharingRequestRes(response);
    } else {
      throw new Error(constants.NO_MORE_SHARING_REQUESTS_TO_FETCH_ERR);
    }
  }

  // Cloud responses processors

  /**
   * Processes the node details response from the cloud.
   *
   * This function processes the node details response from the cloud, makes the nodes observable,
   * and updates the store with the latest data. It also handles pagination by setting the fetchNext
   * reference and hasNext flag.
   *
   * @param {any} ESPPaginatedNodesResponse - The response from the cloud containing node details.
   * @returns {any} An object containing the observable nodes, fetchNext function, and hasNext flag.
   */
  processNodeDetailsRes(response: any): ESPPaginatedNodesResponse {
    let { nodes, fetchNext, hasNext } = response;
    const observableNodes = nodes.map((node: ESPRMNode) => this.addNode(node));
    if (hasNext) {
      this.#fetchNextRef = fetchNext;
    }
    this._hasNext = hasNext;
    return {
      nodes: observableNodes,
      fetchNext: this.fetchNext.bind(this),
      hasNext: this.hasNext,
    };
  }

  /**
   * Processes the issued sharing request response from the cloud.
   *
   * This function processes the issued sharing request response from the cloud, makes the requests observable,
   * and updates the store with the latest data. It also handles pagination by setting the fetchNext
   * reference and hasNext flag.
   *
   * @param {any} response - The response from the cloud containing issued sharing requests.
   * @returns {any} An object containing the observable issued sharing requests, fetchNext function, and hasNext flag.
   */
  processIssuedSharingRequestRes(response: any): {
    sharedRequests: { [key: string]: ESPNodeSharingRequest[] };
    fetchNext: () => Promise<{
      sharedRequests: { [key: string]: ESPNodeSharingRequest[] };
    }>;
    hasNext: boolean;
  } {
    let { sharedRequests, fetchNext, hasNext } = response;
    this.issuedSharingRequests = sharedRequests;
    if (hasNext) {
      this.#fetchNextIssuedSharingRequestRef = fetchNext;
    }
    this._hasNextIssuedSharingRequests = hasNext;
    return {
      sharedRequests: this.issuedSharingRequests,
      fetchNext: this.fetchNextIssuedSharingRequest.bind(this),
      hasNext: this._hasNextIssuedSharingRequests,
    };
  }

  /**
   * Processes the received sharing request response from the cloud.
   *
   * This function processes the received sharing request response from the cloud, makes the requests observable,
   * and updates the store with the latest data. It also handles pagination by setting the fetchNext
   * reference and hasNext flag.
   *
   * @param {any} response - The response from the cloud containing received sharing requests.
   * @returns {any} An object containing the observable received sharing requests, fetchNext function, and hasNext flag.
   */
  processReceivedSharingRequestRes(response: any): {
    sharedRequests: { [key: string]: ESPNodeSharingRequest[] };
    fetchNext: () => Promise<{
      sharedRequests: { [key: string]: ESPNodeSharingRequest[] };
    }>;
    hasNext: boolean;
  } {
    let { sharedRequests, fetchNext, hasNext } = response;
    this.receivedSharingRequests = sharedRequests;
    if (hasNext) {
      this.#fetchNextReceivedSharingRequestRef = fetchNext;
    }
    this._hasNextReceivedSharingRequests = hasNext;
    return {
      sharedRequests: this.receivedSharingRequests,
      fetchNext: this.fetchNextReceivedSharingRequest.bind(this),
      hasNext: this._hasNextReceivedSharingRequests,
    };
  }

  /**
   * Fetches the list of nodes from the cloud and sets the node list.
   *
   * GPT Context: This function fetches the list of nodes from the cloud and updates the store with the latest data.
   */
  syncNodeList = async () => {
    let response = await this.rootStore?.userStore.user?.getUserNodes();
    this.processNodeDetailsRes(response);
  };

  // Store customizations helpers

  /**
   * Dynamically adds an observable property to the store.
   * @param {string} propertyName - The name of the property to add.
   * @param {any} initialValue - The initial value of the property.
   *
   * GPT Context: This function allows adding a new observable property to the store dynamically, along with its getter and setter.
   */
  @action addProperty(propertyName: string, initialValue: any) {
    // Add the observable property
    extendObservable(this, { [propertyName]: initialValue });

    // Add the getter
    Object.defineProperty(this, `get${capitalize(propertyName)}`, {
      get: function () {
        return this[propertyName];
      },
      enumerable: true,
      configurable: true,
    });

    // Add the setter
    this[`set${capitalize(propertyName)}`] = action(function (
      this: NodeStore,
      value: any
    ) {
      this[propertyName] = value;
    });
  }
}

export default NodeStore;
