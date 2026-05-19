/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { ESPCDF } from "./index";
import { observable, action, computed } from "mobx";
import { ESPCDFScene } from "../entities/ESPCDFScene";
import { makeEverythingObservable } from "../utils/common";
import { SceneStoreSynchronizer } from "./sync/SceneStoreSynchronizer";

/**
 * SceneStore - Manages scene operations and state for ESP Rainmaker CDF
 *
 * This store handles all scene-related operations including:
 * - Scene CRUD operations (Create, Read, Update, Delete)
 * - Scene transformation from node configurations
 * - Scene activation and synchronization
 * - Payload generation for scene operations
 * - Interceptor patterns for scene actions
 */
class SceneStore {
  #synchronizer: SceneStoreSynchronizer;

  /** Index signature for dynamic property access */
  [key: string]: any;

  /** Observable map of scenes indexed by scene ID */
  @observable accessor _scenesByID: { [key: string]: ESPCDFScene } = {};

  /**
   * Creates a new SceneStore instance
   * @param [rootStore] - Optional reference to the root CDF store
   */
  constructor(rootStore?: ESPCDF) {
    this.#synchronizer = new SceneStoreSynchronizer(this, rootStore || null);
  }

  /**
   * Getter for scenes indexed by ID
   * @returns Map of scenes indexed by scene ID
   */
  public get scenesByID(): { [key: string]: ESPCDFScene } {
    return this._scenesByID;
  }

  /**
   * Setter for scenes indexed by ID
   * @param value - Map of scenes to set
   */
  public set scenesByID(value: { [key: string]: ESPCDFScene }) {
    this._scenesByID = value;
  }

  /**
   * Computed property that returns an array of all scenes
   * @returns Array of all scenes in the store
   */
  @computed get sceneList(): ESPCDFScene[] {
    return Object.values(this._scenesByID);
  }

  /**
   * Retrieves a scene by its ID
   * @param sceneId - The ID of the scene to retrieve
   * @returns The scene object or null if not found
   * @example
   * const scene = sceneStore.getScene('scene123');
   */
  public getScene = (sceneId: string): ESPCDFScene | null => {
    return this._scenesByID[sceneId] || null;
  };

  /**
   * Sets the entire scene list, replacing all existing scenes
   *
   * This method replaces all scenes in the store with the provided array.
   * Each scene is made observable and has interceptors set up.
   * @param scenes - Array of scenes to set
   * @example
   * sceneStore.setSceneList([
   *   { id: 'scene1', name: 'Scene 1', nodes: [], actions: {} },
   *   { id: 'scene2', name: 'Scene 2', nodes: [], actions: {} }
   * ]);
   */
  @action setSceneList(scenes: ESPCDFScene[]) {
    this.clear();
    scenes.forEach((scene) => this.addScene(scene));
  }

  /**
   * Adds a single scene to the store
   * @param scene - The scene to add
   * @returns The observable scene object
   * @example
   * const scene = sceneStore.addScene(sceneEntity);
   */
  @action addScene(scene: ESPCDFScene): ESPCDFScene {
    // Make scene and all nested properties observable recursively
    // Exclude '_raw' and 'operations' as they are SDK-specific and don't need reactivity
    const observableScene = makeEverythingObservable(
      scene,
      new Set(["_raw", "operations"])
    );

    // Attach scene to synchronizer for reactive updates
    this.#synchronizer.attach(observableScene);

    this._scenesByID[scene.id] = observableScene;
    return observableScene;
  }

  /**
   * Updates a scene by ID without making it observable
   * @param id - The scene ID
   * @param scene - The scene object to set
   * @example
   * sceneStore.updateSceneByID('scene123', updatedScene);
   */
  @action updateSceneByID(id: string, scene: ESPCDFScene): void {
    this._scenesByID[id] = scene;
  }

  /**
   * Deletes multiple scenes by their IDs
   * @param ids - Array of scene IDs to delete
   * @example
   * sceneStore.deleteScenes(['scene1', 'scene2', 'scene3']);
   */
  @action deleteScenes(ids: string[]) {
    ids.forEach((id) => {
      // Detach from synchronizer before removing
      this.#synchronizer.detach(id);
      delete this._scenesByID[id];
    });
  }

  /**
   * Activates a scene by triggering its action
   *
   * This method finds the scene by ID and calls its trigger method, which
   * will activate the scene across all its associated nodes.
   * @param sceneId - The ID of the scene to activate
   * @returns Resolves when `scene.activate()` completes for that scene
   * @throws {Error} If scene is not found or activation fails
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
   * @param sceneIds - Array of scene IDs to activate
   * @returns Resolves when every scene in the list has been activated
   * @throws {Error} If any scene activation fails
   * @example
   * await sceneStore.activateMultipleScenes(['scene1', 'scene2', 'scene3']);
   */
  @action activateMultipleScenes = async (
    sceneIds: string[]
  ): Promise<void> => {
    try {
      const activationPromises = sceneIds.map((sceneId) =>
        this.activateScene(sceneId)
      );
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
   * @param propertyName - The name of the property to add
   * @param initialValue - The initial value for the property
   * @example
   * sceneStore.addProperty('customField', 'initial value');
   * sceneStore.setCustomField('new value');
   */
  @action addProperty(propertyName: string, initialValue: any) {
    // Helper function to capitalize first letter
    const capitalize = (str: string) =>
      str.charAt(0).toUpperCase() + str.slice(1);

    // Add the observable property directly
    (this as any)[propertyName] = initialValue;

    // Add the getter
    Object.defineProperty(this, `get${capitalize(propertyName)}`, {
      get: function () {
        return (this as any)[propertyName];
      },
      enumerable: true,
      configurable: true,
    });

    // Add the setter
    (this as any)[`set${capitalize(propertyName)}`] = action(function (
      this: SceneStore,
      value: any
    ) {
      (this as any)[propertyName] = value;
    });
  }

  /**
   * Clears all scenes and resets hooks to default values
   *
   * This method removes all scenes from the store and resets the
   * beforeSetSceneListHook and afterSetSceneListHook to empty functions.
   * @example
   * sceneStore.clear();
   */
  @action clear() {
    // Detach all scenes from synchronizer before clearing
    Object.keys(this._scenesByID).forEach((sceneId) => {
      this.#synchronizer.detach(sceneId);
    });
    this._scenesByID = {};
  }
}

export default SceneStore;
