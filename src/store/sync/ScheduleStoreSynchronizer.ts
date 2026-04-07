/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { ESPCDFSchedule } from "../../entities/ESPCDFSchedule";
import { ESPCDFService } from "../../entities/ESPCDFService";
import { ESPCDFScheduleOperationType } from "../../types";
import ScheduleStore from "../scheduleStore";
import {
  ESPRM_SERVICE_SCHEDULES,
  ESPRM_PARAM_SCHEDULES,
  ScheduleOperation,
  SUCCESS,
} from "../../utils/constants";

/**
 * Synchronizer for ScheduleStore reactive operations
 * Handles all reactive logic for schedule operations, keeping ScheduleStore as a pure data store
 *
 * This class follows the Mediator pattern - it coordinates between entities and stores
 * without coupling them directly. This maintains SRP (Single Responsibility Principle).
 */
export class ScheduleStoreSynchronizer {
  private unsubscribes = new Map<string, () => void>();

  constructor(
    private scheduleStore: ScheduleStore,
    private rootStore: any
  ) { }

  /**
   * Attach a schedule entity to the synchronizer
   * Sets up reactive listeners for all schedule operations
   * @param schedule - The schedule entity to attach
   */
  attach(schedule: ESPCDFSchedule): void {
    // Clean up previous subscription if re-attaching
    this.detach(schedule.id);

    // Subscribe to all schedule operations
    const unsubscribe = schedule.subscribe(
      (s, operation, success, data, error) => {
        // Only handle successful operations
        if (success) {
          this.handleOperation(s, operation, data);
        } else {
          console.error(
            `[ScheduleStoreSynchronizer] Schedule operation ${operation} failed:`,
            error
          );
        }
      }
    );

    this.unsubscribes.set(schedule.id, unsubscribe);
  }

