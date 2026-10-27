/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { ESPCDFGroup } from "../../entities/ESPCDFGroup";
import { runInAction } from "mobx";
import {
  ESPCDFGroupOperationType,
  ESPCDFGroupSharingRequestOperationType,
  ESPCDFGroupSharingStatus,
  ESPCDFMatterFabricDetails,
} from "../../types";
import GroupStore from "../groupStore";
import { ESPCDFNode } from "../../entities/ESPCDFNode";
import { ESPCDFScene } from "../../entities/ESPCDFScene";
import { ESPCDFSchedule } from "../../entities/ESPCDFSchedule";
import { ESPCDFAutomation } from "../../entities/ESPCDFAutomation";
import { ESPCDFGroupSharingRequest } from "../../entities/ESPCDFGroupSharingRequest";

/**
 * Synchronizer for GroupStore reactive operations
 * Handles all reactive logic for group operations, keeping GroupStore as a pure data store
 *
 * This class follows the Mediator pattern - it coordinates between entities and stores
 * without coupling them directly. This maintains SRP (Single Responsibility Principle).
 */
export class GroupStoreSynchronizer {
  private unsubscribes = new Map<string, () => void>();
  private groupSharingRequestUnsubscribes = new Map<string, () => void>();

  constructor(
    private groupStore: GroupStore,
    private rootStore: any
  ) { }

  /**
   * Attach a group entity to the synchronizer
   * Sets up reactive listeners for all group operations
   * @param group - The group entity to attach
   */
  attach(group: ESPCDFGroup): void {
    // Clean up previous subscription if re-attaching
    this.detach(group.id);

    // Subscribe to all group operations
    const unsubscribe = group.subscribe(
      (g, operation, success, data, error) => {
        // Only handle successful operations
        if (success) {
          this.handleOperation(g, operation, data);
          this.rootStore?.markTreeChanged?.();
        } else {
          console.error(
            `[GroupStoreSynchronizer] Operation ${operation} failed:`,
            error
          );
        }
      }
    );

    this.unsubscribes.set(group.id, unsubscribe);

    // Also attach all subGroups recursively
    if (group.subGroups) {
      group.subGroups.forEach((subGroup) => {
        this.attach(subGroup);
      });
    }
  }

  /**
   * Detach a group entity from the synchronizer
   * Removes reactive listeners and cleans up
   * @param groupId - The identifier of the group to detach
   */
  detach(groupId: string): void {
    const unsubscribe = this.unsubscribes.get(groupId);
    if (unsubscribe) {
      unsubscribe();
      this.unsubscribes.delete(groupId);
    }
  }

  /**
   * Attach a group sharing request entity to the synchronizer
   * Sets up reactive listeners for all group sharing request operations
   * @param request - The group sharing request entity to attach
   * @param type - Whether this is an 'issued' or 'received' request
   */
  attachGroupSharingRequest(
    request: ESPCDFGroupSharingRequest,
    type: "issued" | "received"
  ): void {
    // Clean up previous subscription if re-attaching
    this.detachGroupSharingRequest(request.id);

    // Subscribe to all group sharing request operations
    const unsubscribe = request.subscribe(
      (r, operation, success, data, error) => {
        // Only handle successful operations
        if (success) {
          this.handleGroupSharingRequestOperation(r, operation, data, type);
        } else {
          console.error(
            `[GroupStoreSynchronizer] Group sharing request operation ${operation} failed:`,
            error
          );
        }
      }
    );

    this.groupSharingRequestUnsubscribes.set(request.id, unsubscribe);
  }

  /**
   * Detach a group sharing request entity from the synchronizer
   * Removes reactive listeners and cleans up
   * @param requestId - The identifier of the group sharing request to detach
   */
  detachGroupSharingRequest(requestId: string): void {
    const unsubscribe = this.groupSharingRequestUnsubscribes.get(requestId);
    if (unsubscribe) {
      unsubscribe();
      this.groupSharingRequestUnsubscribes.delete(requestId);
    }
  }

