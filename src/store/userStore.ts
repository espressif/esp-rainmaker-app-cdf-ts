/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { observable, action } from "mobx";
import { CDF } from "./index";
import {
  ESPRMGroup,
  ESPRMUser,
  ESPRMUserInfo,
  ESPRMAuth,
  ESPRMAuthWithKeys,
  ESPPaginatedAutomationsResponse,
  ESPAutomation,
  ESPAPIResponse,
  ESPGeoCoordinates,
} from "../types/index";

import {
  extendObservable,
  capitalize,
  proxyActionHandler,
  createInterceptor,
} from "../utils/common";

import * as constants from "../utils/constants";

class UserStore {
  #rootStore: CDF | null;
  #sessionToken: string | undefined | null = null;
  #userPhoneNumber: string | null = null;
  [key: string]: any;
  @observable private accessor _user: ESPRMUser | null = null;
  @observable private accessor _userInfo: ESPRMUserInfo | null = null;
  @observable private accessor _authInstance: ESPRMAuth | null = null;

  constructor(rootStore?: CDF) {
    this.#rootStore = rootStore || null;
  }

  // Getter and Setters
  public get user(): ESPRMUser | null {
    return this._user;
  }
  public set user(value: ESPRMUser | null) {
    this.#interceptProxy(value);
    this._user = value;
  }
  public get userInfo(): ESPRMUserInfo | null {
    return this._userInfo;
  }
  public set userInfo(value: ESPRMUserInfo | null) {
    this._userInfo = value;
  }
  public get authInstance(): ESPRMAuth | null {
    return this._authInstance;
  }
  public set authInstance(value: ESPRMAuth | null) {
    this._authInstance = value;
    if (value) {
      this.mapAuthMethods();
    }
  }

  @action private mapAuthMethods() {
    if (!this.authInstance) {
      console.warn("authInstance is not set. Skipping mapping methods.");
      return;
    }

    const authProto = Object.getPrototypeOf(this.authInstance);

    // Get all prototype methods
    const methodNames = Object.getOwnPropertyNames(authProto).filter(
      (name) => typeof authProto[name] === "function" && name !== "constructor"
    );

    // Map methods to UserStore
    methodNames.forEach((methodName: string) => {
      if (this[methodName]) {
        return;
      }
      if (!this.authInstance) {
        console.error("authInstance is not set. Skipping mapping methods.");
        return;
      }
      this[methodName] = async (...args: any[]) => {
        const authInstance = this.authInstance as ESPRMAuthWithKeys;
        return await authInstance[methodName].apply(this.authInstance, args);
      };
    });
  }

  /**
   * Sets the user instance.
   * @param {any | null} userInstance - The user instance to be set.
   *
   * GPT Context: This method sets the user instance in the store and fetches the user information associated with the user instance.
   */
  @action async setUserInstance(userInstance: any | null) {
    this.user = userInstance;
    // RUNS ONLY WHEN SDK INSTANCE IS PROVIDED
    if (this.#rootStore?.sdkInstance && this.#rootStore.config.autoSync) {
      const [userInfo] = await Promise.all([
        this.user?.getUserInfo(),
        await this.#rootStore?.nodeStore.syncNodeList(),
        await this.#rootStore?.groupStore.syncGroupList(),
        await this.#rootStore?.subscriptionStore.subscribeAllListeners(),
      ]);
      this.userInfo = userInfo || null;
    }
  }

  /**
   * Logs out the user.
   *
   * GPT Context: This method logs out the user, clearing the user and userInfo objects in the store.
   */
  @action async logout() {
    if (this.user) {
      const response = await this.user.logout();
      if (response.status === constants.SUCCESS) {
        this.clear();
        this.#rootStore?.nodeStore.clear();
        this.#rootStore?.groupStore.clear();
        this.#rootStore?.automationStore.clear();
        return { success: true };
      } else {
        return { success: false, ...response };
      }
    }
    return { success: false };
  }

  // login - user - will setUserInstance and update the userInfo || { success : true } || SDK failed response
  @action async login(email: string, password: string) {
    try {
      const user = await this.authInstance?.login(email, password);
      if (user) {
        await this.setUserInstance(user);
      }
      return {
        success: user ? true : false,
      };
    } catch (error) {
      console.error("Error logging in", error);
      throw error;
    }
  }

  @action async requestLoginOTP(userName: string) {
    try {
      const response = await this.authInstance?.requestLoginOTP(userName);
      this.#sessionToken = response;
      return {
        success: response ? true : false,
      };
    } catch (error) {
      console.error("Error logging in", error);
      throw error;
    }
  }

  @action async loginWithOTP(userName: string, verificationCode: string) {
    try {
      const user = await this.authInstance?.loginWithOTP(
        userName,
        verificationCode,
        this.#sessionToken || ""
      );
      if (user) {
        await this.setUserInstance(user);
        this.#sessionToken = null;
      }
      return {
        success: user ? true : false,
      };
    } catch (error) {
      console.error("Error logging in", error);
      throw error;
    }
  }

