/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { CDF } from "./index";
import { observable, action, computed } from "mobx";
import {
    ESPRMNode,
    ESPRMService,
    ESPAPIResponse
} from "../types/index";
import { ESPRM_SERVICE_SCENES, ESPRM_PARAM_SCENES, SceneOperation } from "../utils/constants";
import Scene from "../impls/Scene";
import {
    makeEverythingObservable,
    proxyActionHandler,
    createInterceptor,
    extendObservable,
    capitalize,
} from "../utils/common";
import { SUCCESS } from "../utils/constants";

/**
 * SceneStore - Manages scene operations and state for ESP Rainmaker CDF
 * 
 * This store handles all scene-related operations including:
 * - Scene CRUD operations (Create, Read, Update, Delete)
 * - Scene transformation from node configurations
 * - Scene activation and synchronization
 * - Payload generation for scene operations
 * - Interceptor patterns for scene actions
 * 
 * @class SceneStore
 * @implements {MobX Observable Store}
 */
class SceneStore {
    /** Reference to the root CDF store for accessing other stores */
    private readonly rootStore: CDF | null;

    /** Index signature for dynamic property access */
    [key: string]: any;

    /** Observable map of scenes indexed by scene ID */
    @observable accessor _scenesByID: { [key: string]: Scene } = {};

    /** Hook called before setting scene list - for customization */
    beforeSetSceneListHook: (scenes: Scene[]) => void = (scenes: Scene[]) => { };

    /** Hook called after setting scene list - for customization */
    afterSetSceneListHook: (scenes: Scene[]) => void = (scenes: Scene[]) => { };

    /**
     * Creates a new SceneStore instance
     * @param {CDF} [rootStore] - Optional reference to the root CDF store
     */
    constructor(rootStore?: CDF) {
        this.rootStore = rootStore || null;
    }

    /**
     * Getter for scenes indexed by ID
     * @returns {Object.<string, Scene>} Map of scenes indexed by scene ID
     */
    @computed public get scenesByID(): { [key: string]: Scene } {
        return this._scenesByID;
    }

    /**
     * Setter for scenes indexed by ID
     * @param {Object.<string, Scene>} value - Map of scenes to set
     */
    @action public set scenesByID(value: { [key: string]: Scene }) {
        this._scenesByID = value;
    }

    /**
     * Computed property that returns an array of all scenes
     * @returns {Scene[]} Array of all scenes in the store
     */
    @computed get sceneList(): Scene[] {
        return Object.values(this._scenesByID);
    }


    /**
     * Sets up interceptor patterns for scene operations
     * 
     * This method creates interceptors that wrap scene operations with:
     * - Automatic payload generation
     * - API calls to ESP Rainmaker
     * - NodeStore synchronization
     * - Rollback functionality for error handling
     * 
     * @param {Scene} scene - The scene object to set up interceptors for
     * @private
     */
    #interceptProxy(scene: Scene) {

        /**
         * Updates scene in a node
         * @param {Object} params - Parameters for updating scene
         * @param {string} params.nodeId - ID of the node to update
         * @param {any} params.action - Action to update
         * @param {string} params.name - Name of the scene
         * @param {string} params.info - Info of the scene
         * @param {string} params.id - ID of the scene
         * @param {string} params.operation - Operation to perform
         * @returns {void}
         */
        const updateNodeScene = ({ nodeId, action, name, info, id, operation }: { nodeId: string, action?: any, name?: string, info?: string, id: string, operation: SceneOperation }) => {
            const node = this.rootStore?.nodeStore.nodesByID[nodeId];
            if (!node) {
                throw new Error(`Node with ID ${nodeId} not found`);
            };

            const nodeServices = node.nodeConfig?.services || [];
            const scenesServiceIndex = nodeServices.findIndex((service: ESPRMService) => service.type === ESPRM_SERVICE_SCENES);
            if (scenesServiceIndex === -1) {
                throw new Error(`Scenes service not found on node ${nodeId}`);
            }

            let scenes = nodeServices[scenesServiceIndex].params.find((param: any) => param.type === ESPRM_PARAM_SCENES)?.value || [];

            if (operation === SceneOperation.EDIT) {
                scenes.forEach((scene: any) => {
                    if (scene.id === id) {
                        scene.name = name;
                        scene.info = info;
                        scene.action = action;
                    }
                });
            }
            else if (operation === SceneOperation.ADD) {
                scenes.push({
                    id,
                    name,
                    info,
                    action
                });
            }
            else if (operation === SceneOperation.REMOVE) {
                scenes.splice(scenes.findIndex((scene: any) => scene.id === id), 1);
            }

            this.rootStore?.nodeStore.updateNode(nodeId, {
                nodeConfig: {
                    ...node.nodeConfig,
                    services: nodeServices
                }
            });
        }



