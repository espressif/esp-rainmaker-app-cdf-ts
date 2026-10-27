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
import { observable, action, reaction } from "mobx";
import { ESPCDFconfig, ESPSDKAdaptor } from "../types";
import { AdaptorRegistry } from "../registry";
import { ERROR_MESSAGE_MAP, isEmptyObject } from "../utils/common";
import { ESPCDFConfigError } from "../errors";
import { clearInFlight } from "../utils/singleFlight";
import type { ESPCDFSnapshotConfig } from "../types/snapshot";
import {
  SNAPSHOT_DEFAULT_KEY_PREFIX,
  SNAPSHOT_DEFAULT_PERSIST_DELAY_MS,
  SNAPSHOT_SCHEMA_VERSION,
  buildSnapshot,
  hydrateSnapshotIntoStore,
  isSnapshotUsable,
  snapshotFingerprint,
} from "../services/snapshot";

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

  /**
   * Bumped by every store action, synchronizer and event handler that changes the
   * home tree (groups, nodes, params). Cheap to watch: the snapshot persister
   * reacts to this counter instead of tracking the whole tree.
   */
  @observable accessor treeVersion = 0;

  #snapshotConfig: ESPCDFSnapshotConfig | undefined;
  #lastSnapshotKey: string | null = null;
  /** Content of the last snapshot written or restored; identical content is not rewritten. */
  #lastSnapshotFingerprint: string | null = null;
  #stopSnapshotPersister: (() => void) | null = null;

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
    this.#snapshotConfig = config.snapshot;
    if (this.#snapshotConfig) {
      this.#startSnapshotPersister(this.#snapshotConfig);
    }
  }

  /** Records that the home tree changed. Called by the stores, synchronizers and event handlers. */
  @action markTreeChanged(): void {
    this.treeVersion += 1;
  }

  /**
   * Writes the snapshot whenever the tree changes: a sync, an own mutation such
   * as a room rename, or a run of param updates. The watcher reads only
   * `treeVersion` and the current home id, so a change costs nothing until
   * `persistDelayMs` of quiet has passed; the tree is walked once per write.
   */
  #startSnapshotPersister(config: ESPCDFSnapshotConfig): void {
    const delayMs = config.persistDelayMs ?? SNAPSHOT_DEFAULT_PERSIST_DELAY_MS;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const stopWatching = reaction(
      () => `${this.treeVersion}:${this.groupStore.currentHomeId ?? ""}`,
      () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          timer = null;
          void this.persistSnapshot().catch((error: unknown) => {
            console.warn("[ESPCDF] snapshot persist failed:", error);
          });
        }, delayMs);
      }
    );
    this.#stopSnapshotPersister = () => {
      stopWatching();
      if (timer) clearTimeout(timer);
      timer = null;
    };
  }

  /** Fingerprint of what a snapshot of the store would hold right now. */
  #currentSnapshotFingerprint(): string {
    const identity = this.#snapshotIdentity();
    return identity ? snapshotFingerprint(buildSnapshot(this, identity)) : "";
  }

  /** `true` while the tree was restored from disk and no live sync has completed yet. */
  get isSnapshot(): boolean {
    return this.groupStore.dataSource === "snapshot";
  }

  /**
   * Who the snapshot belongs to. The storage key is `<prefix>:<adaptorId>:<userId>`,
   * so each account has its own slot and a restore can only ever read its own
   * snapshot. Without a user id (profile not loaded yet) there is no identity:
   * nothing is written or restored.
   */
  #snapshotIdentity(): { adaptorId: string; userId: string; key: string } | null {
    const adaptorId = this.getActiveAdaptorIdentifier();
    const userId = this.userStore.user?.userInfo?.id;
    if (!adaptorId || typeof userId !== "string" || userId.length === 0) return null;
    const prefix = this.#snapshotConfig?.keyPrefix ?? SNAPSHOT_DEFAULT_KEY_PREFIX;
    return { adaptorId, userId, key: `${prefix}:${adaptorId}:${userId}` };
  }

  /**
   * Saves the current tree to disk. Returns `false` when snapshots are off, there
   * is nothing to save, or the content already on disk is the same.
   */
  async persistSnapshot(): Promise<boolean> {
    const config = this.#snapshotConfig;
    const identity = this.#snapshotIdentity();
    if (!config || !identity) return false;
    const snapshot = buildSnapshot(this, identity);
    if (!snapshot) return false;
    const fingerprint = snapshotFingerprint(snapshot);
    if (fingerprint === this.#lastSnapshotFingerprint) return false;
    await config.storage.setItem(identity.key, JSON.stringify(snapshot));
    this.#lastSnapshotKey = identity.key;
    this.#lastSnapshotFingerprint = fingerprint;
    return true;
  }

  /**
   * Restores the tree from disk when the store is empty and a usable snapshot
   * exists for this adaptor and user. Returns `true` when something was restored.
   */
  async hydrateSnapshot(): Promise<boolean> {
    const config = this.#snapshotConfig;
    const identity = this.#snapshotIdentity();
    if (!config || !identity || this.groupStore.groupsList.length > 0) return false;
    const raw = await config.storage.getItem(identity.key);
    if (!raw) return false;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return false;
    }
    if (
      !isSnapshotUsable(parsed, {
        adaptorId: identity.adaptorId,
        userId: identity.userId,
        maxAgeMs: config.maxAgeMs,
        schemaVersion: SNAPSHOT_SCHEMA_VERSION,
      })
    ) {
      return false;
    }
    hydrateSnapshotIntoStore(this, parsed, config.liveTimeoutMs);
    this.#lastSnapshotKey = identity.key;
    // What was just restored is what is on disk: do not write it back.
    this.#lastSnapshotFingerprint = this.#currentSnapshotFingerprint();
    return true;
  }

  /** Deletes the snapshot of the signed-in user (logout, account deletion). */
  async clearSnapshot(): Promise<void> {
    const config = this.#snapshotConfig;
    if (!config) return;
    const key = this.#snapshotIdentity()?.key ?? this.#lastSnapshotKey;
    if (!key) return;
    await config.storage.removeItem(key);
    this.#lastSnapshotKey = null;
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

  /**
   * Releases every entity subscription held by this instance's stores.
   *
   * Each store owns its synchronizer as a private field, so teardown has to be
   * forwarded store by store — there is no way to reach them from outside.
   */
  dispose(): void {
    this.#stopSnapshotPersister?.();
    this.#stopSnapshotPersister = null;
    this.nodeStore.dispose();
    this.groupStore.dispose();
    this.userStore.dispose();
    this.scheduleStore.dispose();
    this.automationStore.dispose();
    this.sceneStore.dispose();
    clearInFlight();
  }

  /**
   * Tears down the singleton so the next {@link initCDF} builds a fresh one.
   *
   * `getInstance` returns the cached instance and ignores the config it is
   * handed, so a host that needs to re-initialise against a DIFFERENT backend
   * (a deployment switch) must clear the singleton first or it silently keeps
   * running on the previous backend's stores.
   */
  static dispose(): void {
    ESPCDF.instance?.dispose();
    ESPCDF.instance = null;
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

/**
 * Disposes the singleton CDF store instance, the counterpart to {@link initCDF}.
 *
 * Safe to call when no instance exists. Call this before re-initialising against
 * a different backend; without it `initCDF` hands back the existing instance and
 * discards the new config.
 */
export const disposeCDF = (): void => {
  ESPCDF.dispose();
};