  /**
   * Initiates the account deletion process.
   *
   * GPT Context: This method initiates the account deletion process by calling the deleteAccount method and handling any necessary pre-deletion logic.
   */
  @action async initiateDeleteAccount() {
    try {
      const response = await this.user?.requestAccountDeletion();
      return response;
    } catch (error) {
      console.error("Error initiating account deletion", error);
      throw error;
    }
  }

  /**
   * Deletes the user's account.
   *
   * GPT Context: This method deletes the user's account, clears the user and userInfo objects in the store, and resets the device and group stores.
   */
  @action async deleteAccount(verificationCode: string) {
    try {
      const response =
        await this.user?.confirmAccountDeletion(verificationCode);
      if (response?.status === constants.SUCCESS) {
        this.clear();
        this.#rootStore?.nodeStore.clear();
        this.#rootStore?.groupStore.clear();
        this.#rootStore?.automationStore.clear();
      }
      return response;
    } catch (error) {
      console.error("Error initiating account deletion", error);
      throw error;
    }
  }

  /**
   * Resets the user store.
   *
   * GPT Context: This method resets the user store by clearing the user and userInfo objects, effectively logging out the user.
   */
  @action clear() {
    this.user = null;
    this.userInfo = null;
  }

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
      this: UserStore,
      value: any
    ) {
      this[propertyName] = value;
    });
  }

  /**
   * Sets the user information in the store.
   *
   * This method sets the user information in the store, which can be used to track
   * the currently logged-in user's information.
   *
   * @param {any} userInfo - The user information to set.
   */
  @action setUserInfo(userInfo: any) {
    this.userInfo = userInfo;
  }

  /**
   * Synchronizes the user information from the cloud.
   *
   * This method fetches the latest user information from the cloud and updates the store.
   *
   * @async
   * @returns {Promise<void>} A promise that resolves when the user information has been synchronized.
   */
  @action async syncUserInfoFromCloud() {
    const userInfo = await this.user?.getUserInfo();
    this.setUserInfo(userInfo);
  }

  #interceptProxy(user: any) {
    const updateUserInfoIfSuccess = (result: any, update: Object) => {
      if (result.status === constants.SUCCESS && this.userInfo) {
        Object.assign(this.userInfo, update);
        return { success: true };
      }
      return { success: false, ...result };
    };
    const updateNameInterceptor = createInterceptor({
      onSuccess: (result: any, args) => {
        const name = args[0];
        return updateUserInfoIfSuccess(result, { name });
      },
    });
    const setPhoneNumberInterceptor = createInterceptor({
      onSuccess: (result: any, args) => {
        const phoneNumber = args[0];
        this.#userPhoneNumber = phoneNumber;
        return { success: true };
      },
    });
    const confirmPhoneNumberInterceptor = createInterceptor({
      onSuccess: (result: any, args) => {
        const phoneNumber = this.#userPhoneNumber;
        return updateUserInfoIfSuccess(result, { phoneNumber });
      },
    });
    const configureMFAInterceptor = createInterceptor({
      onSuccess: (result: any, args) => {
        const mfa = args[0];
        return updateUserInfoIfSuccess(result, { mfa });
      },
    });
    const confirmAccountDeletionInterceptor = createInterceptor({
      onSuccess: (result: any, args) => {
        this.clear();
        this.#rootStore?.nodeStore.clear();
        this.#rootStore?.groupStore.clear();
        this.#rootStore?.automationStore.clear();
      },
    });

    // Group Interceptors
    const createGroupInterceptor = createInterceptor({
      onSuccess: (result: ESPRMGroup, args) => {
        return this.#rootStore?.groupStore.addGroup(result);
      },
    });
    const getGroupByIdInterceptor = createInterceptor({
      onSuccess: (result: ESPRMGroup, args) => {
        return this.#rootStore?.groupStore.addGroup(result);
      },
    });
    const getGroupByNameInterceptor = createInterceptor({
      onSuccess: (result: ESPRMGroup, args) => {
        return this.#rootStore?.groupStore.addGroup(result);
      },
    });
    const getGroupsInterceptor = createInterceptor({
      onSuccess: (result: any, args) => {
        return this.#rootStore?.groupStore.processGetGroupsRes(result);
      },
    });
    const getUserInfoInterceptor = createInterceptor({
      onSuccess: (result: ESPRMUserInfo) => {
        this.userInfo = result;
        return this.userInfo;
      },
    });
    const getIssuedGroupSharingRequestsInterceptor = createInterceptor({
      onSuccess: (result: any, args) => {
        return this.#rootStore?.groupStore.processIssuedSharingRequestRes(
          result
        );
      },
    });
    const getReceivedGroupSharingRequestsInterceptor = createInterceptor({
      onSuccess: (result: any, args) => {
        return this.#rootStore?.groupStore.processReceivedSharingRequestRes(
          result
        );
      },
    });

    // Node Interceptors
    const getNodeDetailsInterceptor = createInterceptor({
      onSuccess: (result: any, args) => {
        return this.#rootStore?.nodeStore.addNode(result);
      },
    });
    const getUserNodesInterceptor = createInterceptor({
      onSuccess: (result: any, args) => {
        return this.#rootStore?.nodeStore.processNodeDetailsRes(result);
      },
    });
    const getUserNodesWithInterceptors = createInterceptor({
      onSuccess: (result: any, args) => {
        return this.#rootStore?.nodeStore.processNodeDetailsRes(result);
      },
    });
    const getIssuedNodeSharingRequestsInterceptor = createInterceptor({
      onSuccess: (result: any, args) => {
        return this.#rootStore?.nodeStore.processIssuedSharingRequestRes(
          result
        );
      },
    });
    const getReceivedNodeSharingRequestsInterceptor = createInterceptor({
      onSuccess: (result: any, args) => {
        return this.#rootStore?.nodeStore.processReceivedSharingRequestRes(
          result
        );
      },
    });

    // Automation Interceptors
    const getAutomationsInterceptor = createInterceptor({
      onSuccess: (result: ESPPaginatedAutomationsResponse, args) => {
        return this.#rootStore?.automationStore.processAutomationsRes(result);
      },
    });
    const getAutomationDetailInterceptor = createInterceptor({
      onSuccess: (result: ESPAutomation, args) => {
        return this.#rootStore?.automationStore.addAutomation(result);
      },
    });
    const addWeatherBasedAutomationInterceptor = createInterceptor({
      onSuccess: (result: ESPAutomation, args) => {
        return this.#rootStore?.automationStore.addAutomation(result);
      },
    });
    const addDaylightBasedAutomationInterceptor = createInterceptor({
      onSuccess: (result: ESPAutomation, args) => {
        return this.#rootStore?.automationStore.addAutomation(result);
      },
    });
    const setGeoCoordinatesInterceptor = createInterceptor({
      onSuccess: (result: ESPAPIResponse, args) => {
        const coordinates = args[0];
        this.#rootStore?.automationStore.setGeoCoordinates(coordinates);
        return result;
      },
    });
    const getGeoCoordinatesInterceptor = createInterceptor({
      onSuccess: (result: ESPGeoCoordinates, args) => {
        this.#rootStore?.automationStore.setGeoCoordinates(result);
        return result;
      },
    });

    // user methods
    proxyActionHandler(user, "getUserInfo", getUserInfoInterceptor);
    proxyActionHandler(user, "updateName", updateNameInterceptor);
    proxyActionHandler(user, "setPhoneNumber", setPhoneNumberInterceptor);
    proxyActionHandler(
      user,
      "confirmPhoneNumber",
      confirmPhoneNumberInterceptor
    );
    proxyActionHandler(user, "configureMFA", configureMFAInterceptor);
    proxyActionHandler(
      user,
      "confirmAccountDeletion",
      confirmAccountDeletionInterceptor
    );

    // group methods
    proxyActionHandler(user, "getGroups", getGroupsInterceptor);
    proxyActionHandler(user, "createGroup", createGroupInterceptor);
    proxyActionHandler(user, "getGroupById", getGroupByIdInterceptor);
    proxyActionHandler(user, "getGroupByName", getGroupByNameInterceptor);
    proxyActionHandler(
      user,
      "getIssuedGroupSharingRequests",
      getIssuedGroupSharingRequestsInterceptor
    );
    proxyActionHandler(
      user,
      "getReceivedGroupSharingRequests",
      getReceivedGroupSharingRequestsInterceptor
    );

    // node methods
    proxyActionHandler(user, "getNodeDetails", getNodeDetailsInterceptor);
    proxyActionHandler(user, "getUserNodes", getUserNodesInterceptor);
    proxyActionHandler(user, "getUserNodesWith", getUserNodesWithInterceptors);
    proxyActionHandler(
      user,
      "getIssuedNodeSharingRequests",
      getIssuedNodeSharingRequestsInterceptor
    );
    proxyActionHandler(
      user,
      "getReceivedNodeSharingRequests",
      getReceivedNodeSharingRequestsInterceptor
    );

    // automation methods
    proxyActionHandler(user, "getAutomations", getAutomationsInterceptor);
    proxyActionHandler(
      user,
      "getAutomationDetail",
      getAutomationDetailInterceptor
    );
    proxyActionHandler(
      user,
      "addWeatherBasedAutomation",
      addWeatherBasedAutomationInterceptor
    );
    proxyActionHandler(
      user,
      "addDaylightBasedAutomation",
      addDaylightBasedAutomationInterceptor
    );
    proxyActionHandler(user, "setGeoCoordinates", setGeoCoordinatesInterceptor);
    proxyActionHandler(user, "getGeoCoordinates", getGeoCoordinatesInterceptor);
  }
}

export default UserStore;