  /**
   * Dispose all subscriptions and clean up
   */
  dispose(): void {
    this.unsubscribes.forEach((unsubscribe) => unsubscribe());
    this.unsubscribes.clear();
    this.groupSharingRequestUnsubscribes.forEach((unsubscribe) =>
      unsubscribe()
    );
    this.groupSharingRequestUnsubscribes.clear();
  }

  /**
   * Handle group operation events and update stores accordingly
   * This is where all reactive business logic lives - not in the stores themselves
   */
  private handleOperation(
    group: ESPCDFGroup,
    operation: ESPCDFGroupOperationType,
    data?: any
  ): void {
    switch (operation) {
      case "delete":
        // The store is correct once the group is gone; no refetch is needed.
        this.groupStore.deleteGroup(group);
        if (!group.parentId) {
          this.pruneNodesOfRemovedHome(group);
        }
        break;

      case "updateMetadata":
        if (data) {
          runInAction(() => {
            group.metadata = data as Record<string, any>;
          });
        }
        break;

      case "updateGroupInfo":
        // Applied to the store's instance, found by walking the tree, so a room
        // rename shows at once (rooms are not top-level entries).
        if (data) {
          const groupInfo = data as Record<string, any>;
          this.groupStore.patchGroup(group.id, {
            ...(groupInfo.groupName && { name: groupInfo.groupName }),
            ...(groupInfo.description && {
              description: groupInfo.description,
            }),
            ...(groupInfo.customData !== undefined && {
              customData: groupInfo.customData,
            }),
            ...(groupInfo.groupMetaData !== undefined && {
              metadata: groupInfo.groupMetaData,
            }),
            ...(groupInfo.mutuallyExclusive !== undefined && {
              mutuallyExclusive: groupInfo.mutuallyExclusive,
            }),
            ...(groupInfo.type !== undefined && { type: groupInfo.type }),
          });
        }
        break;

      case "createSubGroup":
        // The store adopts the new room (observable, attached) under its parent.
        if (data && data instanceof ESPCDFGroup) {
          this.groupStore.addSubGroup(group.id, data);
        }
        break;

      case "createScene":
        if (data && data.id) {
          const scene = data as ESPCDFScene;
          this.rootStore?.sceneStore?.addScene?.(scene);
        }
        break;

      case "getScenes":
        // Add all scenes to sceneStore
        if (data && Array.isArray(data)) {
          const scenes = data as ESPCDFScene[];
          scenes.forEach((scene) => {
            if (scene && scene.id) {
              this.rootStore?.sceneStore?.addScene?.(scene);
            }
          });
        }
        break;

      case "getSceneCapableDevices":
        // Read-only: scene-capable device rows derived from group.nodeDetails; no store sync
        break;

      case "getScheduleCapableDevices":
        // Read-only: schedule-capable device rows derived from group.nodeDetails; no store sync
        break;

      case "createSchedule":
        if (data && data.id) {
          const schedule = data as ESPCDFSchedule;
          this.rootStore?.scheduleStore?.addSchedule?.(schedule);
        }
        break;

      case "getSchedules":
        // Add all schedules to scheduleStore
        if (data && Array.isArray(data)) {
          const schedules = data as ESPCDFSchedule[];
          schedules.forEach((schedule) => {
            if (schedule && schedule.id) {
              this.rootStore?.scheduleStore?.addSchedule?.(schedule);
            }
          });
        }
        break;

      case "createAutomation":
        if (data && data.id) {
          const automation = data as ESPCDFAutomation;
          this.rootStore?.automationStore?.addAutomation?.(automation);
        }
        break;

      case "getAutomations":
        if (data) {
          const paginatedResponse = data;
          this.rootStore?.automationStore?.clear();
          this.rootStore?.automationStore?.processAutomationsRes?.(
            paginatedResponse,
            group.identifier,
          );
        }
        break;

      case "getNodes":
        if (data && Array.isArray(data)) {
          this.syncGroupNodes(group, data as ESPCDFNode[]);
        }
        break;

      case "convertToMatterFabric":
        this.applyFabricGroupUpdate(group, data);
        break;

      case "getFabricDetails":
        if (data) {
          this.groupStore.updateGroup(group.id, {
            fabricDetails: data as ESPCDFMatterFabricDetails,
          });
        }
        break;

      case "getNodesWithDetails":
        if (data && Array.isArray(data)) {
          this.syncGroupNodes(group, data as ESPCDFNode[]);
        }
        break;

      case "issueUserNoC":
      case "issueNodeNoC":
      case "startCommissioning":
        // No group map mutation; commissioning handles / certs are consumed by the app layer
        break;

      case "addNodes":
        // After adding nodes, fetch only the newly added node details (more efficient than fetching all nodes)
        if (data && Array.isArray(data)) {
          const nodeIds = data as string[];

          // Update the group's nodeIds array immediately (optimistic update).
          // `group` is the store instance for homes and rooms alike.
          runInAction(() => {
            const currentNodeIds = group.nodeIds || [];
            const newNodeIds = nodeIds.filter((id) => !currentNodeIds.includes(id));
            if (newNodeIds.length > 0) {
              group.nodeIds = [...currentNodeIds, ...newNodeIds];
            }
          });

          // Nodes already in memory (the usual case: moved between rooms of the
          // same home) are linked at once; only unknown ones are fetched.
          const nodeStore = this.rootStore?.nodeStore;
          const known = nodeIds
            .map((nodeId) => nodeStore?.getNodeById(nodeId))
            .filter((node): node is ESPCDFNode => Boolean(node));
          if (known.length > 0) {
            runInAction(() => {
              const existingIds = new Set((group.nodeDetails || []).map((n) => n.id));
              group.nodeDetails = [
                ...(group.nodeDetails || []),
                ...known.filter((node) => !existingIds.has(node.id)),
              ];
            });
          }
          const unknownIds = nodeIds.filter((nodeId) => !nodeStore?.getNodeById(nodeId));

          // Get the user from rootStore to fetch node details
          const user = this.rootStore?.userStore?.adaptorAuthorizationEntityMap?.[
            Object.keys(this.rootStore?.userStore?.adaptorAuthorizationEntityMap || {})[0]
          ];

          if (user && unknownIds.length > 0) {
            // Fetch the nodes the store does not hold yet, in parallel
            Promise.all(
              unknownIds.map((nodeId) =>
                user.getNodeDetails(nodeId).catch((error: unknown) => {
                  console.error(`[GroupStoreSynchronizer] Failed to fetch node ${nodeId} details:`, error);
                  return null;
                })
              )
            ).then((fetchedNodes) => {
              // Append the newly fetched nodes to the group's nodeDetails
              const validNodes = fetchedNodes.filter(Boolean) as ESPCDFNode[];
              if (validNodes.length > 0) {
                runInAction(() => {
                  const existingNodes = group.nodeDetails || [];
                  const existingNodeIds = new Set(existingNodes.map((n) => n.id));
                  const newNodes = validNodes.filter((n) => !existingNodeIds.has(n.id));
                  group.nodeDetails = [...existingNodes, ...newNodes];
                });
              }
            });
          }
        }
        break;

      case "removeNodes":
        if (data && Array.isArray(data)) {
          const removedIds = new Set(data as string[]);
          runInAction(() => {
            group.nodeIds = (group.nodeIds || []).filter((id) => !removedIds.has(id));
            group.nodeDetails = (group.nodeDetails || []).filter(
              (node) => !removedIds.has(node.id)
            );
          });
        }
        break;

      case "leave":
        // Group should be removed from store
        this.groupStore.deleteGroup(group);
        if (!group.parentId) {
          this.pruneNodesOfRemovedHome(group);
        }
        break;

      // Operations that don't require store updates
      case "share":
      case "removeSharingFor":
      case "transfer":
      case "getSharingInfo":
      case "getSubGroups":
      case "setParams":
        // These operations don't affect store state
        break;

      default:
        break;
    }

  }

