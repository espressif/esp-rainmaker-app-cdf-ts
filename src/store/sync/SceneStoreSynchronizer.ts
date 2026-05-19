/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { ESPCDFScene } from "../../entities/ESPCDFScene";
import { ESPCDFService } from "../../entities/ESPCDFService";
import { ESPCDFSceneOperationType } from "../../types";
import SceneStore from "../sceneStore";
import {
  ESPRM_SERVICE_SCENES,
  ESPRM_PARAM_SCENES,
  SceneOperation,
  SUCCESS,
} from "../../utils/constants";

/**
 * Synchronizer for SceneStore reactive operations
 * Handles all reactive logic for scene operations, keeping SceneStore as a pure data store
 *
 * This class follows the Mediator pattern - it coordinates between entities and stores
 * without coupling them directly. This maintains SRP (Single Responsibility Principle).
 */
export class SceneStoreSynchronizer {
  private unsubscribes = new Map<string, () => void>();

  constructor(
    private sceneStore: SceneStore,
    private rootStore: any
  ) { }

  /**
   * Attach a scene entity to the synchronizer
   * Sets up reactive listeners for all scene operations
   * @param scene - The scene entity to attach
   */
  attach(scene: ESPCDFScene): void {
    // Clean up previous subscription if re-attaching
    this.detach(scene.id);

    // Subscribe to all scene operations
    const unsubscribe = scene.subscribe(
      (s, operation, success, data, error) => {
        // Only handle successful operations
        if (success) {
          this.handleOperation(s, operation, data);
        } else {
          console.error(
            `[SceneStoreSynchronizer] Scene operation ${operation} failed:`,
            error
          );
        }
      }
    );

    this.unsubscribes.set(scene.id, unsubscribe);
  }

  /**
   * Detach a scene entity from the synchronizer
   * Removes reactive listeners and cleans up
   * @param sceneId - The identifier of the scene to detach
   */
  detach(sceneId: string): void {
    const unsubscribe = this.unsubscribes.get(sceneId);
    if (unsubscribe) {
      unsubscribe();
      this.unsubscribes.delete(sceneId);
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
   * Handle scene operation events and update stores accordingly
   * This is where all reactive business logic lives - not in the stores themselves
   */
  private handleOperation(
    scene: ESPCDFScene,
    operation: ESPCDFSceneOperationType,
    data?: any
  ): void {
    if (!data) {
      return;
    }

    /**
     * Updates scene in a node's service configuration
     * @param params - Parameters for updating scene in node
     */
    const updateNodeScene = ({
      nodeId,
      action,
      name,
      info,
      id,
      operation,
    }: {
      nodeId: string;
      action?: any;
      name?: string;
      info?: string;
      id: string;
      operation: SceneOperation;
    }) => {
      const node = this.rootStore?.nodeStore?.nodesByIDMap?.[nodeId];
      if (!node) return;

      const nodeServices = node.services || [];
      const scenesServiceIndex = nodeServices.findIndex(
        (service: ESPCDFService) => service.type === ESPRM_SERVICE_SCENES
      );
      if (scenesServiceIndex === -1) return;

      let scenes =
        nodeServices[scenesServiceIndex].params.find(
          (param: any) => param.type === ESPRM_PARAM_SCENES
        )?.value || [];

      if (operation === SceneOperation.EDIT) {
        scenes.forEach((sceneItem: any) => {
          if (sceneItem.id === id) {
            sceneItem.name = name;
            sceneItem.info = info;
            sceneItem.action = action;
          }
        });
      } else if (operation === SceneOperation.ADD) {
        scenes.push({
          id,
          name,
          info,
          action,
        });
      } else if (operation === SceneOperation.REMOVE) {
        const sceneIndex = scenes.findIndex(
          (sceneItem: any) => sceneItem.id === id
        );
        if (sceneIndex !== -1) {
          scenes.splice(sceneIndex, 1);
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
            updateNodeScene({
              nodeId: node_id,
              action: scene.actions[node_id],
              name: scene.name,
              info: scene.info,
              id: scene.id,
              operation: SceneOperation.ADD,
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
            // Update node scene with edit operation
            // The transformer handles determining add/edit/remove per node internally
            updateNodeScene({
              nodeId: node_id,
              action: scene.actions[node_id],
              name: scene.name,
              info: scene.info,
              id: scene.id,
              operation: SceneOperation.EDIT,
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
            updateNodeScene({
              nodeId: node_id,
              id: scene.id,
              operation: SceneOperation.REMOVE,
            });
            delete scene.actions[node_id];
            nodeList.push(node_id);
          } else {
            allSuccess = false;
            if (node_id) {
              nodeList.push(node_id);
            }
          }
        });

        if (allSuccess) {
          delete this.sceneStore._scenesByID[scene.id];
        }
        break;
      }

      case "activate":
        // Activation doesn't modify scene configuration, just triggers actions
        // No node store update needed
        break;

      default:
        break;
    }
  }
}
