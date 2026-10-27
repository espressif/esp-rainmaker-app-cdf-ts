/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { runInAction } from "mobx";
import { ESPCDFGroup } from "../entities/ESPCDFGroup";
import { ESPCDFNode } from "../entities/ESPCDFNode";
import { ESPCDFSnapshotError } from "../errors/snapshot";
import type { ESPCDF } from "../store/index";
import type {
  ESPCDFDeviceInterface,
  ESPCDFDeviceOperation,
  ESPCDFDeviceParamInterface,
  ESPCDFDeviceParamOperation,
  ESPCDFGroupOperation,
  ESPCDFNodeOperation,
  ESPCDFServiceInterface,
  ESPCDFServiceOperation,
  ESPCDFServiceParamInterface,
  ESPCDFServiceParamOperation,
} from "../types";
import { findGroupById } from "../utils/home";

/**
 * Disk snapshot of the home tree (C3 of the caching design).
 *
 * What is saved is an allow-list of plain fields: group tree and membership,
 * node config, device and service params with their last value (so schedules,
 * scenes and the time zone restore with the tree), and connectivity as
 * "last seen". Never saved: `_raw`, `operations`, transports, fabric details.
 *
 * What is restored are real entities whose `operations` wait for the first
 * live sync and then forward to the live adaptor, so the first screen can paint
 * from disk and controls still work after a short wait.
 *
 * Follow-up (offline support): move local-control credentials (the service
 * param values of `esp.service.local_control`) to OS secure storage and let
 * restored operations route locally before the first live sync.
 */

export const SNAPSHOT_SCHEMA_VERSION = 1;
export const SNAPSHOT_DEFAULT_KEY_PREFIX = "espcdf.snapshot";
export const SNAPSHOT_DEFAULT_LIVE_TIMEOUT_MS = 15_000;
export const SNAPSHOT_DEFAULT_PERSIST_DELAY_MS = 1_500;

export interface ESPCDFSnapshotParam {
  name: string;
  value?: unknown;
  properties?: string[];
  dataType?: string;
  type?: string;
  bounds?: Record<string, unknown>;
  uiType?: string;
}

export interface ESPCDFSnapshotDevice {
  name: string;
  displayName?: string;
  type?: string;
  attributes?: { name: string; value?: unknown }[];
  params: ESPCDFSnapshotParam[];
}

export interface ESPCDFSnapshotService {
  name: string;
  type: string;
  params: ESPCDFSnapshotParam[];
}

export interface ESPCDFSnapshotNode {
  identifier: string;
  id: string;
  type?: string;
  isPrimaryUser?: boolean;
  connectivityStatus?: { isConnected: boolean; lastConnectionTimestamp: number };
  nodeConfig?: {
    configVersion: string;
    attributes?: { name: string; value?: unknown }[];
    info?: Record<string, unknown>;
  };
  devices: ESPCDFSnapshotDevice[];
  services: ESPCDFSnapshotService[];
  metadata?: Record<string, unknown>;
  tags?: string[];
  role?: string;
  transportOrder?: string[];
  isMatter?: boolean;
  nodeType?: string;
}

export interface ESPCDFSnapshotGroup {
  identifier: string;
  id: string;
  name: string;
  type?: string;
  parentId?: string;
  nodeIds: string[];
  mutuallyExclusive?: boolean;
  isPrimaryUser?: boolean;
  accessType?: string;
  totalNodes?: number;
  description?: string;
  metadata?: Record<string, unknown>;
  customData?: Record<string, unknown>;
  isMatter?: boolean;
  fabricId?: string;
  subGroups: ESPCDFSnapshotGroup[];
}

export interface ESPCDFSnapshot {
  version: number;
  savedAt: number;
  adaptorId: string;
  /** `userInfo.id` of the signed-in user at save time; also part of the storage key. */
  userId: string;
  currentHomeId: string | null;
  groups: ESPCDFSnapshotGroup[];
  nodes: ESPCDFSnapshotNode[];
}

/** Plain JSON copy of a (possibly observable) value. */
function toPlain<T>(value: T): T {
  if (value === undefined || value === null) return value;
  return JSON.parse(JSON.stringify(value)) as T;
}

function serializeParam(param: ESPCDFDeviceParamInterface | ESPCDFServiceParamInterface): ESPCDFSnapshotParam {
  return {
    name: param.name,
    value: toPlain(param.value),
    properties: toPlain(param.properties),
    dataType: param.dataType,
    type: param.type,
    bounds: toPlain(param.bounds),
    uiType: (param as ESPCDFDeviceParamInterface).uiType,
  };
}

function serializeGroup(group: ESPCDFGroup): ESPCDFSnapshotGroup {
  return {
    identifier: group.identifier,
    id: group.id,
    name: group.name,
    type: group.type,
    parentId: group.parentId,
    nodeIds: [...(group.nodeIds ?? [])],
    mutuallyExclusive: group.mutuallyExclusive,
    isPrimaryUser: group.isPrimaryUser,
    accessType: group.accessType,
    totalNodes: group.totalNodes,
    description: group.description,
    metadata: toPlain(group.metadata),
    customData: toPlain(group.customData),
    isMatter: group.isMatter,
    fabricId: group.fabricId,
    subGroups: (group.subGroups ?? []).map(serializeGroup),
  };
}

