/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { observable, action, extendObservable } from "mobx";
import {
  ESPSDKAdaptor,
  ESPCDFBatchOperationResult,
  ESPSDKAdaptorGroupsPaginationMap,
  ESPSDKAdaptorGroupsPaginationData,
  ESPCDFGroupsByIDMap,
  ESPCDFGroupSharingRequestsByIDMap,
  ESPSDKAdaptorGroupSharingRequestsPaginationMap,
  ESPCDFPaginatedAPIResponse,
} from "../types";
import {
  ERROR_MESSAGE_MAP,
  partitionBatchArrayResults,
  makeEverythingObservable,
} from "../utils/common";
import { NON_OBSERVABLE_ENTITY_KEYS } from "../utils/singleFlight";
import { ESPCDF } from "./index";
import { ESPCDFGroup } from "../entities/ESPCDFGroup";
import type { ESPCDFNode } from "../entities/ESPCDFNode";
import { ESPCDFGroupSharingRequest } from "../entities/ESPCDFGroupSharingRequest";
import { GroupStoreSynchronizer } from "./sync/GroupStoreSynchronizer";
import { findGroupById, getValidHomes } from "../utils/home";

/**
 * Group keys kept out of MobX: SDK bindings plus the listener registry. A deep-
 * observable `Set` wraps every function added to it in an `autoAction`, so
 * `delete(listener)` no longer matches and unsubscribe silently fails.
 */
const NON_OBSERVABLE_GROUP_KEYS: Set<string> = new Set([
  ...NON_OBSERVABLE_ENTITY_KEYS,
  "events",
]);

class GroupStore {
  #rootStore: ESPCDF;
  #synchronizer: GroupStoreSynchronizer;

  @observable accessor groupsByIDMap: ESPCDFGroupsByIDMap = {};
  @observable accessor currentHomeId: string | null = null;
  @observable accessor sdkAdaptorGroupsPaginationMap: ESPSDKAdaptorGroupsPaginationMap = {};

  // Group sharing request storage
  @observable accessor issuedGroupSharingRequestsByIDMap: ESPCDFGroupSharingRequestsByIDMap =
    {};
  @observable accessor receivedGroupSharingRequestsByIDMap: ESPCDFGroupSharingRequestsByIDMap =
    {};

  // Pagination context for group sharing requests
  @observable accessor sdkAdaptorIssuedGroupSharingRequestsPaginationMap: ESPSDKAdaptorGroupSharingRequestsPaginationMap =
    {};
  @observable accessor sdkAdaptorReceivedGroupSharingRequestsPaginationMap: ESPSDKAdaptorGroupSharingRequestsPaginationMap =
    {};

  /**
   * `true` once a full home sync has completed and nothing has marked the tree
   * stale since. While `true`, `user.syncHomeWithNodes()` serves the store.
   * Bookkeeping only, so deliberately not observable.
   */
  treeSynced = false;

  /** `snapshot` while the tree was restored from disk and no live sync has completed yet. */
  @observable accessor dataSource: "network" | "snapshot" = "network";

  #livePromise: Promise<void> | null = null;
  #resolveLive: (() => void) | null = null;

  [key: string]: any;

  constructor(rootStore: ESPCDF) {
    this.#rootStore = rootStore;
    this.#synchronizer = new GroupStoreSynchronizer(this, rootStore);
  }

  /** Records that a full home sync finished; releases snapshot waiters. */
  @action markTreeSynced(): void {
    this.treeSynced = true;
    this.dataSource = "network";
    this.#resolveLive?.();
    this.#resolveLive = null;
    this.#livePromise = null;
  }

