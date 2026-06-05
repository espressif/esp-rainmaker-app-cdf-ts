/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { ESPCDFUser } from "../../entities/ESPCDFUser";
import { ESPCDFUserOperationType } from "../../types";
import UserStore from "../userStore";
import GroupStore from "../groupStore";
import NodeStore from "../nodeStore";
import AutomationStore from "../automationStore";
import ScheduleStore from "../scheduleStore";
import SceneStore from "../sceneStore";

/**
 * Synchronizer for UserStore reactive operations
 * Handles all reactive logic for user operations, keeping UserStore as a pure data store
 *
 * This class follows the Mediator pattern - it coordinates between entities and stores
 * without coupling them directly. This maintains SRP (Single Responsibility Principle).
 */
export class UserStoreSynchronizer {
  private unsubscribes = new Map<string, () => void>();

  constructor(
    private userStore: UserStore,
    private groupStore: GroupStore,
    private nodeStore: NodeStore,
    private automationStore: AutomationStore,
    private scheduleStore: ScheduleStore,
    private sceneStore: SceneStore,
  ) { }

  /**
   * Attach a user entity to the synchronizer
   * Sets up reactive listeners for all user operations
   * @param user - The user entity to attach
   */
  attach(user: ESPCDFUser): void {
    // Clean up previous subscription if re-attaching
    this.detach(user.identifier);

    // Subscribe to all user operations
    const unsubscribe = user.subscribe((u, operation, success, data, error) => {
      // Only handle successful operations
      if (success) {
        this.handleOperation(u, operation, data);
      } else {
        console.error(
          `[UserStoreSynchronizer] Operation ${operation} failed:`,
          error
        );
      }
    });

    this.unsubscribes.set(user.identifier, unsubscribe);
  }

  /**
   * Detach a user entity from the synchronizer
   * Removes reactive listeners and cleans up
   * @param userId - The identifier of the user to detach
   */
  detach(userId: string): void {
    const unsubscribe = this.unsubscribes.get(userId);
    if (unsubscribe) {
      unsubscribe();
      this.unsubscribes.delete(userId);
    }
  }

  /**
   * Dispose all subscriptions and clean up
   */
  dispose(): void {
    this.unsubscribes.forEach((unsubscribe) => unsubscribe());
    this.unsubscribes.clear();
  }

  /**
   * Handle user operation events and update stores accordingly
   * This is where all reactive business logic lives - not in the stores themselves
   */
  private handleOperation(
    user: ESPCDFUser,
    operation: ESPCDFUserOperationType,
    data?: any
  ): void {
    switch (operation) {
      case "getUserInfo":
      case "updateUserInfo":
      case "updateName":
        // Update user info in store
        this.userStore.setUserInfo(user, data);
        break;

      case "getCustomData":
        // Update custom data when fetched - replace entirely, don't merge
        if (data) {
          const storeUser =
            this.userStore.adaptorAuthorizationEntityMap?.[user.identifier];
          if (storeUser) {
            storeUser.customData = data;
          }
        }
        break;

      case "setCustomData":
        // Update custom data when set
        if (data) {
          this.userStore.setCustomData(user, data);
        }
        break;

      case "confirmAccountDeletion":
      case "logout":
        // Clear all stores and remove user
        this.groupStore.clear();
        this.nodeStore.clear();
        this.automationStore.clear();
        this.scheduleStore.clear();
        this.sceneStore.clear();
        this.userStore.removeUser(user.identifier);
        break;

      case "createGroup":
        // Add newly created group to store
        if (data) {
          this.groupStore.addGroup(data);
        }
        break;

      case "createFabric":
        // Add newly created Matter fabric to store (ESPRMFabric → ESPCDFGroup)
        if (data) {
          this.groupStore.addGroup(data);
        }
        break;

      case "getIssuedGroupSharingRequests":
        // Process issued group sharing requests
        if (data) {
          this.groupStore.processIssuedGroupSharingRequestsRes(
            data,
            user.identifier
          );
        }
        break;

      case "getReceivedGroupSharingRequests":
        // Process received group sharing requests
        if (data) {
          this.groupStore.processReceivedGroupSharingRequestsRes(
            data,
            user.identifier
          );
        }
        break;

      case "getGroups":
        // Process groups response
        if (data) {
          this.groupStore.processGetGroupsRes(data, user.identifier);
        }
        break;
      case "getNodeDetails":
        // Process node details response
        if (data) {
          this.nodeStore.addNode(data);
        }
        break;

      // Operations that don't require store updates
      case "changePassword":
      case "requestAccountDeletion":
      case "registerForNotification":
      case "unregisterForNotification":
      case "removeGroupSharingRequest":
      case "setTimeZone":
        // These operations don't affect store state
        break;


      default:
        break;
    }
  }
}