function serializeNode(node: ESPCDFNode): ESPCDFSnapshotNode {
  return {
    identifier: node.identifier,
    id: node.id,
    type: node.type,
    isPrimaryUser: node.isPrimaryUser,
    connectivityStatus: node.connectivityStatus
      ? {
          isConnected: Boolean(node.connectivityStatus.isConnected),
          lastConnectionTimestamp: node.connectivityStatus.lastConnectionTimestamp,
        }
      : undefined,
    nodeConfig: node.nodeConfig
      ? {
          configVersion: node.nodeConfig.configVersion,
          attributes: toPlain(node.nodeConfig.attributes),
          info: toPlain(node.nodeConfig.info as Record<string, unknown> | undefined),
        }
      : undefined,
    devices: (node.devices ?? []).map((device) => ({
      name: device.name,
      displayName: device.displayName,
      type: device.type,
      attributes: toPlain(device.attributes),
      params: (device.params ?? []).map(serializeParam),
    })),
    services: (node.services ?? []).map((service) => ({
      name: service.name,
      type: service.type,
      params: (service.params ?? []).map(serializeParam),
    })),
    metadata: toPlain(node.metadata),
    tags: toPlain(node.tags),
    role: node.role,
    transportOrder: toPlain(node.transportOrder),
    isMatter: node.isMatter,
    nodeType: node.nodeType,
  };
}

/**
 * Content identity of a snapshot: everything except `savedAt`. Two snapshots with
 * the same fingerprint hold the same tree, so the second write can be skipped.
 */
export function snapshotFingerprint(snapshot: ESPCDFSnapshot | null): string {
  return snapshot ? JSON.stringify({ ...snapshot, savedAt: 0 }) : "";
}

/** Plain, allow-listed copy of the store, or `null` when there is nothing to save. */
export function buildSnapshot(
  store: ESPCDF,
  identity: { adaptorId: string; userId: string }
): ESPCDFSnapshot | null {
  const groups = store.groupStore.groupsList;
  if (groups.length === 0) return null;
  return {
    version: SNAPSHOT_SCHEMA_VERSION,
    savedAt: Date.now(),
    adaptorId: identity.adaptorId,
    userId: identity.userId,
    currentHomeId: store.groupStore.currentHomeId,
    groups: groups.map(serializeGroup),
    nodes: store.nodeStore.nodesList.map(serializeNode),
  };
}

/**
 * Operations for an entity restored from disk. Every call waits for the first
 * live sync (`whenLive`), then forwards to the live entity's operations.
 * Until then nothing is "unavailable": a tap during the first second simply
 * completes once the network answers.
 */
export function createDeferredOperations<T extends object>(
  resolveLive: () => T | undefined,
  whenLive: () => Promise<void>,
  label: string
): T {
  const proxy: T = new Proxy({} as T, {
    get(_target, property) {
      if (typeof property !== "string" || property === "then") return undefined;
      return async (...args: unknown[]) => {
        let live = resolveLive();
        if (!live || live === proxy) {
          await whenLive();
          live = resolveLive();
        }
        if (!live || live === proxy) {
          throw new ESPCDFSnapshotError(
            `${label}.${property}: no live data yet`,
            "SNAPSHOT_NOT_LIVE",
            { label, operation: property }
          );
        }
        const operation = (live as Record<string, unknown>)[property];
        if (typeof operation !== "function") {
          throw new ESPCDFSnapshotError(
            `${label}.${property} is not supported by the active adaptor`,
            "SNAPSHOT_OPERATION_UNAVAILABLE",
            { label, operation: property }
          );
        }
        return (operation as (...a: unknown[]) => unknown).apply(live, args);
      };
    },
  });
  return proxy;
}

