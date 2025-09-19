/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */
import { CDF } from "./index";
import { observable, action, computed, makeAutoObservable } from "mobx";
import {
  ESPRMGroup,
  ESPGroupSharingRequest,
  ESPPaginatedGroupsResponse,
} from "../types/index";
import {
  makeEverythingObservable,
  proxyActionHandler,
  createInterceptor,
  extendObservable,
  capitalize,
} from "../utils/common";
import * as constants from "../utils/constants";

class GroupStore {
  private readonly rootStore: CDF | null;

  #fetchNextRef: Function | null = null;
  #fetchNextIssuedSharingRequestRef: Function | null = null;
  #fetchNextReceivedSharingRequestRef: Function | null = null;

  #makeSharingRequestObservable = (
    sharingRequests: ESPGroupSharingRequest[],
    type: string
  ) => {
    return sharingRequests.map((sharingRequest) => {
      const observableSharingRequest = makeAutoObservable(sharingRequest);
      this.#interceptProxySharingRequest(observableSharingRequest, type);
      return observableSharingRequest;
    });
  };
  #transformSharingRequest = (sharingRequests: ESPGroupSharingRequest[]) => {
    return sharingRequests.reduce(
      (acc: { [key: string]: ESPGroupSharingRequest[] }, sharingRequest) => {
        if (acc[sharingRequest.status] === undefined) {
          acc[sharingRequest.status] = [];
        }
        acc[sharingRequest.status].push(sharingRequest);
        return acc;
      },
      {}
    );
  };
  #interceptProxy(group: ESPRMGroup) {
    const addNodeInterceptor = createInterceptor({
      action: (context, args) => {
        context.nodes = [...(context?.nodes || []), ...args[0]];
      },
      rollback: (context, prevContext) => {
        context.nodes = prevContext.nodes;
      },
    });

    const removeNodeInterceptor = createInterceptor({
      action: (context, args) => {
        context.nodes = context.nodes.filter(
          (id: string) => !args[0].includes(id)
        );
      },
      rollback: (context, prevContext) => {
        context.nodes = prevContext.nodes;
      },
    });

    const updateGroupInfoInterceptor = createInterceptor({
      action: (context, args) => {
        const groupInfo = args[0];
        context.name = groupInfo?.groupName || context.name;
        context.description = groupInfo?.description || context.description;
        context.customData = groupInfo?.customData || context.customData;
        context.metadata = groupInfo?.groupMetaData || context.metadata;
        context.mutuallyExclusive =
          groupInfo?.mutuallyExclusive || context.mutuallyExclusive;
        context.type = groupInfo?.type || context.type;
      },
      rollback: (context, prevContext) => {
        context.name = prevContext?.name;
        context.description = prevContext?.description;
        context.customData = prevContext?.customData;
        context.metadata = prevContext?.metadata;
        context.mutuallyExclusive = prevContext?.mutuallyExclusive;
        context.type = prevContext?.type;
      },
    });

    const deleteGroupInterceptor = createInterceptor({
      action: (context, args) => {
        const { id, parentGroupId } = context;
        if (parentGroupId) {
          const parentGroup = this.groupsByID[parentGroupId];
          if (parentGroup) {
            const index = parentGroup?.subGroups?.findIndex(
              (group: ESPRMGroup) => group.id === id
            );
            if (index !== undefined && index !== -1) {
              parentGroup.subGroups?.splice(index, 1);
            }
          }
        } else delete this.groupsByID[id];
      },
      rollback: (context, prevContext) => {
        const { id } = prevContext;
        this.groupsByID[id] = prevContext;
      },
    });

    const getSubGroupsInterceptor = createInterceptor({
      onSuccess: (result, args, context) => {
        context.subGroups = result.map((group: ESPRMGroup) => {
          const observableGroup = makeEverythingObservable(group);
          this.#interceptProxy(observableGroup);
          return observableGroup;
        });
        return context.subGroups;
      },
    });

    const createSubGroupInterceptor = createInterceptor({
      onSuccess: (result, args, context) => {
        const observableGroup = makeEverythingObservable(result);
        this.#interceptProxy(observableGroup);
        context.subGroups !== undefined
          ? context.subGroups.push(observableGroup)
          : (context.subGroups = [observableGroup]);
        return observableGroup;
      },
    });

    proxyActionHandler(group, "addNodes", addNodeInterceptor);
    proxyActionHandler(group, "removeNodes", removeNodeInterceptor);
    proxyActionHandler(group, "updateGroupInfo", updateGroupInfoInterceptor);
    proxyActionHandler(group, "delete", deleteGroupInterceptor);
    proxyActionHandler(group, "leave", deleteGroupInterceptor);
    proxyActionHandler(group, "getSubGroups", getSubGroupsInterceptor);
    proxyActionHandler(group, "createSubGroup", createSubGroupInterceptor);

    if (group.subGroups) {
      group.subGroups = group.subGroups.map((subGroup: ESPRMGroup) => {
        const observableGroup = makeEverythingObservable(subGroup);
        this.#interceptProxy(observableGroup);
        return observableGroup;
      });
    }
  }
  #interceptProxySharingRequest(
    sharingRequest: ESPGroupSharingRequest,
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

  [key: string]: any;

  // Observable properties
  @observable accessor _groupsByID: { [key: string]: ESPRMGroup } = {};
  @observable accessor _issuedSharingRequests: ESPGroupSharingRequest[] = [];
  @observable accessor _receivedSharingRequests: ESPGroupSharingRequest[] = [];

  // pagination handler refs
  @observable accessor _hasNext: boolean = false;
  @observable accessor _hasNextIssuedSharingRequests: boolean = false;
  @observable accessor _hasNextReceivedSharingRequests: boolean = false;

  constructor(rootStore?: CDF) {
    this.rootStore = rootStore || null;
  }

  // Getter and setter
  public get groupsByID(): { [key: string]: ESPRMGroup } {
    return this._groupsByID;
  }
  public set groupsByID(value: { [key: string]: ESPRMGroup }) {
    this._groupsByID = value;
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
  public set issuedSharingRequests(value: ESPGroupSharingRequest[]) {
    this._issuedSharingRequests = this.#makeSharingRequestObservable(
      value,
      "issued"
    );
  }
  public get issuedSharingRequests(): {
    [key: string]: ESPGroupSharingRequest[];
  } {
    return this.#transformSharingRequest(this._issuedSharingRequests);
  }

  // Received sharing requests
  public set receivedSharingRequests(value: ESPGroupSharingRequest[]) {
    this._receivedSharingRequests = this.#makeSharingRequestObservable(
      value,
      "received"
    );
  }
  public get receivedSharingRequests(): {
    [key: string]: ESPGroupSharingRequest[];
  } {
    return this.#transformSharingRequest(this._receivedSharingRequests);
  }

  // Computed properties
  /**
   * Retrieves the list of all groups.
   * @returns {ESPRMGroup[]} The list of all groups.
   *
   * GPT Context: This function returns an array of all groups stored in the `groupsByID` object, allowing for easy access to the complete list of groups.
   */
  @computed get groupList(): ESPRMGroup[] {
    return Object.values(this.groupsByID);
  }

  // Hooks
  beforeSetGroupListHook: (nodes: ESPRMGroup[]) => void = () => {};
  afterSetGroupListHook: (nodes: ESPRMGroup[]) => void = () => {};

  // Action and helper functions

  /**
   * Sets the list of groups in the store.
   *
   * This method takes an array of groups, makes each group observable,
   * and updates the store with the new list of groups.
   *
   * @param {ESPRMGroup[]} groups - The list of groups to set.
   */
  @action setGroupList(groups: ESPRMGroup[]) {
    this.groupsByID = groups.reduce(
      (acc, group) => {
        const observableGroup = makeEverythingObservable(group);
        this.#interceptProxy(observableGroup);
        acc[group.id] = observableGroup;
        return acc;
      },
      {} as { [key: string]: ESPRMGroup }
    );
  }

  /**
   * Adds a new group to the store and makes it observable.
   *
   * This method takes a group, makes it observable, and adds it to the store.
   *
   * @param {ESPRMGroup} group - The group to add.
   * @returns {ESPRMGroup} The observable group that was added.
   */
  @action addGroup(group: ESPRMGroup) {
    const observableGroup = makeEverythingObservable(group);
    this.#interceptProxy(observableGroup);
    this.groupsByID[group.id] = observableGroup;
    return observableGroup;
  }

  /**
   * Sets the node by ID.
   * @param {{ [key: string]: ESPRMGroup }} groupsByID - The group by ID.
   *
   * GPT Context: This setter updates the node mapped by their IDs in the store.
   */
  @action setGroupByID(id: string, group: ESPRMGroup): void {
    this.groupsByID[id] = group;
  }

  /**
   * Expands the details of groups based on the provided group IDs.
   * @param {string[]} groupIds - An array of group IDs to be expanded.
   * @returns {ESPRMGroup[]} The list of groups corresponding to the provided IDs.
   *
   * GPT Context: This action method takes an array of group IDs and retrieves the corresponding group details from the `groupsByID` collection, returning a list of groups. If a group ID doesn't exist, it returns an empty object in its place.
   */
  @action expand(groupIds: string[]): ESPRMGroup[] {
    return groupIds.map((groupId) => this.groupsByID[groupId] || []);
  }

  /**
   * Sets the node list with pre- and post-processing hooks.
   * @param {ESPRMGroup[]} groupList - The list of group to set.
   *
   * GPT Context: This function allows developers to inject custom logic before and after setting the node list.
   */
  @action setGroupListWithHooks(groupList: ESPRMGroup[]) {
    this.beforeSetGroupListHook(groupList);
    this.setGroupList(groupList);
    this.afterSetGroupListHook(groupList);
  }

  /**
   * Updates multiple group properties.
   * @param {Partial<ESPRMGroup>[]} updates - An array of partial updates for the group.
   *
   * GPT Context: This function allows bulk updates to multiple group, merging the provided updates with the existing node data.
   */
  @action updateMultipleGroups(updates: Partial<ESPRMGroup>[]) {
    updates.forEach((update) => {
      if (update.id && this.groupsByID[update.id]) {
        Object.assign(this.groupsByID[update.id], update);
      }
    });
  }

  /**
   * Deletes groups by their IDs.
   * @param {string[]} ids - The IDs of the group to delete.
   *
   * GPT Context: This function removes multiple group from the store based on their IDs, useful for batch deletions.
   */
  @action async deleteGroups(ids: string[]) {
    ids.forEach((id) => delete this.groupsByID[id]);
  }

  /**
   * Resets the store to its initial state.
   *
   * GPT Context: This function clears all data from the store, useful for resetting the store during user logout or debugging.
   */
  @action clear() {
    this.groupsByID = {};
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
      return this.processGetGroupsRes(response);
    } else {
      throw new Error(constants.NO_MORE_GROUPS_TO_FETCH_ERR);
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
   * Processes the response from the cloud to get groups.
   *
   * This function processes the response from the cloud, makes the groups observable,
   * and updates the store with the latest data. It also handles pagination by setting the fetchNext
   * reference and hasNext flag.
   *
   * @param {any} response - The response from the cloud containing groups.
   * @returns {any} An object containing the observable groups, fetchNext function, and hasNext flag.
   */
  processGetGroupsRes(response: any): ESPPaginatedGroupsResponse {
    let { groups, fetchNext, hasNext } = response;
    const observableGroup = groups.map((group: ESPRMGroup) =>
      this.addGroup(group)
    );
    if (hasNext) {
      this.#fetchNextRef = fetchNext;
    }
    this._hasNext = hasNext;
    return {
      groups: observableGroup,
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
   * @returns {
   * sharedRequests: { [key: string]: ESPGroupSharingRequest[] }
   * fetchNext: () => Promise<{  sharedRequests: { [key: string]: ESPGroupSharingRequest[] }; }>;
   * hasNext: boolean;
   * }  An object containing the observable received sharing requests, fetchNext function, and hasNext flag.
   */
  processIssuedSharingRequestRes(response: any): {
    sharedRequests: { [key: string]: ESPGroupSharingRequest[] };
    fetchNext: () => Promise<{
      sharedRequests: { [key: string]: ESPGroupSharingRequest[] };
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
   * @returns {
   * sharedRequests: { [key: string]: ESPGroupSharingRequest[] }
   * fetchNext: () => Promise<{  sharedRequests: { [key: string]: ESPGroupSharingRequest[] }; }>;
   * hasNext: boolean;
   * }
   * An object containing the observable received sharing requests, fetchNext function, and hasNext flag.
   */
  processReceivedSharingRequestRes(response: any): {
    sharedRequests: { [key: string]: ESPGroupSharingRequest[] };
    fetchNext: () => Promise<{
      sharedRequests: { [key: string]: ESPGroupSharingRequest[] };
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
   * Synchronizes the group list from the cloud by fetching all groups with pagination.
   *
   * This method calls the API to get the list of groups, including their nodes and sub-groups,
   * and continues to fetch the next set of groups until there are no more groups to fetch.
   * The fetched groups are then set in the store.
   *
   * @async
   * @returns {Promise<void>} A promise that resolves when the group list has been synchronized.
   */
  syncGroupList = async () => {
    let response = await this.rootStore?.userStore.user?.getGroups({
      withNodeList: true,
      withSubGroups: true,
    });
    this.groupsByID = {};
    this.processGetGroupsRes(response);
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
      this: GroupStore,
      value: any
    ) {
      this[propertyName] = value;
    });
  }
}

export default GroupStore;
