/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { ESPCDFNode } from "../../entities/ESPCDFNode";
import {
  ESPCDFNodeOperationType,
  ESPCDFDeviceOperationType,
  ESPCDFServiceOperationType,
  ESPCDFDeviceParamOperationType,
  ESPCDFServiceParamOperationType,
} from "../../types";
import NodeStore from "../nodeStore";
import { ESPCDFDevice } from "../../entities/ESPCDFDevice";
import { ESPCDFService } from "../../entities/ESPCDFService";
import { ESPCDFDeviceParam } from "../../entities/ESPCDFDeviceParam";
import { ESPCDFServiceParam } from "../../entities/ESPCDFServiceParam";

/**
 * Synchronizer for NodeStore reactive operations
 * Handles all reactive logic for node operations, keeping NodeStore as a pure data store
 *
 * This class follows the Mediator pattern - it coordinates between entities and stores
 * without coupling them directly. This maintains SRP (Single Responsibility Principle).
 */
export class NodeStoreSynchronizer {
  private nodeUnsubscribes = new Map<string, () => void>();
  private deviceUnsubscribes = new Map<string, () => void>();
  private serviceUnsubscribes = new Map<string, () => void>();
  private deviceParamUnsubscribes = new Map<string, () => void>();
  private serviceParamUnsubscribes = new Map<string, () => void>();

  constructor(private nodeStore: NodeStore) { }

  /**
   * Attach a node entity to the synchronizer
   * Sets up reactive listeners for all node operations and nested entities
   * @param node - The node entity to attach
   */
  attach(node: ESPCDFNode): void {
    // Clean up previous subscription if re-attaching
    this.detach(node.id);

    // Subscribe to all node operations
    const unsubscribe = node.subscribe((n, operation, success, data, error) => {
      // Only handle successful operations
      if (success) {
        this.handleNodeOperation(n, operation, data);
      } else {
        console.error(
          `[NodeStoreSynchronizer] Node operation ${operation} failed:`,
          error
        );
      }
    });

    this.nodeUnsubscribes.set(node.id, unsubscribe);

    // Attach all nested entities
    this.attachNestedEntities(node);
  }

  /**
   * Attach nested entities (devices, services, params) to the synchronizer
   */
  private attachNestedEntities(node: ESPCDFNode): void {
    // Attach devices
    node.devices?.forEach((device) => {
      const deviceKey = `${node.id}:device:${device.name}`;
      const unsubscribe = device.subscribe(
        (d, operation, success, data, error) => {
          if (success) {
            this.handleDeviceOperation(d, operation, data, node);
          } else {
            console.error(
              `[NodeStoreSynchronizer] Device operation ${operation} failed:`,
              error
            );
          }
        }
      );
      this.deviceUnsubscribes.set(deviceKey, unsubscribe);

      // Attach device params
      device.params?.forEach((param) => {
        const paramKey = `${node.id}:device:${device.name}:param:${param.name}`;
        const unsubscribe = param.subscribe(
          (p, operation, success, data, error) => {
            if (success) {
              this.handleDeviceParamOperation(p, operation, data);
            } else {
              console.error(
                `[NodeStoreSynchronizer] Device param operation ${operation} failed:`,
                error
              );
            }
          }
        );
        this.deviceParamUnsubscribes.set(paramKey, unsubscribe);
      });
    });

    // Attach services
    node.services?.forEach((service) => {
      const serviceKey = `${node.id}:service:${service.type}`;
      const unsubscribe = service.subscribe(
        (s, operation, success, data, error) => {
          if (success) {
            this.handleServiceOperation(s, operation, data, node);
          } else {
            console.error(
              `[NodeStoreSynchronizer] Service operation ${operation} failed:`,
              error
            );
          }
        }
      );
      this.serviceUnsubscribes.set(serviceKey, unsubscribe);

      // Attach service params
      service.params?.forEach((param) => {
        const paramKey = `${node.id}:service:${service.type}:param:${param.name}`;
        const unsubscribe = param.subscribe(
          (p, operation, success, data, error) => {
            if (success) {
              this.handleServiceParamOperation(
                p,
                operation,
                data,
              );
            } else {
              console.error(
                `[NodeStoreSynchronizer] Service param operation ${operation} failed:`,
                error
              );
            }
          }
        );
        this.serviceParamUnsubscribes.set(paramKey, unsubscribe);
      });
    });
  }

