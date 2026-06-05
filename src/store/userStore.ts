/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { observable, action, extendObservable, computed, runInAction } from "mobx";
import { ESPCDF } from "./index";
import { ESPCDFUser } from "../entities/ESPCDFUser";
import { UserStoreSynchronizer } from "./sync/UserStoreSynchronizer";
import { ESPCDFUserInfo, GroupStoreCallbacks } from "../types";
import { Auth } from "../utils/auth";
import { findGroupById } from "../utils/home";
import { applyRegisteredTransports } from "../utils/registeredTransports";

class UserStore {
  #synchronizer: UserStoreSynchronizer;
  @observable accessor adaptorAuthorizationEntityMap: Record<
    string,
    ESPCDFUser
  > | null = null;
  [key: string]: any;
  rootStore: ESPCDF;

  /** Auth wrapper that delegates to the active adaptor. Use store.authService (alias) or userStore.auth. */
  readonly auth: Auth;

  constructor(rootStore: ESPCDF) {
    this.rootStore = rootStore;
    this.auth = new Auth(
      this,
      () => rootStore.sdkAdaptorRegistry.getActiveAdaptor()
    );
    this.#synchronizer = new UserStoreSynchronizer(
      this,
      rootStore.groupStore,
      rootStore.nodeStore,
      rootStore.automationStore,
      rootStore.scheduleStore,
      rootStore.sceneStore
    );
  }

  @computed get user() {
    const registry = this.rootStore.sdkAdaptorRegistry;
    const activeAdaptorIdentifier = registry.getActiveAdaptorIdentifier() ?? "";
    return this.adaptorAuthorizationEntityMap?.[
      activeAdaptorIdentifier
    ];
  }

  /**
   * Fetches current user from the active adaptor and stores it.
   * Use for init/refresh; after this, userStore.user is the source of truth.
   */
  async restoreSession(): Promise<ESPCDFUser | null> {
    try {
      const adaptor = this.rootStore.sdkAdaptorRegistry.getActiveAdaptor();
      const resp = await adaptor.getCurrentLoggedInUser();
      if (resp?.data) {
        return this.setAuthorizationEntityForAdaptor(
          adaptor._identifier,
          resp.data
        );
      }
    } catch {
      console.error("[UserStore] User not logged in");
    }
    return null;
  }

  @action setUserInfoForSDK(user: ESPCDFUser, userInfo: ESPCDFUserInfo) {
    const storeUser = this.adaptorAuthorizationEntityMap?.[user.identifier];
    if (storeUser) {
      storeUser.userInfo = { ...storeUser.userInfo, ...userInfo };
    }
  }

  @action setCustomDataForSDK(user: ESPCDFUser, customData: any) {
    const storeUser = this.adaptorAuthorizationEntityMap?.[user.identifier];
    if (storeUser) {
      // Merge new customData with existing customData instead of replacing
      // This ensures we don't lose existing fields when updating specific ones
      if (!storeUser.customData) {
        storeUser.customData = {};
      }
      // Merge the new data with existing data
      storeUser.customData = { ...storeUser.customData, ...customData };
    }
  }

  @action setUserInfo(user: ESPCDFUser, data: ESPCDFUserInfo) {
    this.setUserInfoForSDK(user, data);
  }

  @action setCustomData(user: ESPCDFUser, customData: any) {
    this.setCustomDataForSDK(user, customData);
  }

  @action removeUser(userId: string) {
    this.removeAuthorizationEntityForAdaptor(userId);
  }

  @action setAuthorizationEntityForAdaptor(
    adaptorIdentifier: string,
    authEntity: ESPCDFUser
  ) {
    if (!this.adaptorAuthorizationEntityMap) {
      this.adaptorAuthorizationEntityMap = {};
    }

    // Detach previous user from synchronizer if exists
    const previousUser = this.adaptorAuthorizationEntityMap[adaptorIdentifier];
    if (previousUser) {
      this.#synchronizer.detach(previousUser.identifier);
    }

    // Inject store callbacks for adapter sync methods (syncHomeWithNodes, setCurrentHome)
    const groupStore = this.rootStore.groupStore;
    const nodeStore = this.rootStore.nodeStore;
    const callbacks: GroupStoreCallbacks = {
      setGroupsList: (groups) => groupStore.setGroupsList(groups),
      setCurrentHomeId: (id) => {
        groupStore.currentHomeId = id;
      },
      addGroup: (group) => groupStore.addGroup(group),
      addNodesToGroup: (groupId, nodes) => {
        runInAction(() => {
          const group = findGroupById(groupStore.groupsList, groupId);
          if (group) {
            const existingIds = new Set(group.nodeIds ?? []);
            const detailsById = new Map(
              (group.nodeDetails ?? []).map((n) => [n.id, n])
            );
            for (const node of nodes) {
              existingIds.add(node.id);
              detailsById.set(node.id, node);
            }
            group.nodeIds = Array.from(existingIds);
            group.nodeDetails = Array.from(detailsById.values());
          }
          if (nodeStore.setNodesList && nodes.length > 0) {
            const registered =
              this.rootStore.subscriptionStore.getRegisteredTransportsSnapshot();
            const merged = nodes.map((node) =>
              applyRegisteredTransports(node, registered),
            );
            nodeStore.setNodesList(merged);
          }
        });
      },
      onNodeUpdate: (update) => {
        this.rootStore.subscriptionStore.nodeUpdates.listen(update);
      },
    };
    authEntity.setStoreCallbacks?.(callbacks);

    // Set new user entity
    this.adaptorAuthorizationEntityMap[adaptorIdentifier] = authEntity;

    // Attach user to synchronizer for reactive updates
    this.#synchronizer.attach(authEntity);

    return authEntity;
  }

  @action getAuthorizationEntityForAdaptor(adaptorIdentifier: string) {
    return this.adaptorAuthorizationEntityMap?.[adaptorIdentifier];
  }

  @action removeAuthorizationEntityForAdaptor(adaptorIdentifier?: string) {
    if (!this.adaptorAuthorizationEntityMap) {
      return;
    }
    if (adaptorIdentifier) {
      // Detach user from synchronizer before deleting
      this.#synchronizer.detach(adaptorIdentifier);
      delete this.adaptorAuthorizationEntityMap[adaptorIdentifier];
    } else {
      // Detach all users from synchronizer before clearing map
      if (this.adaptorAuthorizationEntityMap) {
        Object.keys(this.adaptorAuthorizationEntityMap).forEach((userId) => {
          this.#synchronizer.detach(userId);
        });
      }
      this.adaptorAuthorizationEntityMap = null;
    }
  }

  /**
   * Adds a dynamic observable property to the store.
   * @param propertyName - The name of the property to add
   * @param initialValue - The initial value of the property
   */
  @action addProperty(propertyName: string, initialValue: any) {
    extendObservable(this, { [propertyName]: initialValue });
  }

  /**
   * Gets access token for the currently active adaptor user entity.
   */
  static async getActiveAdaptorAccessToken(
    rootStore: ESPCDF | null,
    adaptorIdentifier: string
  ): Promise<string> {
    if (!rootStore) {
      throw new Error("CDF store instance is not initialized");
    }

    const activeUser =
      rootStore.userStore.getAuthorizationEntityForAdaptor(adaptorIdentifier);
    if (!activeUser) {
      throw new Error("Active adaptor user is not available");
    }

    return activeUser.getAccessToken();
  }
}

export default UserStore;
