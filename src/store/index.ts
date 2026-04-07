/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import NodeStore from "./nodeStore";
import GroupStore from "./groupStore";
import UserStore from "./userStore";
import { ESPCDFGroup } from "../entities/ESPCDFGroup";
import { ESPCDFNode } from "../entities/ESPCDFNode";
import ScheduleStore from "./scheduleStore";
import AutomationStore from "./automationStore";
import SceneStore from "./sceneStore";
import SubscriptionStore from "./subscriptionStore";
import { observable, action } from "mobx";
import { ESPCDFconfig, ESPSDKAdaptor } from "../types";
import { AdaptorRegistry } from "../registry";
import { ERROR_MESSAGE_MAP, isEmptyObject } from "../utils/common";
import { ESPCDFConfigError } from "../errors";

/**
 * The root store that manages all individual stores.
 */
export class ESPCDF {
  static instance: ESPCDF | null = null;
  @observable accessor sdkAdaptorRegistry: AdaptorRegistry;
  @observable accessor nodeStore: NodeStore;
  @observable accessor groupStore: GroupStore;
  @observable accessor userStore: UserStore;
  @observable accessor scheduleStore: ScheduleStore;
  @observable accessor automationStore: AutomationStore;
  @observable accessor sceneStore: SceneStore;
  @observable accessor subscriptionStore: SubscriptionStore;

  constructor(config: ESPCDFconfig) {
    // Order of initialization is important as user store depends on other stores
    this.sdkAdaptorRegistry = config.sdkAdaptorRegistry;
    this.nodeStore = new NodeStore(this);
    this.groupStore = new GroupStore(this);
    this.automationStore = new AutomationStore();
    this.scheduleStore = new ScheduleStore(this);
    this.sceneStore = new SceneStore(this);
    this.userStore = new UserStore(this);
    this.subscriptionStore = new SubscriptionStore(this);
  }

  /**
   * Adds a custom store to the root store.
   * @param storeName - The name of the custom store.
   * @param StoreClass - The class of the custom store.
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
  @action addStore(
    storeName: string,
    StoreClass: new (rootStore: ESPCDF) => any
  ) {
    (this as any)[storeName] = new StoreClass(this);
  }

  /**
   * Gets an SDK adaptor by identifier.
   * @param adaptorIdentifier - The identifier of the adaptor to retrieve
   * @returns The SDK adaptor instance
   */
  adaptor(adaptorIdentifier: string): ESPSDKAdaptor {
    return this.sdkAdaptorRegistry.getAdaptor(adaptorIdentifier);
  }

  /**
   * Returns the identifier of the currently active SDK adaptor, or null if none is set.
   * @returns The active adaptor identifier, or null
   */
  getActiveAdaptorIdentifier(): string | null {
    return this.sdkAdaptorRegistry.getActiveAdaptorIdentifier();
  }

  /**
   * Returns the currently selected home group, or undefined if none is set.
   */
  getCurrentHome(): ESPCDFGroup | undefined {
    const id = this.groupStore.currentHomeId;
    return id ? this.groupStore.getGroupById(id) : undefined;
  }

  /**
   * Returns nodes that belong to the current home's nodeIds.
   */
  getNodesForCurrentHome(): ESPCDFNode[] {
    const home = this.getCurrentHome();
    if (!home?.nodeIds) return [];
    const nodeList = this.nodeStore.nodesList ?? [];
    return nodeList.filter((n) => home.nodeIds!.includes(n.id));
  }

  static getInstance(config: ESPCDFconfig): ESPCDF {
    if (!ESPCDF.instance) {
      ESPCDF.instance = new ESPCDF(config);
    }
    return ESPCDF.instance;
  }
}

/**
 * Initializes and returns the singleton CDF store instance.
 *
 * Creates a new CDF instance if one doesn't exist, or returns the existing instance.
 * Validates that the config and SDK registry are provided.
 * @param config - CDF configuration containing SDK registry
 * @returns The singleton CDF store instance
 * @throws Error if config or SDK registry is missing
 */
export const initCDF = async (config: ESPCDFconfig): Promise<ESPCDF> => {
  if (isEmptyObject(config)) {
    throw new ESPCDFConfigError(
      ERROR_MESSAGE_MAP.CDF_CONFIG_MISSING,
      "CDF_CONFIG_MISSING"
    );
  }
  return ESPCDF.getInstance(config);
};