  /**
   * Detach a node entity from the synchronizer
   * Removes reactive listeners and cleans up
   * @param nodeId - The identifier of the node to detach
   */
  detach(nodeId: string): void {
    // Detach node
    const unsubscribe = this.nodeUnsubscribes.get(nodeId);
    if (unsubscribe) {
      unsubscribe();
      this.nodeUnsubscribes.delete(nodeId);
    }

    // Detach all nested entities for this node
    const node = this.nodeStore.getNodeById(nodeId);
    if (node) {
      // Detach devices
      node.devices?.forEach((device) => {
        const deviceKey = `${nodeId}:device:${device.name}`;
        const deviceUnsubscribe = this.deviceUnsubscribes.get(deviceKey);
        if (deviceUnsubscribe) {
          deviceUnsubscribe();
          this.deviceUnsubscribes.delete(deviceKey);
        }

        // Detach device params
        device.params?.forEach((param) => {
          const paramKey = `${nodeId}:device:${device.name}:param:${param.name}`;
          const paramUnsubscribe = this.deviceParamUnsubscribes.get(paramKey);
          if (paramUnsubscribe) {
            paramUnsubscribe();
            this.deviceParamUnsubscribes.delete(paramKey);
          }
        });
      });

      // Detach services
      node.services?.forEach((service) => {
        const serviceKey = `${nodeId}:service:${service.type}`;
        const serviceUnsubscribe = this.serviceUnsubscribes.get(serviceKey);
        if (serviceUnsubscribe) {
          serviceUnsubscribe();
          this.serviceUnsubscribes.delete(serviceKey);
        }

        // Detach service params
        service.params?.forEach((param) => {
          const paramKey = `${nodeId}:service:${service.type}:param:${param.name}`;
          const paramUnsubscribe = this.serviceParamUnsubscribes.get(paramKey);
          if (paramUnsubscribe) {
            paramUnsubscribe();
            this.serviceParamUnsubscribes.delete(paramKey);
          }
        });
      });
    }

    // Clean up any remaining subscriptions for this node (in case node was already removed)
    Array.from(this.deviceUnsubscribes.keys())
      .filter((key) => key.startsWith(`${nodeId}:`))
      .forEach((key) => {
        const unsubscribe = this.deviceUnsubscribes.get(key);
        if (unsubscribe) unsubscribe();
        this.deviceUnsubscribes.delete(key);
      });

    Array.from(this.serviceUnsubscribes.keys())
      .filter((key) => key.startsWith(`${nodeId}:`))
      .forEach((key) => {
        const unsubscribe = this.serviceUnsubscribes.get(key);
        if (unsubscribe) unsubscribe();
        this.serviceUnsubscribes.delete(key);
      });

    Array.from(this.deviceParamUnsubscribes.keys())
      .filter((key) => key.startsWith(`${nodeId}:`))
      .forEach((key) => {
        const unsubscribe = this.deviceParamUnsubscribes.get(key);
        if (unsubscribe) unsubscribe();
        this.deviceParamUnsubscribes.delete(key);
      });

    Array.from(this.serviceParamUnsubscribes.keys())
      .filter((key) => key.startsWith(`${nodeId}:`))
      .forEach((key) => {
        const unsubscribe = this.serviceParamUnsubscribes.get(key);
        if (unsubscribe) unsubscribe();
        this.serviceParamUnsubscribes.delete(key);
      });
  }