  /**
   * Detach a schedule entity from the synchronizer
   * Removes reactive listeners and cleans up
   * @param scheduleId - The identifier of the schedule to detach
   */
  detach(scheduleId: string): void {
    const unsubscribe = this.unsubscribes.get(scheduleId);
    if (unsubscribe) {
      unsubscribe();
      this.unsubscribes.delete(scheduleId);
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
   * Handle schedule operation events and update stores accordingly
   * This is where all reactive business logic lives - not in the stores themselves
   */
  private handleOperation(
    schedule: ESPCDFSchedule,
    operation: ESPCDFScheduleOperationType,
    data?: any
  ): void {
    if (!data) {
      return;
    }

    /**
     * Updates schedule in a node's service configuration
     * @param params - Parameters for updating schedule in node
     */
    const updateNodeSchedule = ({
      nodeId,
      action,
      name,
      info,
      id,
      triggers,
      enabled,
      validity,
      flags,
      operation,
    }: {
      nodeId: string;
      action?: any;
      name?: string;
      info?: string;
      id: string;
      triggers?: Array<{
        m?: number;
        d?: number;
        dd?: number;
        mm?: number;
        yy?: number;
        rsec?: number;
      }>;
      enabled?: boolean;
      validity?: {
        start?: number;
        end?: number;
      };
      flags?: number;
      operation: ScheduleOperation;
    }) => {
      const node = this.rootStore?.nodeStore?.nodesByIDMap?.[nodeId];
      if (!node) return;

      const nodeServices = node.services || [];
      const schedulesServiceIndex = nodeServices.findIndex(
        (service: ESPCDFService) => service.type === ESPRM_SERVICE_SCHEDULES
      );
      if (schedulesServiceIndex === -1) return;

      let schedules =
        nodeServices[schedulesServiceIndex].params.find(
          (param: any) => param.type === ESPRM_PARAM_SCHEDULES
        )?.value || [];

      // Handle array or object with Schedules property
      let schedulesArray: any[] = [];
      if (Array.isArray(schedules)) {
        schedulesArray = schedules;
      } else if (schedules && Array.isArray(schedules.Schedules)) {
        schedulesArray = schedules.Schedules;
      }

      if (operation === ScheduleOperation.EDIT) {
        schedulesArray.forEach((scheduleItem: any) => {
          if (scheduleItem.id === id) {
            if (name !== undefined) scheduleItem.name = name;
            if (info !== undefined) scheduleItem.info = info;
            if (action !== undefined) scheduleItem.action = action;
            if (triggers !== undefined) scheduleItem.triggers = triggers;
            if (enabled !== undefined) scheduleItem.enabled = enabled;
            if (validity !== undefined) scheduleItem.validity = validity;
            if (flags !== undefined) scheduleItem.flags = flags;
          }
        });
      } else if (operation === ScheduleOperation.ADD) {
        schedulesArray.push({
          id,
          name,
          info,
          action,
          triggers,
          enabled,
          validity,
          flags,
        });
      } else if (operation === ScheduleOperation.REMOVE) {
        const scheduleIndex = schedulesArray.findIndex(
          (scheduleItem: any) => scheduleItem.id === id
        );
        if (scheduleIndex !== -1) {
          schedulesArray.splice(scheduleIndex, 1);
        }
      } else if (
        operation === ScheduleOperation.ENABLE ||
        operation === ScheduleOperation.DISABLE
      ) {
        schedulesArray.forEach((scheduleItem: any) => {
          if (scheduleItem.id === id) {
            scheduleItem.enabled = operation === ScheduleOperation.ENABLE;
          }
        });
      }

      // Update the param value
      const scheduleParam = nodeServices[schedulesServiceIndex].params.find(
        (param: any) => param.type === ESPRM_PARAM_SCHEDULES
      );
      if (scheduleParam) {
        // Preserve original structure (array or object with Schedules property)
        if (Array.isArray(schedules)) {
          scheduleParam.value = schedulesArray;
        } else if (schedules && schedules.Schedules) {
          scheduleParam.value = { Schedules: schedulesArray };
        } else {
          scheduleParam.value = schedulesArray;
        }
      }

      // Update services at first level of node
      this.rootStore?.nodeStore?.updateNode(nodeId, { services: nodeServices });
    };

    // Process operation-specific logic
    switch (operation) {
      case "add": {
        const nodeList: string[] = [];
        const results = Array.isArray(data) ? data : [data];
        results.forEach((response: any) => {
          const { node_id, status } = response as any;
          if (status === SUCCESS && node_id) {
            updateNodeSchedule({
              nodeId: node_id,
              action: schedule.action[node_id],
              name: schedule.name,
              info: schedule.info,
              id: schedule.id,
              triggers: schedule.triggers,
              enabled: schedule.enabled,
              validity: schedule.validity,
              flags: schedule.flags,
              operation: ScheduleOperation.ADD,
            });
            nodeList.push(node_id);
          } else if (node_id) {
            nodeList.push(node_id);
          }
        });
        break;
      }

      case "edit": {
        const nodeList: string[] = [];
        const results = Array.isArray(data) ? data : [data];
        results.forEach((response: any) => {
          const { node_id, status } = response as any;
          if (status === SUCCESS && node_id) {
            // Update node schedule with edit operation
            updateNodeSchedule({
              nodeId: node_id,
              action: schedule.action[node_id],
              name: schedule.name,
              info: schedule.info,
              id: schedule.id,
              triggers: schedule.triggers,
              enabled: schedule.enabled,
              validity: schedule.validity,
              flags: schedule.flags,
              operation: ScheduleOperation.EDIT,
            });
            nodeList.push(node_id);
          } else if (node_id) {
            nodeList.push(node_id);
          }
        });
        break;
      }

      case "remove": {
        const nodeList: string[] = [];
        const results = Array.isArray(data) ? data : [data];
        let allSuccess = true;
        results.forEach((response: any) => {
          const { node_id, status } = response as any;
          if (status === SUCCESS && node_id) {
            updateNodeSchedule({
              nodeId: node_id,
              id: schedule.id,
              operation: ScheduleOperation.REMOVE,
            });
            delete schedule.action[node_id];
            nodeList.push(node_id);
          } else {
            allSuccess = false;
            if (node_id) {
              nodeList.push(node_id);
            }
          }
        });

        if (allSuccess) {
          delete this.scheduleStore._schedulesByID[schedule.id];
        }
        break;
      }

      case "enable":
      case "disable": {
        const nodeList: string[] = [];
        const results = Array.isArray(data) ? data : [data];
        results.forEach((response: any) => {
          const { node_id, status } = response as any;
          if (status === SUCCESS && node_id) {
            updateNodeSchedule({
              nodeId: node_id,
              id: schedule.id,
              enabled: operation === "enable",
              operation:
                operation === "enable"
                  ? ScheduleOperation.ENABLE
                  : ScheduleOperation.DISABLE,
            });
            // Update local schedule enabled state
            schedule.enabled = operation === "enable";
            nodeList.push(node_id);
          } else if (node_id) {
            nodeList.push(node_id);
          }
        });
        break;
      }

      default:
        break;
    }
  }
}
