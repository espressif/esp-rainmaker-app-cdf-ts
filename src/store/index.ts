/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import UserStore from "./userStore";
import NodeStore from "./nodeStore";
import GroupStore from "./groupStore";
import SubscriptionStore from "./subscriptionStore";
import { observable, action } from "mobx";
import { CDFconfig, ESPRMBaseConfig } from "../types";
import { ESPRMBase } from "@espressif/rainmaker-base-sdk";
import * as constants from "../utils/constants";

/**
 * The root store that manages all individual stores.
 * GPT Context: This class serves as the root store, providing a single point of access to all individual stores within the application. It initializes and manages instances of UserStore, DeviceStore, GroupStore, and SubscriptionStore.
 */
class CDF {
  #config: CDFconfig = {};
  @observable accessor sdkInstance: any;
  @observable accessor userStore: UserStore;
  @observable accessor nodeStore: NodeStore;
  @observable accessor groupStore: GroupStore;
  @observable accessor subscriptionStore: SubscriptionStore;

  constructor(sdkInstance: any) {
    this.sdkInstance = sdkInstance || null;
    this.groupStore = new GroupStore(this);
    this.nodeStore = new NodeStore(this);
    this.userStore = new UserStore(this);
    this.subscriptionStore = new SubscriptionStore(this);
  }

  initialize = async (authInstance: any) => {
    const loggedInUser = await authInstance.getLoggedInUser();
    if (loggedInUser) {
      this.userStore.setUserInstance(loggedInUser);
    }
  };

  public get config() {
    return this.#config;
  }
  public set config(config: CDFconfig) {
    this.#config = config;
  }

  /**
   * Adds a custom store to the root store.
   * @param {string} storeName - The name of the custom store.
   * @param {new (rootStore: CDF) => any} StoreClass - The class of the custom store.
   *
   * GPT Context: This method allows developers to add custom store classes to the root store dynamically, providing flexibility to extend the store with additional functionality.
   *
   * Example:
   * ```ts
   * import { makeAutoObservable, action } from "mobx";
   * import { CDF } from "./index";
   *
   * class CustomStore {
   *   rootStore: CDF;
   *   customValue = "custom value";
   *
   *   constructor(rootStore: CDF) {
   *     this.rootStore = rootStore;
   *     makeAutoObservable(this);
   *   }
   *
   *   @action setCustomValue(value: string) {
   *     this.customValue = value;
   *   }
   * }
   *
   * store.addStore("customStore", CustomStore);
   * ```
   */
  @action addStore(storeName: string, StoreClass: new (rootStore: CDF) => any) {
    (this as any)[storeName] = new StoreClass(this);
  }
}

// Singleton instance
let storeInstance: CDF | null = null;

/**
 * Initializes and returns the singleton store instance.
 * @param sdk Backend SDK instance
 */
export const initCDF = async (
  sdkConfig: ESPRMBaseConfig,
  config: CDFconfig
): Promise<CDF> => {
  if (!sdkConfig) {
    throw new Error(constants.SDK_CONFIG_MISSION_ERR);
  }

  ESPRMBase.configure(sdkConfig);
  const authInstance = ESPRMBase.getAuthInstance();

  if (!storeInstance) {
    storeInstance = new CDF(authInstance || null);
    storeInstance.config = config;
    storeInstance.userStore.authInstance = authInstance;
    await storeInstance.initialize(authInstance);
  }
  return storeInstance;
};

export type { CDF };