  /**
   * Dispose all subscriptions and clean up
   */
  dispose(): void {
    this.nodeUnsubscribes.forEach((unsubscribe) => unsubscribe());
    this.nodeUnsubscribes.clear();
    this.deviceUnsubscribes.forEach((unsubscribe) => unsubscribe());
    this.deviceUnsubscribes.clear();
    this.serviceUnsubscribes.forEach((unsubscribe) => unsubscribe());
    this.serviceUnsubscribes.clear();
    this.deviceParamUnsubscribes.forEach((unsubscribe) => unsubscribe());
    this.deviceParamUnsubscribes.clear();
    this.serviceParamUnsubscribes.forEach((unsubscribe) => unsubscribe());
    this.serviceParamUnsubscribes.clear();
  }

  /**
   * Handle node operation events and update stores accordingly
   */
  private handleNodeOperation(
    node: ESPCDFNode,
    operation: ESPCDFNodeOperationType,
    data?: any
  ): void {
    switch (operation) {
      case "setMultipleParams":
        if (data) {
          for (const device of node.devices || []) {
            if (device.params) {
              for (const param of device.params) {
                const serviceName = (param as any).deviceName || device.name;
                if (data[serviceName]) {
                  const paramUpdate = data[serviceName].find(
                    (p: any) => Object.keys(p)[0] === param.name
                  );
                  if (paramUpdate) {
                    const oldValue = (param as any).value;
                    (param as any).value = paramUpdate[param.name];

                    // Emit typed property change event for each param to sync to _raw
                    node.emitPropertyChange({
                      type: "deviceParamChanged",
                      deviceName: device.name,
                      paramName: param.name,
                      value: paramUpdate[param.name],
                      oldValue,
                      entity: node,
                    });
                  }
                }
              }
            }
          }
        }
        break;

      case "delete":
        // deleteNode already handles cleanup of groups
        this.nodeStore.deleteNode(node.id);
        break;

      case "updateMetadata":
        this.nodeStore.updateNode(node.id, { metadata: data });
        break;

      default:
        break;
    }

  }

  /**
   * Handle device operation events
   */
  private handleDeviceOperation(
    device: ESPCDFDevice,
    operation: ESPCDFDeviceOperationType,
    data?: any,
    node?: ESPCDFNode
  ): void {
    switch (operation) {
      case "getParams":
        if (data) {
          data.forEach((param: ESPCDFDeviceParam) => {
            const paramKey = `${node?.id}:device:${device.name}:param:${param.name}`;
            this.deviceParamUnsubscribes.set(paramKey, param.subscribe((p, operation, success, data, error) => {
              if (success) {
                this.handleDeviceParamOperation(p, operation, data);
              } else {
                console.error(
                  `[NodeStoreSynchronizer] Device param operation ${operation} failed:`,
                  error
                );
              }
            }));
          });
          device.params = data;
        }
        break;

      default:
        break;
    }
  }

  /**
   * Handle service operation events
   */
  private handleServiceOperation(
    service: ESPCDFService,
    operation: ESPCDFServiceOperationType,
    data?: any,
    node?: ESPCDFNode
  ): void {
    switch (operation) {
      case "getParams":
        if (data) {
          data.forEach((param: ESPCDFServiceParam) => {
            const paramKey = `${node?.id}:service:${service.type}:param:${param.name}`;
            this.serviceParamUnsubscribes.set(paramKey, param.subscribe((p, operation, success, data, error) => {
              if (success) {
                this.handleServiceParamOperation(p, operation, data);
              } else {
                console.error(
                  `[NodeStoreSynchronizer] Service param operation ${operation} failed:`,
                  error
                );
              }
            }));
          });
          service.params = data;
        }
        break;

      default:
        break;
    }
  }

  /**
   * Handle device param operation events
   */
  private handleDeviceParamOperation(
    param: ESPCDFDeviceParam,
    operation: ESPCDFDeviceParamOperationType,
    data?: any,
  ): void {
    switch (operation) {
      case "setValue":
        param.value = data;
        break;

      default:
        break;
    }
  }

  /**
   * Handle service param operation events
   */
  private handleServiceParamOperation(
    param: ESPCDFServiceParam,
    operation: ESPCDFServiceParamOperationType,
    data?: any,
  ): void {
    switch (operation) {
      case "setValue":
        param.value = data;
        break;

      default:
        break;
    }
  }
}
