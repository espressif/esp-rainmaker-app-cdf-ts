/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { ESPCDFGroup } from "../../entities/ESPCDFGroup";
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
import { applyRegisteredTransports } from "../../utils/registeredTransports";

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
        this.groupStore.deleteGroup(group);
        break;

      case "updateMetadata":
        // Metadata is already updated in the entity
        break;

      case "updateGroupInfo":
        // GroupInfo is already updated in the entity
        if (data) {
          const groupInfo = data as Record<string, any>;
          this.groupStore.updateGroup(group.id, {
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
        // Subgroup is created, add it to store and parent group's subGroups array
        if (data && data instanceof ESPCDFGroup) {
          const createdSubGroup = data as ESPCDFGroup;
          // Attach the new subgroup to synchronizer
          this.attach(createdSubGroup);
          this.groupStore.updateGroup(group.id, {
            subGroups: [
              ...(this.groupStore.getGroupById(group.id)?.subGroups || []),
              createdSubGroup,
            ],
          });
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

          // Update the group's nodeIds array immediately (optimistic update)
          if (this.groupStore.groupsByIDMap[group.id]) {
            const currentNodeIds = this.groupStore.groupsByIDMap[group.id].nodeIds || [];
            const newNodeIds = nodeIds.filter(id => !currentNodeIds.includes(id));
            if (newNodeIds.length > 0) {
              this.groupStore.groupsByIDMap[group.id].nodeIds = [
                ...currentNodeIds,
                ...newNodeIds
              ];
            }
          }

          // Get the user from rootStore to fetch node details
          const user = this.rootStore?.userStore?.adaptorAuthorizationEntityMap?.[
            Object.keys(this.rootStore?.userStore?.adaptorAuthorizationEntityMap || {})[0]
          ];

          if (user) {
            // Fetch all newly added nodes in parallel
            Promise.all(
              nodeIds.map((nodeId) =>
                user.getNodeDetails(nodeId).catch((error: unknown) => {
                  console.error(`[GroupStoreSynchronizer] Failed to fetch node ${nodeId} details:`, error);
                  return null;
                })
              )
            ).then((fetchedNodes) => {
              // Update the group's nodeDetails array with the newly fetched nodes
              const validNodes = fetchedNodes.filter(Boolean);
              if (validNodes.length > 0 && this.groupStore.groupsByIDMap[group.id]) {
                const existingNodes = this.groupStore.groupsByIDMap[group.id].nodeDetails || [];
                const existingNodeIds = new Set(existingNodes.map(n => n.id));
                const newNodes = validNodes.filter(n => !existingNodeIds.has(n.id));
                this.groupStore.groupsByIDMap[group.id].nodeDetails = [
                  ...existingNodes,
                  ...newNodes
                ];
              }
            });
          }
        }
        break;

      case "removeNodes":
        // Nodes are already updated in the entity
        break;

      case "leave":
        // Group should be removed from store
        this.groupStore.deleteGroup(group);
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
  private syncGroupNodes(group: ESPCDFGroup, nodes: ESPCDFNode[]): void {
    const nodeStore = this.rootStore?.nodeStore;
    const registered =
      this.rootStore?.subscriptionStore.getRegisteredTransportsSnapshot() ??
      {};
    const merged =
      nodeStore?.nodesByIDMap != null
        ? nodes.map((node) => applyRegisteredTransports(node, registered))
        : nodes;
    nodeStore?.setNodesList?.(merged);
    const stored = this.groupStore.groupsByIDMap[group.id];
    if (stored) {
      stored.nodeDetails = merged.map(
        (node) => nodeStore?.getNodeById(node.id) ?? node,
      );
    }
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