  /**
   * Merges node list into nodeStore and the group's {@link ESPCDFGroup.nodeDetails}.
   */
  /**
   * Drops the nodes of a home that was deleted or left, unless another home
   * still lists them, so they do not linger in memory or in the snapshot.
   */
  private pruneNodesOfRemovedHome(home: ESPCDFGroup): void {
    const nodeStore = this.rootStore?.nodeStore;
    if (!nodeStore) return;
    const collect = (group: ESPCDFGroup, into: Set<string>): Set<string> => {
      (group.nodeIds ?? []).forEach((id) => into.add(id));
      group.subGroups?.forEach((sub) => collect(sub, into));
      return into;
    };
    const stillReferenced = new Set<string>();
    this.groupStore.groupsList.forEach((remaining) => collect(remaining, stillReferenced));
    for (const nodeId of collect(home, new Set<string>())) {
      if (!stillReferenced.has(nodeId) && nodeStore.getNodeById(nodeId)) {
        nodeStore.deleteNode(nodeId);
      }
    }
  }

  /** Fetched nodes land through the store, which also fills the home's rooms. */
  private syncGroupNodes(group: ESPCDFGroup, nodes: ESPCDFNode[]): void {
    this.groupStore.attachNodesToGroup(group.id, nodes);
  }

  /**
   * After {@link ESPCDFGroup.convertToMatterFabric}, replace or patch the store entry
   * with the SDK fabric group (same id, updated {@link isMatter}, {@link fabricId}, operations).
   */
  private applyFabricGroupUpdate(group: ESPCDFGroup, data?: unknown): void {
    if (!data) {
      return;
    }

    if (data instanceof ESPCDFGroup) {
      const converted = data;
      if (converted.id !== group.id) {
        this.groupStore.addGroup(converted);
        return;
      }
      if (this.groupStore.getGroupById(group.id)) {
        this.groupStore.replaceGroup(group.id, converted);
      } else {
        this.groupStore.addGroup(converted);
      }
      return;
    }

    if (typeof data === "object") {
      const patch = data as Record<string, unknown>;
      this.groupStore.updateGroup(group.id, {
        ...(patch.isMatter !== undefined && {
          isMatter: Boolean(patch.isMatter),
        }),
        ...(patch.fabricId !== undefined && {
          fabricId: String(patch.fabricId),
        }),
        ...(patch.fabricDetails !== undefined && {
          fabricDetails: patch.fabricDetails as ESPCDFMatterFabricDetails,
        }),
      });
    }
  }

