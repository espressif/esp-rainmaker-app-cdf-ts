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
import { ESPCDF } from "./index";
import { ESPCDFGroup } from "../entities/ESPCDFGroup";
import { ESPCDFGroupSharingRequest } from "../entities/ESPCDFGroupSharingRequest";
import { GroupStoreSynchronizer } from "./sync/GroupStoreSynchronizer";
import { getValidHomes } from "../utils/home";

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

  [key: string]: any;

  constructor(rootStore: ESPCDF) {
    this.#rootStore = rootStore;
    this.#synchronizer = new GroupStoreSynchronizer(this, rootStore);
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

  @action setGroupsList(groups: ESPCDFGroup[]) {
    this.groupsByIDMap = groups.reduce(
      (acc, group) => {
        // Make group and all nested properties observable recursively
        // Exclude '_raw' and 'operations' as they are SDK-specific and don't need reactivity
        const observableGroup = makeEverythingObservable(
          group,
          new Set(["_raw", "operations"])
        );
        // Attach group to synchronizer for reactive updates
        this.#synchronizer.attach(observableGroup);
        acc[group.id] = observableGroup;
        return acc;
      },
      {} as { [key: string]: ESPCDFGroup }
    );
  }

  @action addGroup(group: ESPCDFGroup): ESPCDFGroup {
    // Make group and all nested properties observable recursively
    // Exclude '_raw' and 'operations' as they are SDK-specific and don't need reactivity
    const observableGroup = makeEverythingObservable(
      group,
      new Set(["_raw", "operations"])
    );
    // Attach group to synchronizer for reactive updates
    this.#synchronizer.attach(observableGroup);
    this.groupsByIDMap[group.id] = observableGroup;
    return observableGroup;
  }

  @action updateGroup(groupId: string, update: Partial<ESPCDFGroup>) {
    if (this.groupsByIDMap[groupId]) {
      Object.assign(this.groupsByIDMap[groupId], update);
    }
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
    this.issuedGroupSharingRequestsByIDMap = {};
    this.receivedGroupSharingRequestsByIDMap = {};
    this.sdkAdaptorGroupsPaginationMap = {};
    this.sdkAdaptorIssuedGroupSharingRequestsPaginationMap = {};
    this.sdkAdaptorReceivedGroupSharingRequestsPaginationMap = {};
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