/** Rebuilds the stores from a snapshot. The caller validates the snapshot first. */
export function hydrateSnapshotIntoStore(
  store: ESPCDF,
  snapshot: ESPCDFSnapshot,
  liveTimeoutMs = SNAPSHOT_DEFAULT_LIVE_TIMEOUT_MS
): void {
  const whenLive = () => store.groupStore.whenLive(liveTimeoutMs);
  const nodeById = (id: string) => store.nodeStore.getNodeById(id);
  const deviceOf = (nodeId: string, name: string) =>
    nodeById(nodeId)?.devices?.find((device) => device.name === name);
  const serviceOf = (nodeId: string, name: string) =>
    nodeById(nodeId)?.services?.find((service) => service.name === name);

  const nodes = snapshot.nodes.map((entry) => {
    const devices: ESPCDFDeviceInterface[] = entry.devices.map((device) => ({
      name: device.name,
      displayName: device.displayName,
      type: device.type,
      attributes: device.attributes,
      _raw: null,
      operations: createDeferredOperations<ESPCDFDeviceOperation>(
        () => deviceOf(entry.id, device.name)?.operations,
        whenLive,
        `device ${entry.id}/${device.name}`
      ),
      params: device.params.map((param) => ({
        ...param,
        deviceName: device.name,
        _raw: null,
        operations: createDeferredOperations<ESPCDFDeviceParamOperation>(
          () => deviceOf(entry.id, device.name)?.params?.find((p) => p.name === param.name)?.operations,
          whenLive,
          `param ${entry.id}/${device.name}/${param.name}`
        ),
      })),
    }));
    const services: ESPCDFServiceInterface[] = entry.services.map((service) => ({
      name: service.name,
      type: service.type,
      _raw: null,
      operations: createDeferredOperations<ESPCDFServiceOperation>(
        () => serviceOf(entry.id, service.name)?.operations,
        whenLive,
        `service ${entry.id}/${service.name}`
      ),
      params: service.params.map((param) => ({
        ...param,
        type: param.type ?? "",
        serviceName: service.name,
        _raw: null,
        operations: createDeferredOperations<ESPCDFServiceParamOperation>(
          () => serviceOf(entry.id, service.name)?.params?.find((p) => p.name === param.name)?.operations,
          whenLive,
          `param ${entry.id}/${service.name}/${param.name}`
        ),
      })),
    }));
    return new ESPCDFNode({
      identifier: entry.identifier,
      id: entry.id,
      type: entry.type,
      isPrimaryUser: entry.isPrimaryUser,
      connectivityStatus: entry.connectivityStatus,
      nodeConfig: entry.nodeConfig
        ? {
            configVersion: entry.nodeConfig.configVersion,
            attributes: entry.nodeConfig.attributes,
            info: entry.nodeConfig.info as ESPCDFNode["nodeConfig"] extends infer C
              ? C extends { info?: infer I }
                ? I
                : never
              : never,
          }
        : undefined,
      devices,
      services,
      metadata: entry.metadata,
      tags: entry.tags,
      role: entry.role,
      transportOrder: entry.transportOrder ?? [],
      availableTransports: {},
      isMatter: entry.isMatter,
      nodeType: entry.nodeType,
      _raw: null,
      operations: createDeferredOperations<ESPCDFNodeOperation>(
        () => nodeById(entry.id)?.operations,
        whenLive,
        `node ${entry.id}`
      ),
    });
  });

  const groupById = (id: string) => findGroupById(store.groupStore.groupsList, id);
  const buildGroup = (entry: ESPCDFSnapshotGroup): ESPCDFGroup =>
    new ESPCDFGroup({
      identifier: entry.identifier,
      id: entry.id,
      name: entry.name,
      type: entry.type,
      parentId: entry.parentId,
      nodeIds: [...entry.nodeIds],
      nodeDetails: [],
      mutuallyExclusive: entry.mutuallyExclusive,
      isPrimaryUser: entry.isPrimaryUser,
      accessType: entry.accessType,
      totalNodes: entry.totalNodes,
      description: entry.description,
      metadata: entry.metadata,
      customData: entry.customData,
      isMatter: entry.isMatter,
      fabricId: entry.fabricId,
      subGroups: entry.subGroups.map(buildGroup),
      _raw: null,
      operations: createDeferredOperations<ESPCDFGroupOperation>(
        () => groupById(entry.id)?.operations,
        whenLive,
        `group ${entry.id}`
      ),
    });

  runInAction(() => {
    store.nodeStore.setNodesList(nodes);
    store.groupStore.setGroupsList(snapshot.groups.map(buildGroup));
    const attachDetails = (group: ESPCDFGroup) => {
      group.nodeDetails = (group.nodeIds ?? [])
        .map(nodeById)
        .filter((node): node is ESPCDFNode => Boolean(node));
      group.subGroups?.forEach(attachDetails);
    };
    store.groupStore.groupsList.forEach(attachDetails);
    store.groupStore.currentHomeId = snapshot.currentHomeId;
    store.groupStore.markSnapshot();
  });
}

/** `true` when a parsed value is a usable snapshot for this adaptor and user. */
export function isSnapshotUsable(
  value: unknown,
  expected: { adaptorId: string; userId: string; maxAgeMs: number; schemaVersion: number }
): value is ESPCDFSnapshot {
  const snapshot = value as Partial<ESPCDFSnapshot> | null;
  if (!snapshot || typeof snapshot !== "object") return false;
  if (snapshot.version !== expected.schemaVersion) return false;
  if (snapshot.adaptorId !== expected.adaptorId) return false;
  if (snapshot.userId !== expected.userId) return false;
  if (typeof snapshot.savedAt !== "number" || Date.now() - snapshot.savedAt > expected.maxAgeMs) return false;
  if (!Array.isArray(snapshot.groups) || !Array.isArray(snapshot.nodes) || snapshot.groups.length === 0) return false;
  return true;
}