  /**
   * Handle group sharing request operation events and update stores accordingly
   * This is where all reactive business logic lives - not in the stores themselves
   */
  private handleGroupSharingRequestOperation(
    request: ESPCDFGroupSharingRequest,
    operation: ESPCDFGroupSharingRequestOperationType,
    data?: any,
    type: "issued" | "received" = "issued"
  ): void {
    switch (operation) {
      case "accept":
        // Status is already updated in the entity
        if (data) {
          request.status = ESPCDFGroupSharingStatus.accepted;
        }
        break;

      case "decline":
        // Status is already updated in the entity
        if (data) {
          request.status = ESPCDFGroupSharingStatus.rejected;
        }
        break;

      case "remove":
        // Remove request from store
        if (type === "issued") {
          const requestToRemove =
            this.groupStore.issuedGroupSharingRequestsByIDMap[request.id];
          if (requestToRemove) {
            this.detachGroupSharingRequest(request.id);
            delete this.groupStore.issuedGroupSharingRequestsByIDMap[
              request.id
            ];
          }
        } else {
          const requestToRemove =
            this.groupStore.receivedGroupSharingRequestsByIDMap[request.id];
          if (requestToRemove) {
            this.detachGroupSharingRequest(request.id);
            delete this.groupStore.receivedGroupSharingRequestsByIDMap[
              request.id
            ];
          }
        }
        break;

      default:
        break;
    }

  }
}