  /** The tree was just restored from disk: not synced, waiters hold until a live sync. */
  @action markSnapshot(): void {
    this.treeSynced = false;
    this.dataSource = "snapshot";
    if (!this.#livePromise) {
      this.#livePromise = new Promise<void>((resolve) => {
        this.#resolveLive = resolve;
      });
    }
  }

  /** Resolves when live data has replaced a snapshot; immediately when the data is already live. */
  whenLive(timeoutMs: number): Promise<void> {
    if (this.dataSource !== "snapshot" || !this.#livePromise) {
      return Promise.resolve();
    }
    const pending = this.#livePromise;
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`No live sync within ${timeoutMs} ms`)),
        timeoutMs
      );
      pending.then(() => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  /** Marks the tree stale, so the next `syncHomeWithNodes()` fetches it. */
  invalidateTree(): void {
    this.treeSynced = false;
  }

  /** Releases this store's entity subscriptions. Called by `ESPCDF.dispose`. */
  dispose(): void {
    this.#synchronizer.dispose();
  }

  // Expose rootStore for synchronizer access
  get rootStore(): ESPCDF {
    return this.#rootStore;
  }

  get groupsList(): ESPCDFGroup[] {
    return Object.values(this.groupsByIDMap);
  }

  get _groupsByID(): Record<string, ESPCDFGroup> {
    return this.groupsByIDMap;
  }

  // Group sharing request computed getters
  get issuedGroupSharingRequestsList(): ESPCDFGroupSharingRequest[] {
    return Object.values(this.issuedGroupSharingRequestsByIDMap);
  }

  get receivedGroupSharingRequestsList(): ESPCDFGroupSharingRequest[] {
    return Object.values(this.receivedGroupSharingRequestsByIDMap);
  }

  get issuedGroupSharingRequests(): Record<
    string,
    ESPCDFGroupSharingRequest[]
  > {
    return this.#transformSharingRequest(this.issuedGroupSharingRequestsList);
  }

  get receivedGroupSharingRequests(): Record<
    string,
    ESPCDFGroupSharingRequest[]
  > {
    return this.#transformSharingRequest(this.receivedGroupSharingRequestsList);
  }

  /**
   * Transform sharing requests array into status-keyed object
   */
  #transformSharingRequest(
    requests: ESPCDFGroupSharingRequest[]
  ): Record<string, ESPCDFGroupSharingRequest[]> {
    return requests.reduce(
      (acc: Record<string, ESPCDFGroupSharingRequest[]>, request) => {
        const status = request.status;
        if (acc[status] === undefined) {
          acc[status] = [];
        }
        acc[status].push(request);
        return acc;
      },
      {}
    );
  }

  /**
   * Replaces the group tree with `groups` while keeping the instances the UI
   * already holds: groups (and sub-groups) with a known id are updated in place,
   * new ones are added, and ids missing from `groups` are removed and detached.
   */
  @action setGroupsList(groups: ESPCDFGroup[]) {
    const incomingIds = new Set(groups.map((group) => group.id));
    for (const existingId of Object.keys(this.groupsByIDMap)) {
      if (!incomingIds.has(existingId)) {
        this.#detachGroupTree(this.groupsByIDMap[existingId]);
        delete this.groupsByIDMap[existingId];
      }
    }
    for (const group of groups) {
      const existing = this.groupsByIDMap[group.id];
      if (existing) {
        this.#mergeGroup(existing, group);
      } else {
        this.groupsByIDMap[group.id] = this.#adoptNewGroup(group);
      }
    }
    this.#rootStore.markTreeChanged();
  }

  /** Makes a freshly transformed group observable and attaches it (recursively). */
  #adoptNewGroup(group: ESPCDFGroup): ESPCDFGroup {
    const observableGroup = makeEverythingObservable(
      group,
      NON_OBSERVABLE_GROUP_KEYS
    );
    this.#synchronizer.attach(observableGroup);
    return observableGroup;
  }

  /** Detaches a group and every nested sub-group from the synchronizer. */
  #detachGroupTree(group: ESPCDFGroup | undefined): void {
    if (!group) return;
    this.#synchronizer.detach(group.id);
    group.subGroups?.forEach((subGroup) => this.#detachGroupTree(subGroup));
  }

  /** Updates `existing` in place from `incoming`, merging nested lists by id. */
  #mergeGroup(existing: ESPCDFGroup, incoming: ESPCDFGroup): void {
    const observableIncoming = makeEverythingObservable(
      incoming,
      NON_OBSERVABLE_GROUP_KEYS
    );
    existing.adoptFrom(observableIncoming);
    existing.subGroups = this.#mergeGroupList(
      existing.subGroups,
      observableIncoming.subGroups ?? []
    );
    existing.nodeDetails = this.#resolveNodeDetails(existing, observableIncoming);
  }

  /** Merges a sub-group list by id, keeping existing instances and detaching removed ones. */
  #mergeGroupList(
    existingList: ESPCDFGroup[] | undefined,
    incomingList: ESPCDFGroup[]
  ): ESPCDFGroup[] {
    const existingById = new Map((existingList ?? []).map((group) => [group.id, group]));
    const merged = incomingList.map((incoming) => {
      const existing = existingById.get(incoming.id);
      if (!existing) {
        return this.#adoptNewGroup(incoming);
      }
      existingById.delete(incoming.id);
      this.#mergeGroup(existing, incoming);
      return existing;
    });
    existingById.forEach((removed) => this.#detachGroupTree(removed));
    return merged;
  }

  /**
   * Node details for a merged group: the adaptor's list when it sent one
   * (pointed at store instances where they exist), otherwise the details we
   * already had, trimmed to the current membership.
   */
  #resolveNodeDetails(existing: ESPCDFGroup, incoming: ESPCDFGroup): ESPCDFNode[] {
    const nodeStore = this.#rootStore.nodeStore;
    if (incoming.nodeDetails && incoming.nodeDetails.length > 0) {
      return incoming.nodeDetails.map(
        (node) => nodeStore.getNodeById(node.id) ?? node
      );
    }
    const memberIds = new Set(incoming.nodeIds ?? []);
    return (existing.nodeDetails ?? []).filter((node) => memberIds.has(node.id));
  }

  /**
   * Attaches fetched nodes to a group: upserts them into the node store, then
   * points the group's `nodeIds` / `nodeDetails` at the store instances. When the
   * group is a home, each room is filled from the same nodes by its `nodeIds`
   * (a room's nodes are always a subset of its home's), so one fetch per home
   * serves every room with no further calls.
   * @param groupId - Home or room the nodes were fetched for
   * @param nodes - Freshly transformed nodes from the adaptor
   */
  @action attachNodesToGroup(groupId: string, nodes: ESPCDFNode[]): void {
    const nodeStore = this.#rootStore.nodeStore;
    if (nodes.length > 0) {
      nodeStore.setNodesList(nodes);
    }
    const group = findGroupById(this.groupsList, groupId);
    if (!group) return;

    const stored = nodes.map((node) => nodeStore.getNodeById(node.id) ?? node);
    this.#addNodeDetails(group, stored);
    this.#rootStore.markTreeChanged();

    const storedById = new Map(stored.map((node) => [node.id, node]));
    for (const room of group.subGroups ?? []) {
      const members = (room.nodeIds ?? [])
        .map((id) => storedById.get(id))
        .filter((node): node is ESPCDFNode => Boolean(node));
      if (members.length > 0) {
        this.#addNodeDetails(room, members);
      }
    }
  }

  /**
   * Adds a newly created room (or other sub-group) under its parent. The room
   * is made observable and attached like any group from a sync, so later edits
   * on it re-render. A room already under the parent is merged in place.
   * @param parentId - Home (or group) the room was created in
   * @param subGroup - Freshly transformed room from the adaptor
   * @returns The store's instance of the room
   */
  @action addSubGroup(parentId: string, subGroup: ESPCDFGroup): ESPCDFGroup {
    const parent = findGroupById(this.groupsList, parentId);
    if (!parent) return subGroup;
    const existing = parent.subGroups?.find((child) => child.id === subGroup.id);
    if (existing) {
      this.#mergeGroup(existing, subGroup);
      this.#rootStore.markTreeChanged();
      return existing;
    }
    const adopted = this.#adoptNewGroup(subGroup);
    parent.subGroups = [...(parent.subGroups ?? []), adopted];
    this.#rootStore.markTreeChanged();
    return adopted;
  }

  /**
   * Applies plain field changes (name, description, custom data, ...) to a home
   * or a room in place. Rooms are not top-level entries, so they are found by
   * walking the tree.
   */
  @action patchGroup(groupId: string, update: Partial<ESPCDFGroup>): void {
    const target = findGroupById(this.groupsList, groupId);
    if (!target) return;
    Object.assign(target, update);
    this.#rootStore.markTreeChanged();
  }

  /** Adds `nodes` to a group's membership and details, keeping what was there. */
  #addNodeDetails(group: ESPCDFGroup, nodes: ESPCDFNode[]): void {
    const ids = new Set(group.nodeIds ?? []);
    const detailsById = new Map((group.nodeDetails ?? []).map((node) => [node.id, node]));
    for (const node of nodes) {
      ids.add(node.id);
      detailsById.set(node.id, node);
    }
    group.nodeIds = Array.from(ids);
    group.nodeDetails = Array.from(detailsById.values());
  }

  @action addGroup(group: ESPCDFGroup): ESPCDFGroup {
    const existing = this.groupsByIDMap[group.id];
    if (existing) {
      this.#mergeGroup(existing, group);
      this.#rootStore.markTreeChanged();
      return existing;
    }
    const observableGroup = this.#adoptNewGroup(group);
    this.groupsByIDMap[group.id] = observableGroup;
    this.#rootStore.markTreeChanged();
    return observableGroup;
  }

  @action updateGroup(groupId: string, update: Partial<ESPCDFGroup>) {
    if (this.groupsByIDMap[groupId]) {
      Object.assign(this.groupsByIDMap[groupId], update);
      this.#rootStore.markTreeChanged();
    }
  }

  /**
   * Replaces a group in the store (same {@link ESPCDFGroup.id}).
   * Used when Matter conversion returns a new {@link ESPCDFGroup} / fabric instance from the SDK.
   */
  @action replaceGroup(groupId: string, group: ESPCDFGroup): ESPCDFGroup {
    const observableGroup = makeEverythingObservable(
      group,
      NON_OBSERVABLE_GROUP_KEYS
    );

    if (this.groupsByIDMap[groupId]) {
      this.#synchronizer.detach(groupId);
    }

    this.#synchronizer.attach(observableGroup);
    this.groupsByIDMap[groupId] = observableGroup;

    for (const parent of Object.values(this.groupsByIDMap)) {
      if (!parent.subGroups?.length) {
        continue;
      }
      const index = parent.subGroups.findIndex((sg) => sg.id === groupId);
      if (index !== -1) {
        parent.subGroups[index] = observableGroup;
      }
    }

    this.#rootStore.markTreeChanged();
    return observableGroup;
  }

  @action deleteGroup(group: ESPCDFGroup) {
    const { id, parentId } = group;
    if (parentId) {
      const parentGroup = this.groupsByIDMap[parentId];
      if (parentGroup) {
        parentGroup.subGroups =
          parentGroup.subGroups?.filter((sg) => sg.id !== id) || [];
      }
    } else {
      // Detach from synchronizer before deleting
      this.#synchronizer.detach(id);
      delete this.groupsByIDMap[id];
    }
    this.#rootStore.markTreeChanged();
  }

  getGroupById(groupId: string): ESPCDFGroup | undefined {
    return this.groupsByIDMap[groupId];
  }

  /**
   * Removes a node from all groups' nodes arrays
   * Called when a node is deleted from nodeStore to maintain consistency
   * @param nodeId - The ID of the node to remove from groups
   */
  @action removeNodeFromAllGroups(nodeId: string): void {
    const removeNodeFromGroup = (group: ESPCDFGroup) => {
      // Remove from nodeDetails array
      if (group.nodeDetails && Array.isArray(group.nodeDetails)) {
        const index = group.nodeDetails.findIndex((node) => node.id === nodeId);
        if (index !== -1) {
          group.nodeDetails.splice(index, 1);
        }
      }
      // Remove from nodeIds array (used by Home screen for filtering)
      if (group.nodeIds && Array.isArray(group.nodeIds)) {
        const nodeIdIndex = group.nodeIds.indexOf(nodeId);
        if (nodeIdIndex !== -1) {
          group.nodeIds.splice(nodeIdIndex, 1);
        }
      }
      // Recursively remove from subGroups
      if (group.subGroups && Array.isArray(group.subGroups)) {
        group.subGroups.forEach((subGroup) => removeNodeFromGroup(subGroup));
      }
    };

    Object.values(this.groupsByIDMap).forEach((group) => {
      removeNodeFromGroup(group);
    });
    this.#rootStore.markTreeChanged();
  }

  @action clear() {
    // Detach all groups from synchronizer before clearing
    Object.keys(this.groupsByIDMap).forEach((groupId) => {
      this.#synchronizer.detach(groupId);
    });
    // Detach all group sharing requests from synchronizer before clearing
    Object.keys(this.issuedGroupSharingRequestsByIDMap).forEach((requestId) => {
      this.#synchronizer.detachGroupSharingRequest(requestId);
    });
    Object.keys(this.receivedGroupSharingRequestsByIDMap).forEach(
      (requestId) => {
        this.#synchronizer.detachGroupSharingRequest(requestId);
      }
    );
    this.groupsByIDMap = {};
    this.currentHomeId = null;
    this.treeSynced = false;
    this.dataSource = "network";
    this.#resolveLive?.();
    this.#resolveLive = null;
    this.#livePromise = null;
    this.issuedGroupSharingRequestsByIDMap = {};
    this.receivedGroupSharingRequestsByIDMap = {};
    this.sdkAdaptorGroupsPaginationMap = {};
    this.sdkAdaptorIssuedGroupSharingRequestsPaginationMap = {};
    this.sdkAdaptorReceivedGroupSharingRequestsPaginationMap = {};
    this.#rootStore.markTreeChanged();
  }

  /**
   * Sync groups from registered SDKs that match this store type.
   * This method fetches only the first page of groups from each registered SDK
   * and stores pagination context for on-demand loading of additional pages.
   */
  @action async syncGroupsList(): Promise<
    ESPCDFBatchOperationResult<ESPCDFGroup>
  > {
    const activeAdaptor =
      this.#rootStore?.sdkAdaptorRegistry.getActiveAdaptor();

    let groupFetchingSDKs: ESPSDKAdaptor[];
    groupFetchingSDKs = [activeAdaptor];

    const results = await Promise.allSettled(
      groupFetchingSDKs.map((sdk: ESPSDKAdaptor) =>
        this.fetchFirstPageGroupsFromSDK(sdk)
      )
    );

    const { successfulResults, failedResults } =
      partitionBatchArrayResults<ESPCDFGroup>(results);
    return {
      successfulResults,
      failedResults,
    };
  }

  /**
   * Helper method to fetch the first page of groups from a single SDK and store pagination context.
   * @param sdk - The SDK adapter to fetch groups from
   * @returns Promise resolving to an array of CDF groups
   */
  private async fetchFirstPageGroupsFromSDK(
    sdk: ESPSDKAdaptor
  ): Promise<ESPCDFGroup[]> {
    const authEntity =
      this.#rootStore.userStore.getAuthorizationEntityForAdaptor(
        sdk._identifier
      ) || null;
    const response = await authEntity?.getGroups?.();
    return response?.data || [];
  }

  /**
   * Action to set pagination context for a specific SDK.
   */
  @action setGroupsPaginationContextForSDKAdaptor(
    sdkIdentifier: string,
    context: ESPSDKAdaptorGroupsPaginationData
  ) {
    this.sdkAdaptorGroupsPaginationMap[sdkIdentifier] = context;
  }

  /**
   * Fetch next page of groups from a specific SDK.
   */
  @action async fetchNextPageGroupsForSDK(
    sdkIdentifier: string
  ): Promise<ESPCDFGroup[]> {
    const paginationState = this.sdkAdaptorGroupsPaginationMap[sdkIdentifier];

    if (!paginationState?.hasNext || !paginationState.fetchNext) {
      throw new Error(ERROR_MESSAGE_MAP.NO_MORE_GROUPS_TO_FETCH(sdkIdentifier));
    }

    const response = await paginationState.fetchNext();
    const newGroups = response?.data;

    // Add new groups to the store
    newGroups?.forEach((group: ESPCDFGroup) => this.addGroup(group));

    // Update pagination state
    this.setGroupsPaginationContextForSDKAdaptor(sdkIdentifier, {
      hasNext: response.pagination?.hasNext || false,
      fetchNext: response.pagination?.fetchNext,
    });
    return newGroups || [];
  }

  @action processGetGroupsRes(
    response: ESPCDFPaginatedAPIResponse<ESPCDFGroup[]>,
    sdkIdentifier: string
  ): void {
    this.setGroupsList(response.data || []);
    const paginationContext = {
      hasNext: response.pagination?.hasNext || false,
      fetchNext: response.pagination?.fetchNext || undefined,
    };
    this.setGroupsPaginationContextForSDKAdaptor(
      sdkIdentifier,
      paginationContext
    );
  }

  /**
   * Keeps only valid homes in the store (used after first page and each next page in home sync).
   */
  @action retainOnlyValidHomes(): void {
    const valid = getValidHomes(this.groupsList);
    this.setGroupsList(valid);
  }

  // Group sharing request management methods
  @action addIssuedGroupSharingRequest(
    request: ESPCDFGroupSharingRequest
  ): ESPCDFGroupSharingRequest {
    // Detach previous request from synchronizer if exists
    const previousRequest = this.issuedGroupSharingRequestsByIDMap[request.id];
    if (previousRequest) {
      this.#synchronizer.detachGroupSharingRequest(previousRequest.id);
    }

    // Set new request entity
    this.issuedGroupSharingRequestsByIDMap[request.id] = request;

    // Attach request to synchronizer for reactive updates
    this.#synchronizer.attachGroupSharingRequest(request, "issued");
    return request;
  }

  @action addReceivedGroupSharingRequest(
    request: ESPCDFGroupSharingRequest
  ): ESPCDFGroupSharingRequest {
    // Detach previous request from synchronizer if exists
    const previousRequest =
      this.receivedGroupSharingRequestsByIDMap[request.id];
    if (previousRequest) {
      this.#synchronizer.detachGroupSharingRequest(previousRequest.id);
    }

    // Set new request entity
    this.receivedGroupSharingRequestsByIDMap[request.id] = request;

    // Attach request to synchronizer for reactive updates
    this.#synchronizer.attachGroupSharingRequest(request, "received");
    return request;
  }

  @action setIssuedGroupSharingRequests(requests: ESPCDFGroupSharingRequest[]) {
    requests.forEach((request) => {
      if (request instanceof ESPCDFGroupSharingRequest) {
        this.addIssuedGroupSharingRequest(request);
      }
    });
  }

  @action setReceivedGroupSharingRequests(
    requests: ESPCDFGroupSharingRequest[]
  ) {
    requests.forEach((request) => {
      if (request instanceof ESPCDFGroupSharingRequest) {
        this.addReceivedGroupSharingRequest(request);
      }
    });
  }

  /**
   * Processes the issued group sharing request response from SDK
   * Transforms SDK response to entities and stores pagination context
   */
  @action processIssuedGroupSharingRequestsRes(
    response: ESPCDFPaginatedAPIResponse<ESPCDFGroupSharingRequest[]>,
    sdkIdentifier: string
  ): {
    sharedRequests: Record<string, ESPCDFGroupSharingRequest[]>;
    fetchNext: () => Promise<{
      sharedRequests: Record<string, ESPCDFGroupSharingRequest[]>;
    }>;
    hasNext: boolean;
  } {
    let {
      data: sharedRequests,
      pagination: { hasNext, fetchNext },
    } = response;

    // Transform array of requests to entities if needed
    // sharedRequests might be an array or already transformed
    const requestsArray: ESPCDFGroupSharingRequest[] = sharedRequests;

    // Set requests in store
    this.setIssuedGroupSharingRequests(requestsArray);

    // Store pagination context
    if (hasNext && fetchNext) {
      this.sdkAdaptorIssuedGroupSharingRequestsPaginationMap[sdkIdentifier] = {
        hasNext: true,
        fetchNext: () => fetchNext(),
      };
    } else {
      this.sdkAdaptorIssuedGroupSharingRequestsPaginationMap[sdkIdentifier] = {
        hasNext: false,
        fetchNext: undefined,
      };
    }

    return {
      sharedRequests: this.issuedGroupSharingRequests,
      fetchNext: this.fetchNextIssuedGroupSharingRequests.bind(
        this,
        sdkIdentifier
      ),
      hasNext:
        this.sdkAdaptorIssuedGroupSharingRequestsPaginationMap[sdkIdentifier]
          ?.hasNext || false,
    };
  }

  /**
   * Processes the received group sharing request response from SDK
   * Transforms SDK response to entities and stores pagination context
   */
  @action processReceivedGroupSharingRequestsRes(
    response: ESPCDFPaginatedAPIResponse<ESPCDFGroupSharingRequest[]>,
    sdkIdentifier: string
  ): {
    sharedRequests: Record<string, ESPCDFGroupSharingRequest[]>;
    fetchNext: () => Promise<{
      sharedRequests: Record<string, ESPCDFGroupSharingRequest[]>;
    }>;
    hasNext: boolean;
  } {
    let {
      data: sharedRequests,
      pagination: { hasNext, fetchNext },
    } = response;

    // Transform array of requests to entities if needed
    // sharedRequests might be an array or already transformed
    const requestsArray: ESPCDFGroupSharingRequest[] = sharedRequests;

    // Set requests in store
    this.setReceivedGroupSharingRequests(requestsArray);

    // Store pagination context
    if (hasNext && fetchNext) {
      this.sdkAdaptorReceivedGroupSharingRequestsPaginationMap[sdkIdentifier] =
      {
        hasNext: true,
        fetchNext: () => fetchNext(),
      };
    } else {
      this.sdkAdaptorReceivedGroupSharingRequestsPaginationMap[sdkIdentifier] =
      {
        hasNext: false,
        fetchNext: undefined,
      };
    }

    return {
      sharedRequests: this.receivedGroupSharingRequests,
      fetchNext: this.fetchNextReceivedGroupSharingRequests.bind(
        this,
        sdkIdentifier
      ),
      hasNext:
        this.sdkAdaptorReceivedGroupSharingRequestsPaginationMap[sdkIdentifier]
          ?.hasNext || false,
    };
  }

  /**
   * Fetch next page of issued group sharing requests from a specific SDK
   */
  @action async fetchNextIssuedGroupSharingRequests(
    sdkIdentifier: string
  ): Promise<{
    sharedRequests: Record<string, ESPCDFGroupSharingRequest[]>;
  }> {
    const paginationState =
      this.sdkAdaptorIssuedGroupSharingRequestsPaginationMap[sdkIdentifier];

    if (!paginationState?.hasNext || !paginationState.fetchNext) {
      throw new Error(
        `No more issued group sharing requests to fetch for SDK: ${sdkIdentifier}`
      );
    }

    const response = await paginationState.fetchNext();
    const newRequests =
      (response as any)?.sharedRequests || (response as any)?.data || [];

    // Transform and add new requests to the store
    const requestsArray: ESPCDFGroupSharingRequest[] = Array.isArray(
      newRequests
    )
      ? newRequests
      : Object.values(newRequests).flat();

    requestsArray.forEach((request: ESPCDFGroupSharingRequest) => {
      this.addIssuedGroupSharingRequest(request);
    });

    // Update pagination state
    this.sdkAdaptorIssuedGroupSharingRequestsPaginationMap[sdkIdentifier] = {
      hasNext:
        (response as any)?.hasNext ||
        (response as any)?.pagination?.hasNext ||
        false,
      fetchNext:
        (response as any)?.fetchNext ||
        (response as any)?.pagination?.fetchNext,
    };

    return {
      sharedRequests: this.issuedGroupSharingRequests,
    };
  }

  /**
   * Fetch next page of received group sharing requests from a specific SDK
   */
  @action async fetchNextReceivedGroupSharingRequests(
    sdkIdentifier: string
  ): Promise<{
    sharedRequests: Record<string, ESPCDFGroupSharingRequest[]>;
  }> {
    const paginationState =
      this.sdkAdaptorReceivedGroupSharingRequestsPaginationMap[sdkIdentifier];

    if (!paginationState?.hasNext || !paginationState.fetchNext) {
      throw new Error(
        `No more received group sharing requests to fetch for SDK: ${sdkIdentifier}`
      );
    }

    const response = await paginationState.fetchNext();
    const newRequests =
      (response as any)?.sharedRequests || (response as any)?.data || [];

    // Transform and add new requests to the store
    const requestsArray: ESPCDFGroupSharingRequest[] = Array.isArray(
      newRequests
    )
      ? newRequests
      : Object.values(newRequests).flat();

    requestsArray.forEach((request: ESPCDFGroupSharingRequest) => {
      this.addReceivedGroupSharingRequest(request);
    });

    // Update pagination state
    this.sdkAdaptorReceivedGroupSharingRequestsPaginationMap[sdkIdentifier] = {
      hasNext:
        (response as any)?.hasNext ||
        (response as any)?.pagination?.hasNext ||
        false,
      fetchNext:
        (response as any)?.fetchNext ||
        (response as any)?.pagination?.fetchNext,
    };

    return {
      sharedRequests: this.receivedGroupSharingRequests,
    };
  }

  /**
   * Dynamically adds an observable property to the store.
   * @param propertyName - The name of the property to add.
   * @param initialValue - The initial value of the property.
   */
  @action addProperty(propertyName: string, initialValue: any) {
    // Add the observable property
    extendObservable(this, { [propertyName]: initialValue });

    // Add the getter
    Object.defineProperty(this, `get${propertyName.toUpperCase()}`, {
      get: () => {
        return this[propertyName];
      },
      enumerable: true,
      configurable: true,
    });

    // Add the setter
    this[`set${propertyName.toUpperCase()}`] = action(function (
      this: GroupStore,
      value: any
    ) {
      this[propertyName] = value;
    });
  }
}

export default GroupStore;
