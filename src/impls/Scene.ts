// Extended Scene interface for ESP Rainmaker
import { Scene as SceneInterface, ESPAPIResponse, CDF } from "../types/index";
import { SceneOperation } from "../utils/constants";

class Scene implements SceneInterface {
  #rootStore?: CDF | null;
  id: string;
  name: string;
  info?: string;
  nodes: string[];
  actions: {
    [key: string]: {
      [key: string]: any;
    };
  };
  devicesCount: number;
  add: () => Promise<ESPAPIResponse | undefined>;
  edit: ({
    name,
    actions,
    info,
  }: {
    name: string;
    actions: any;
    info?: string;
  }) => Promise<ESPAPIResponse | undefined>;
  remove: () => Promise<ESPAPIResponse | undefined>;
  activate: () => Promise<ESPAPIResponse | undefined>;
  callbackUpdateOperation: { [key: string]: SceneOperation };

  constructor(scene: Scene, rootStore: CDF) {
    // Validate required scene properties
    if (!scene.id || !scene.name) {
      throw new Error("Scene must have both id and name");
    }

    this.#rootStore = rootStore;
    this.id = scene.id;
    this.name = scene.name;
    this.info = scene.info;
    this.nodes = scene.nodes || [];
    this.actions = scene.actions || {};
    this.devicesCount = scene.devicesCount || 0;

    // Bind methods to preserve context
    this.edit = (args: { name: string; actions: any; info?: string }) =>
      this.#edit(args);
    this.remove = this.#remove.bind(this);
    this.activate = this.#activate.bind(this);
    this.add = this.#add.bind(this);
    this.callbackUpdateOperation = {};
  }

  /**
   * Generates payload for scene operations based on the ESP Rainmaker API format
   *
   * This function creates the proper payload structure for scene operations:
   * - add: Creates a new scene with name, id, and action actionsuration
   * - activate: Activates an existing scene by ID
   * - remove: Removes a scene by ID
   * - edit: Updates an existing scene with new actionsuration
   *
   * @param {any} actions - Scene actionsuration object containing device actions
   * @param {string} nodeId - ID of the target node
   * @param {SceneOperation} type - Operation type
   * @param {string} [sceneName] - Scene name (required for add/edit operations)
   * @returns {Object} Formatted payload for ESP Rainmaker API
   * @throws {Error} When operation type is unknown
   *
   * @example
   * // Generate payload for adding a scene
   * const payload = this.#generatePayload(
   *   { light: { power: true } },
   *   'node123',
   *   SceneOperation.ADD,
   *   'Living Room Scene',
   *   'scene456'
   * );
   *
   */
  #generatePayload(
    actions: any,
    nodeId: string,
    type: SceneOperation,
    sceneName?: string,
    sceneId?: string,
    info?: string
  ): any {
    const sceneData: Record<string, any> = {
      [SceneOperation.ADD]: {
        id: sceneId,
        operation: SceneOperation.ADD,
        name: sceneName,
        action: actions,
        info: info,
      },
      [SceneOperation.ACTIVATE]: {
        id: sceneId,
        operation: SceneOperation.ACTIVATE,
      },
      [SceneOperation.REMOVE]: {
        id: sceneId,
        operation: SceneOperation.REMOVE,
      },
      [SceneOperation.EDIT]: {
        name: sceneName,
        id: sceneId,
        operation: SceneOperation.EDIT,
        action: actions,
        info: info,
      },
    };

    const operationData = sceneData[type];
    if (!operationData) {
      throw new Error(`Unknown operation type: ${type}`);
    }

    return {
      nodeId,
      payload: {
        Scenes: [
          {
            Scenes: [operationData],
          },
        ],
      },
    };
  }

  /**
   * Determines the appropriate operation type for editing a scene based on action existence
   * @param nodeId - The node identifier
   * @param newActions - The new actions to be applied
   * @returns The operation type: SceneOperation.ADD, SceneOperation.EDIT, or SceneOperation.REMOVE
   */
  #determineEditOperation(nodeId: string, newActions: any): SceneOperation {
    if (!nodeId) {
      throw new Error("nodeId is required for determining edit operation");
    }

    const existInOldActions = !!this.actions[nodeId];
    const existInNewActions = !!newActions?.[nodeId];

    if (existInOldActions && existInNewActions) return SceneOperation.EDIT;
    if (existInOldActions && !existInNewActions) return SceneOperation.REMOVE;
    if (!existInOldActions && existInNewActions) return SceneOperation.ADD;

    // Default case: no change needed (both actions are falsy)
    return SceneOperation.EDIT;
  }

  #operations = (
    type: SceneOperation,
    sceneName: string = this.name,
    actions: any = this.actions,
    nodes: string[] = this.nodes,
    info: string = this.info || ""
  ) => {
    const user = this.#rootStore?.userStore.user;
    if (!user) {
      throw new Error("User not found");
    }

    const payload = nodes.map((nodeId: string) => {
      // Handle edit operations with dynamic operation type determination
      if (type === SceneOperation.EDIT) {
        const operationType = this.#determineEditOperation(nodeId, actions);
        this.callbackUpdateOperation[nodeId] = operationType;
        return this.#generatePayload(
          actions[nodeId],
          nodeId,
          operationType,
          sceneName,
          this.id,
          info
        );
      }

      // Handle other operation types directly
      return this.#generatePayload(
        actions[nodeId],
        nodeId,
        type,
        sceneName,
        this.id,
        info
      );
    });

    return user.setMultipleNodesParams(payload);
  };

  #add = (): Promise<ESPAPIResponse | undefined> => {
    return this.#operations(SceneOperation.ADD);
  };

  #edit = ({
    name,
    actions,
    info,
  }: {
    name: string;
    actions: any;
    info?: string;
  }): Promise<ESPAPIResponse | undefined> => {
    const nodes = Object.keys({ ...actions, ...this.actions });
    return this.#operations(SceneOperation.EDIT, name, actions, nodes, info);
  };

  #remove = (): Promise<ESPAPIResponse | undefined> => {
    return this.#operations(SceneOperation.REMOVE);
  };

  #activate = (): Promise<ESPAPIResponse | undefined> => {
    return this.#operations(SceneOperation.ACTIVATE);
  };
}

export default Scene;