        /** Interceptor for scene addition */
        const addSceneInterceptor = createInterceptor({
            rollback: (context) => {
                delete this._scenesByID[context.id]
            },
            onSuccess: (result, args, context) => {
                result.forEach((response: ESPAPIResponse) => {
                    const { node_id, status } = response as any;
                    if (status === SUCCESS) {
                        updateNodeScene({
                            nodeId: node_id,
                            action: context.actions[node_id],
                            name: context.name,
                            info: context.info,
                            id: context.id,
                            operation: SceneOperation.ADD
                        });
                    }
                })
                this.syncScenesFromNodes()
                return result
            }
        });

        /**
         * Interceptor for scene updates
         * Updates scene in all nodes and synchronizes NodeStore
         */
        const updateSceneInterceptor = createInterceptor({
            action: async (context, args) => {
                const devicesCount = Object.values(args[0].actions || {}).reduce((acc: number, deviceCofig: any) => {
                    acc += Object.keys(deviceCofig).length;
                    return acc;
                }, 0);

                const updatedScene = new Scene({
                    ...context,
                    ...args[0],
                    devicesCount: devicesCount
                }, this.rootStore!);

                const observableScene = makeEverythingObservable(updatedScene);
                this.#interceptProxy(observableScene);
                this._scenesByID[updatedScene.id] = observableScene;
            },
            rollback: (_, prevContext) => {
                this._scenesByID[prevContext.id] = prevContext;
            },
            onSuccess: (result, args, context) => {
                result.forEach((response: ESPAPIResponse) => {
                    const { node_id, status } = response as any;
                    if (status === SUCCESS) {
                        const operation = context.callbackUpdateOperation[node_id];
                        updateNodeScene({
                            nodeId: node_id,
                            action: args[0].actions[node_id],
                            name: args[0].name,
                            info: args[0].info,
                            id: context.id,
                            operation: operation
                        });
                    }
                })
                this._scenesByID[context.id].callbackUpdateOperation = {}
                this.syncScenesFromNodes()
                return result
            }
        });

        /**
         * Interceptor for scene deletion
         * Removes scene from all nodes and cleans up stores
         */
        const deleteSceneInterceptor = createInterceptor({
            rollback: (_, prevContext) => {
                // Restore scene in SceneStore
                this._scenesByID[prevContext.id] = prevContext;
            },
            onSuccess: (result, args, context) => {
                result.forEach((response: ESPAPIResponse) => {
                    const { node_id, status } = response as any;
                    if (status === SUCCESS) {
                        updateNodeScene({
                            nodeId: node_id,
                            id: context.id,
                            operation: SceneOperation.REMOVE
                        });
                        delete this._scenesByID[context.id].actions[node_id]
                    }
                });

                if (result.every((response: ESPAPIResponse) => response.status === SUCCESS)) {
                    delete this._scenesByID[context.id];
                }
                else {
                    this.syncScenesFromNodes()
                }
                return result
            }
        });

