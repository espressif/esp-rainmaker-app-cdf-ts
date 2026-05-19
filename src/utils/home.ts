/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  GROUP_TYPE_HOME,
  DEFAULT_HOME_GROUP_NAME,
  REJECTED_STATUS,
  FULFILLED_STATUS,
  NODE_TYPE,
} from "./constants";
import type { ESPCDFGroup, ESPCDFUser, ESPCDFNode } from "../entities";
import type { ESPCDFCreateGroupRequest } from "../types/entities/user";

function getRandom4DigitString(): string {
  return Math.floor(Math.random() * 10000).toString().padStart(4, "0");
}

/**
 * Checks if a group is a valid home group (type home and mutuallyExclusive).
 */
export function isHome(group: ESPCDFGroup): boolean {
  return group.type === GROUP_TYPE_HOME && group.mutuallyExclusive === true;
}

/**
 * Returns only valid home groups from a list.
 */
export function getValidHomes(groups: ESPCDFGroup[]): ESPCDFGroup[] {
  return groups.filter(isHome);
}

/**
 * Finds a home by preferredId, then preferredName, then first valid home.
 */
export function findHomeGroup(
  groups: ESPCDFGroup[],
  options?: { preferredId?: string | null; preferredName?: string | null }
): ESPCDFGroup | null {
  if (options?.preferredId) {
    const g = groups.find((x) => x.id === options.preferredId);
    if (g) return g;
  }
  if (options?.preferredName) {
    const name = options.preferredName.trim().toLowerCase();
    const g = groups.find(
      (x) => (x.name?.trim().toLowerCase() ?? "") === name
    );
    if (g) return g;
  }
  return groups.find(isHome) ?? null;
}

/**
 * Finds a group by id, recursing into subGroups.
 */
export function findGroupById(
  groups: ESPCDFGroup[],
  groupId: string
): ESPCDFGroup | undefined {
  for (const g of groups) {
    if (g.id === groupId) return g;
    if (g.subGroups?.length) {
      const found = findGroupById(g.subGroups, groupId);
      if (found) return found;
    }
  }
  return undefined;
}

function getHomesNeedingMutualExclusiveUpdate(
  groups: ESPCDFGroup[]
): ESPCDFGroup[] {
  return groups.filter(
    (g) => g.type === GROUP_TYPE_HOME && g.mutuallyExclusive === false
  );
}

/**
 * Ensures all home groups have mutuallyExclusive set to true (updates via API).
 */
export async function ensureHomesAreMutuallyExclusive(
  groups: ESPCDFGroup[],
  needManualUpdate = false
): Promise<void> {
  const toUpdate = getHomesNeedingMutualExclusiveUpdate(groups);
  if (toUpdate.length === 0) return;
  const results = await Promise.allSettled(
    toUpdate.map((g) => g?.updateGroupInfo?.({ mutuallyExclusive: true }))
  );
  results.forEach((r, i) => {
    if (r.status === REJECTED_STATUS) {
      console.error(`Failed to update group ${toUpdate[i].id}`, (r as PromiseRejectedResult).reason);
    }
    if (needManualUpdate && r.status === FULFILLED_STATUS) {
      toUpdate[i].mutuallyExclusive = true;
    }
  });
}

/**
 * Splits groups into primary (isPrimaryUser) and shared.
 */
export function categorizeGroupsByOwnership(groups: ESPCDFGroup[]): {
  primaryGroups: ESPCDFGroup[];
  sharedGroups: ESPCDFGroup[];
} {
  const primaryGroups: ESPCDFGroup[] = [];
  const sharedGroups: ESPCDFGroup[] = [];
  for (const g of groups) {
    if (g.isPrimaryUser === true) primaryGroups.push(g);
    else sharedGroups.push(g);
  }
  return { primaryGroups, sharedGroups };
}

/**
 * Returns a unique default home name (Home, Home 1, Home 2, ... or fallback with random suffix).
 */
export function getUniqueDefaultHomeName(
  existingGroups: ESPCDFGroup[]
): string {
  const names = new Set(
    (existingGroups ?? []).map((g) => (g.name?.trim().toLowerCase() ?? ""))
  );
  const base = DEFAULT_HOME_GROUP_NAME.trim().toLowerCase();
  if (!names.has(base)) return DEFAULT_HOME_GROUP_NAME;
  for (let i = 1; i < 1000; i++) {
    const candidate = `${DEFAULT_HOME_GROUP_NAME} ${i}`;
    if (!names.has(candidate.trim().toLowerCase())) return candidate;
  }
  return `${DEFAULT_HOME_GROUP_NAME}_${getRandom4DigitString()}`;
}

/**
 * Builds a create-group payload for a home.
 */
export function createHomePayload(nodeIds: string[] = []): ESPCDFCreateGroupRequest {
  return {
    name: DEFAULT_HOME_GROUP_NAME,
    type: GROUP_TYPE_HOME,
    mutuallyExclusive: true,
    nodeIds,
    description: "",
    customData: {},
  };
}

/**
 * Creates a default home with a unique name (new user or migration).
 */
export async function ensureDefaultHomeForNewOrMigratedUser(
  user: ESPCDFUser | null,
  nodeIds: string[],
  existingGroups: ESPCDFGroup[]
): Promise<ESPCDFGroup> {
  if (!user) throw new Error("User is required");
  const name = getUniqueDefaultHomeName(existingGroups);
  const payload = createHomePayload(nodeIds);
  payload.name = name;
  const group = await user.createGroup(payload);
  return group;
}

/**
 * Returns node IDs that are not assigned to any group and not matter types.
 */
export function getUnassignedNodes(
  allNodes: ESPCDFNode[],
  groups: ESPCDFGroup[]
): string[] {
  const assigned = new Set(groups.flatMap((g) => g.nodeIds ?? []));
  return allNodes
    .filter((n) => {
      if (assigned.has(n.id)) return false;
      const t = n.type;
      return t !== NODE_TYPE.PURE_MATTER && t !== NODE_TYPE.RAINMAKER_MATTER;
    })
    .map((n) => n.id);
}

/**
 * Fetches nodes for a group if nodeDetails is empty.
 */
export async function fetchNodesIfEmpty(
  group: ESPCDFGroup | null
): Promise<void> {
  if (!group) return;
  if (!group.nodeDetails || group.nodeDetails.length === 0) {
    try {
      await group.getNodes();
    } catch (e) {
      console.error(`Failed to fetch nodes for group ${group.id}:`, e);
    }
  }
}

async function fetchNodesForHomeAndRooms(home: ESPCDFGroup | null): Promise<void> {
  if (!home) return;
  await fetchNodesIfEmpty(home);
  if (home.subGroups?.length) {
    await Promise.allSettled(
      home.subGroups.map((room) =>
        fetchNodesIfEmpty(room).catch((e) =>
          console.error(`Failed to fetch nodes for room ${room.id}:`, e)
        )
      )
    );
  }
}

/**
 * Fetches nodes for all given homes and their rooms (fire-and-forget friendly).
 */
export async function fetchNodesForAllValidHomes(
  validHomes: ESPCDFGroup[]
): Promise<void> {
  if (!validHomes?.length) return;
  await Promise.allSettled(
    validHomes.map((home) =>
      fetchNodesForHomeAndRooms(home).catch((e) =>
        console.error(`Failed to fetch nodes for home ${home.id}:`, e)
      )
    )
  );
}

