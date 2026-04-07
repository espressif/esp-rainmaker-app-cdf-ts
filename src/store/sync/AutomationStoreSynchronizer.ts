/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { ESPCDFAutomation } from "../../entities/ESPCDFAutomation";
import { ESPCDFAutomationEditInput, ESPCDFAutomationOperationType } from "../../types";
import AutomationStore from "../automationStore";

/**
 * Synchronizer for AutomationStore reactive operations
 * Handles all reactive logic for automation operations, keeping AutomationStore as a pure data store
 *
 * This class follows the Mediator pattern - it coordinates between entities and stores
 * without coupling them directly. This maintains SRP (Single Responsibility Principle).
 */
export class AutomationStoreSynchronizer {
  private unsubscribes = new Map<string, () => void>();

  constructor(private automationStore: AutomationStore) { }

  /**
   * Attach an automation entity to the synchronizer
   * Sets up reactive listeners for all automation operations
   * @param automation - The automation entity to attach
   */
  attach(automation: ESPCDFAutomation): void {
    // Clean up previous subscription if re-attaching
    this.detach(automation.id);

    // Subscribe to all automation operations
    const unsubscribe = automation.subscribe(
      (a, operation, success, data, error) => {
        // Only handle successful operations
        if (success) {
          this.handleOperation(a, operation, data);
        } else {
          console.error(
            `[AutomationStoreSynchronizer] Automation operation ${operation} failed:`,
            error
          );
        }
      }
    );

    this.unsubscribes.set(automation.id, unsubscribe);
  }

  /**
   * Detach an automation entity from the synchronizer
   * Removes reactive listeners and cleans up
   * @param id - The identifier of the automation to detach
   */
  detach(id: string): void {
    const unsubscribe = this.unsubscribes.get(id);
    if (unsubscribe) {
      unsubscribe();
      this.unsubscribes.delete(id);
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
   * Handle automation operation events and update stores accordingly
   * This is where all reactive business logic lives - not in the stores themselves
   */
  private handleOperation(
    automation: ESPCDFAutomation,
    operation: ESPCDFAutomationOperationType,
    data?: any
  ): void {
    const id = automation.id;

    switch (operation) {
      case "delete": {
        // Remove automation from store after successful deletion
        if (id) {
          this.automationStore.removeAutomation(id);
        }
        break;
      }

      case "update": {
        // Update automation properties in store
        // data contains the update payload with properties to update (ESPCDFAutomationEditInput)
        if (data) {
          const updateData = data as ESPCDFAutomationEditInput;

          const update: Partial<ESPCDFAutomation> = {};

          if (updateData.name !== undefined) {
            update.name = updateData.name;
          }
          if (updateData.enabled !== undefined) {
            update.enabled = updateData.enabled;
          }
          if (updateData.retrigger !== undefined) {
            update.retrigger = updateData.retrigger;
          }
          if (updateData.nodeId !== undefined) {
            update.nodeId = updateData.nodeId;
          }
          if (updateData.events !== undefined) {
            update.events = updateData.events;
          }
          if (updateData.actions !== undefined) {
            update.actions = updateData.actions;
          }
          if (updateData.eventOperator !== undefined) {
            update.eventOperator = updateData.eventOperator as any;
          }
          if (updateData.metadata !== undefined) {
            update.metadata = updateData.metadata;
          }
          if (updateData.location !== undefined) {
            update.location = updateData.location;
          }
          if (updateData.region !== undefined) {
            update.region = updateData.region;
          }

          if (Object.keys(update).length > 0) {
            this.automationStore.updateAutomation(id, update);
          }
        }
        break;
      }

      case "enable": {
        // Update enabled state in store
        // data contains the boolean enabled value
        if (typeof data === "boolean") {
          this.automationStore.updateAutomation(id, {
            enabled: data,
          });
        }
        break;
      }

      default:
        break;
    }
  }
}