        // Attach interceptors to scene object methods
        proxyActionHandler(scene, "edit", updateSceneInterceptor);
        proxyActionHandler(scene, "remove", deleteSceneInterceptor);
        proxyActionHandler(scene, "add", addSceneInterceptor);
    }

    /**
     * Transforms node list into scenes by extracting scene configurations
     * 
     * This method processes all nodes and extracts scene information from their
     * service configurations. It merges scenes that exist across multiple nodes
     * and creates a unified scene representation.
     * 
     * @param {ESPRMNode[]} nodeList - Array of nodes to process
     * @returns {Object.<string, Scene>} Map of scenes indexed by scene ID
     * @private
     * 
     * @example
     * const scenes = this.#transformNodeListToScenes(nodeList);
     * // Returns: { 'scene1': { id: 'scene1', nodes: ['node1', 'node2'], config: {...} } }
     */
    #transformNodeListToScenes = (nodeList: ESPRMNode[]): { [key: string]: Scene } => {
        return nodeList.reduce((acc, node) => {
            // Get scene service from node configuration
            const scene = node?.nodeConfig?.services?.find(
                (service: ESPRMService) => service.type === ESPRM_SERVICE_SCENES
            );

            if (!scene) return acc;
            const sceneList = scene.params.find((param: any) => param.type === ESPRM_PARAM_SCENES)?.value || [];
            sceneList.forEach((sceneData: any) => {
                if (acc[sceneData.id]) {
                    // Merge with existing scene
                    acc[sceneData.id].nodes.push(node.id);
                    acc[sceneData.id].actions[node.id] = sceneData.action;
                    acc[sceneData.id].devicesCount += Object.keys(sceneData.action).length;
                } else {
                    // Create new scene
                    if (this.rootStore) {
                        acc[sceneData.id] = new Scene({
                            ...sceneData,
                            nodes: [node.id],
                            actions: { [node.id]: sceneData.action },
                            devicesCount: Object.keys(sceneData.action).length
                        }, this.rootStore);
                    }
                }
            });
            return acc;
        }, {} as Record<string, Scene>);
    };
    /**
     * Creates a new scene in the store
     * 
     * This method creates a new scene with the provided data, makes it observable,
     * and sets up interceptors for its operations. If no ID is provided, a timestamp-based
     * ID is generated.
     * 
     * @param {Partial<Scene>} sceneData - Scene data to create
     * @returns {Promise<Scene>} The created scene object
     * @throws {Error} If scene creation fails
     * 
     * @example
     * const newScene = await sceneStore.createScene({
     *   name: 'Living Room Scene',
     *   info: 'Cozy evening lighting',
     *   nodes: ['node1', 'node2'],
     *   config: { 'node1': { light: { power: true } } }
     * });
     */
    @action createScene = async (sceneData: Partial<Scene>): Promise<Scene> => {
        try {
            const devicesCount = Object.values(sceneData.actions || {}).reduce((acc: number, deviceCofig: any) => {
                acc += Object.keys(deviceCofig).length;
                return acc;
            }, 0);
            const sceneDataObj = {
                id: sceneData.id || `scene_${Date.now()}`,
                name: sceneData.name || 'New Scene',
                info: sceneData.info || '',
                nodes: sceneData.nodes || [],
                actions: sceneData.actions || {},
                devicesCount: devicesCount,
            } as Scene;

            const scene = new Scene(sceneDataObj, this.rootStore!);
            const observableScene = this.addScene(scene);
            await observableScene.add()
            return observableScene;
        } catch (error) {
            throw error;
        }
    };

    /**
     * Retrieves a scene by its ID
     * 
     * @param {string} sceneId - The ID of the scene to retrieve
     * @returns {Scene | null} The scene object or null if not found
     * 
     * @example
     * const scene = sceneStore.getScene('scene123');
     */
    public getScene = (sceneId: string): Scene | null => {
        return this._scenesByID[sceneId] || null;
    };


    /**
     * Sets the entire scene list, replacing all existing scenes
     * 
     * This method replaces all scenes in the store with the provided array.
     * Each scene is made observable and has interceptors set up.
     * 
     * @param {Scene[]} scenes - Array of scenes to set
     * 
     * @example
     * sceneStore.setSceneList([
     *   { id: 'scene1', name: 'Scene 1', nodes: [], config: {} },
     *   { id: 'scene2', name: 'Scene 2', nodes: [], config: {} }
     * ]);
     */
    @action setSceneList(scenes: Scene[]) {
        this.clear();
        scenes.forEach((scene) => this.addScene(scene));

    }

    /**
     * Adds a single scene to the store
     * 
     * @param {Scene} scene - The scene to add
     * @returns {Scene} The observable scene object
     * 
     * @example
     * const scene = sceneStore.addScene({
     *   id: 'scene123',
     *   name: 'New Scene',
     *   nodes: [],
     *   config: {}
     * });
     */
    @action addScene(scene: Scene) {
        const observableScene = makeEverythingObservable(scene);
        this.#interceptProxy(observableScene);
        this._scenesByID[scene.id] = observableScene;
        return scene;
    }

    /**
     * Updates a scene by ID without making it observable
     * 
     * @param {string} id - The scene ID
     * @param {Scene} scene - The scene object to set
     * 
     * @example
     * sceneStore.updateSceneByID('scene123', updatedScene);
     */
    @action updateSceneByID(id: string, scene: Scene): void {
        this._scenesByID[id] = scene;
    }

    /**
     * Deletes multiple scenes by their IDs
     * 
     * @param {string[]} ids - Array of scene IDs to delete
     * 
     * @example
     * sceneStore.deleteScenes(['scene1', 'scene2', 'scene3']);
     */
    @action deleteScenes(ids: string[]) {
        ids.forEach((id) => delete this._scenesByID[id]);
    }

    /**
     * Synchronizes scenes from node configurations
     * 
     * This method fetches all nodes from the NodeStore, transforms them into scenes,
     * and merges them with existing scenes in the store. It preserves any custom
     * data on existing scenes while updating them with new node information.
     * 
     * @returns {Promise<void>}
     * @throws {Error} If synchronization fails
     * 
     * @example
     * await sceneStore.syncScenesFromNodes();
     */
    @action syncScenesFromNodes = async (): Promise<void> => {
        try {
            this.clear();
            const nodeList = this.rootStore?.nodeStore.nodeList || [];
            const transformedScenes = this.#transformNodeListToScenes(nodeList);
            // Merge with existing scenes, preserving any custom data
            Object.keys(transformedScenes).forEach(sceneId => {
                this.addScene(transformedScenes[sceneId]);
            });

        } catch (error) {
            throw error;
        }
    };

    /**
     * Activates a scene by triggering its action
     * 
     * This method finds the scene by ID and calls its trigger method, which
     * will activate the scene across all its associated nodes.
     * 
     * @param {string} sceneId - The ID of the scene to activate
     * @returns {Promise<void>}
     * @throws {Error} If scene is not found or activation fails
     * 
     * @example
     * await sceneStore.activateScene('scene123');
     */
    @action activateScene = async (sceneId: string): Promise<void> => {
        try {
            const scene = this._scenesByID[sceneId];
            if (!scene) {
                throw new Error(`Scene with ID ${sceneId} not found`);
            }

            await scene.activate();
        } catch (error) {
            throw error;
        }
    };

    /**
     * Activates multiple scenes concurrently
     * 
     * This method activates multiple scenes in parallel using Promise.all.
     * 
     * @param {string[]} sceneIds - Array of scene IDs to activate
     * @returns {Promise<void>}
     * @throws {Error} If any scene activation fails
     * 
     * @example
     * await sceneStore.activateMultipleScenes(['scene1', 'scene2', 'scene3']);
     */
    @action activateMultipleScenes = async (sceneIds: string[]): Promise<void> => {
        try {
            const activationPromises = sceneIds.map(sceneId => this.activateScene(sceneId));
            await Promise.all(activationPromises);
        } catch (error) {
            throw error;
        }
    };

    /**
     * Dynamically adds an observable property to the store
     * 
     * This method adds a new observable property to the store and automatically
     * creates getter and setter methods for it. The property name is capitalized
     * for the getter/setter methods.
     * 
     * @param {string} propertyName - The name of the property to add
     * @param {any} initialValue - The initial value for the property
     * 
     * @example
     * sceneStore.addProperty('customField', 'initial value');
     * sceneStore.setCustomField('new value');
     */
    @action addProperty(propertyName: string, initialValue: any) {
        // Add the observable property
        extendObservable(this, { [propertyName]: initialValue });

        // Add the getter
        Object.defineProperty(this, `get${capitalize(propertyName)}`, {
            get: function () {
                return this[propertyName];
            },
            enumerable: true,
            configurable: true,
        });

        // Add the setter
        this[`set${capitalize(propertyName)}`] = action(function (
            this: SceneStore,
            value: any
        ) {
            this[propertyName] = value;
        });
    }

    /**
     * Clears all scenes and resets hooks to default values
     * 
     * This method removes all scenes from the store and resets the
     * beforeSetSceneListHook and afterSetSceneListHook to empty functions.
     * 
     * @example
     * sceneStore.clear();
     */
    @action clear() {
        this._scenesByID = {};
        this.beforeSetSceneListHook = () => { };
        this.afterSetSceneListHook = () => { };
    }
}

export default SceneStore;
