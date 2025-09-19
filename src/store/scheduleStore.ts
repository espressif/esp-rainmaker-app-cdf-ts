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
  ESPAPIResponse,
  ESPRMNodeConfig,
  updateNodeScheduleParams,
} from "../types/index";
import Schedule from "../impls/Schedule";
import {
  makeEverythingObservable,
  proxyActionHandler,
  createInterceptor,
  extendObservable,
  capitalize,
  compareArrays,
} from "../utils/common";
import {
  SUCCESS,
  NodeUpdateType,
  ESPRM_SERVICE_SCHEDULES,
  ESPRM_PARAM_SCHEDULES,
  ScheduleOperation,
} from "../utils/constants";

/**
 * ScheduleStore - Manages schedule operations and state for ESP Rainmaker CDF
 *
 * This store is responsible for managing schedules across multiple nodes in the ESP Rainmaker system.
 * It provides a centralized way to handle schedule operations, state management, and node synchronization.
 *
 * Key Features:
 * - Schedule CRUD operations (Create, Read, Update, Delete)
 * - Schedule enable/disable functionality
 * - Schedule transformation and payload generation
 * - Node-specific schedule operations
 * - Out-of-sync detection and metadata management
 * - MobX-powered state management
 *
 * @class ScheduleStore
 * @implements {MobX Observable Store}
 */
class ScheduleStore {
  /** Reference to the root CDF store for accessing other stores */
  private readonly rootStore: CDF | null;

  /** Index signature for dynamic property access */
  [key: string]: any;

  /** Observable map of schedules indexed by schedule ID */
  @observable accessor _schedulesByID: { [key: string]: Schedule } = {};

  /** Hook called before setting schedule list - for customization */
  beforeSetScheduleListHook: (schedules: Schedule[]) => void = (
    schedules: Schedule[]
  ) => {};

  /** Hook called after setting schedule list - for customization */
  afterSetScheduleListHook: (schedules: Schedule[]) => void = (
    schedules: Schedule[]
  ) => {};

  /**
   * Creates a new ScheduleStore instance
   * @param {CDF} [rootStore] - Optional reference to the root CDF store
   */
  constructor(rootStore?: CDF) {
    this.rootStore = rootStore || null;
  }

  /**
   * Provides access to the schedule map indexed by schedule IDs
   * This computed property ensures reactive access to the schedule store
   *
   * @computed
   * @returns {Object.<string, Schedule>} Map of schedules indexed by their IDs
   */
  @computed public get schedulesByID(): { [key: string]: Schedule } {
    return this._schedulesByID;
  }

  /**
   * Setter for schedules indexed by ID
   * @param {Object.<string, Schedule>} value - Map of schedules to set
   */
  @action public set schedulesByID(value: { [key: string]: Schedule }) {
    this._schedulesByID = value;
  }

  /**
   * Returns an array of all schedules in the store
   * This computed property provides a reactive list view of all schedules
   *
   * @computed
   * @returns {Schedule[]} Array of all schedules in the store
   */
  @computed get scheduleList(): Schedule[] {
    return Object.values(this._schedulesByID);
  }

  #interceptProxy(schedule: Schedule) {
    /**
     * Updates schedule in a node
     * @param {Object} param - Parameters for updating schedule
     * @param {string} param.nodeId - ID of the node to update
     * @param {any} param.action - Action to update
     * @param {string} param.name - Name of the schedule
     * @param {string} param.info - Info of the schedule
     * @param {string} param.id - ID of the schedule
     * @param {string} param.operation - Operation to perform
     * @param {string} param.triggers - Triggers of the schedule
     * @param {string} param.flags - Flags of the schedule
     * @param {string} param.validity - Validity of the schedule
     * @returns {void}
     */
    const updateNodeSchedule = (param: updateNodeScheduleParams) => {
      const {
        nodeId,
        action,
        name,
        info,
        id,
        triggers,
        flags,
        validity,
        operation,
      } = param;

      const node = this.rootStore?.nodeStore.nodesByID[nodeId];

      if (!node) {
        throw new Error(`Node with ID ${nodeId} not found`);
      }

      const nodeServices = node.nodeConfig?.services || [];
      const scheduleServiceIndex = nodeServices.findIndex(
        (service: ESPRMService) => service.type === ESPRM_SERVICE_SCHEDULES
      );

      if (scheduleServiceIndex === -1) {
        throw new Error(`Schedule service not found on node ${nodeId}`);
      }

      let schedules =
        nodeServices[scheduleServiceIndex].params.find(
          (param: any) => param.type === ESPRM_PARAM_SCHEDULES
        )?.value || [];

      let scheduleIndex = schedules.findIndex(
        (schedule: any) => schedule.id === id
      );

      switch (operation) {
        case ScheduleOperation.EDIT:
          schedules[scheduleIndex].name = name;
          schedules[scheduleIndex].info = info;
          schedules[scheduleIndex].action = action;
          schedules[scheduleIndex].triggers = triggers;
          schedules[scheduleIndex].flags = flags;
          schedules[scheduleIndex].validity = validity;
          break;
        case ScheduleOperation.ADD:
          schedules.push({
            id,
            name,
            info,
            action,
            triggers,
            flags,
            validity,
          });
          break;
        case ScheduleOperation.REMOVE:
          schedules.splice(scheduleIndex, 1);
          break;
        case ScheduleOperation.ENABLE:
          schedules[scheduleIndex].enabled = true;
          break;
        case ScheduleOperation.DISABLE:
          schedules[scheduleIndex].enabled = false;
          break;
        default:
          break;
      }

      const nodeConfig = {
        ...node.nodeConfig,
        services: nodeServices,
      } as ESPRMNodeConfig;

      this.rootStore?.nodeStore.updateNode(
        nodeId,
        nodeConfig,
        NodeUpdateType.NODE_CONFIG
      );
    };

    /** Interceptor for schedule addition */
    const addScheduleInterceptor = createInterceptor({
      rollback: (context) => {
        delete this._schedulesByID[context.id];
      },
      onSuccess: (result, args, context) => {
        const nodeList: string[] = [];
        result.forEach((response: ESPAPIResponse) => {
          const { node_id, status } = response as any;
          if (status === SUCCESS) {
            updateNodeSchedule({
              nodeId: node_id,
              action: context.action[node_id],
              name: context.name,
              info: context.info,
              id: context.id,
              operation: ScheduleOperation.ADD,
              triggers: context.triggers,
              flags: context.flags,
              validity: context.validity,
            });
          }
          nodeList.push(node_id);
        });
        this.syncSchedulesFromNodes(nodeList);
        return result;
      },
    });

    /** Interceptor for schedule updates
     *  Updates schedule in all nodes and synchronizes NodeStore
     */
    const updateScheduleInterceptor = createInterceptor({
      action: async (context, args) => {
        const devicesCount = Object.values(args[0].actions || {}).reduce(
          (acc: number, deviceCofig: any) => {
            acc += Object.keys(deviceCofig).length;
            return acc;
          },
          0
        );

        const updatedSchedule = new Schedule(
          {
            ...context,
            ...args[0],
            devicesCount: devicesCount,
          },
          this.rootStore!
        );

        const observableSchedule = makeEverythingObservable(updatedSchedule);
        this.#interceptProxy(observableSchedule);
        this._schedulesByID[updatedSchedule.id] = observableSchedule;
      },
      rollback: (_, prevContext) => {
        this._scenesByID[prevContext.id] = prevContext;
      },
      onSuccess: (result, args, context) => {
        const nodeList: string[] = [];

        result.forEach((response: ESPAPIResponse) => {
          const { node_id, status } = response as any;
          if (status === SUCCESS) {
            const operation = context.callbackUpdateOperation[node_id];
            updateNodeSchedule({
              nodeId: node_id,
              action: args[0].action[node_id],
              name: args[0].name,
              info: args[0].info,
              id: context.id,
              operation: operation,
              triggers: args[0].triggers,
              flags: args[0].flags,
              validity: args[0].validity,
            });
            nodeList.push(node_id);
          }
        });

        this._schedulesByID[context.id].callbackUpdateOperation = {};
        this.syncSchedulesFromNodes(nodeList);
        return result;
      },
    });

    /** Interceptor for schedule deletion */
    const deleteScheduleInterceptor = createInterceptor({
      rollback: (_, prevContext) => {
        this._schedulesByID[prevContext.id] = prevContext;
      },
      onSuccess: (result, args, context) => {
        const nodeList: string[] = [];
        result.forEach((response: ESPAPIResponse) => {
          const { node_id, status } = response as any;
          if (status === SUCCESS) {
            updateNodeSchedule({
              nodeId: node_id,
              id: context.id,
              operation: ScheduleOperation.REMOVE,
            });
            delete this._schedulesByID[context.id].action[node_id];
            nodeList.push(node_id);
          }
        });

        if (
          result.every(
            (response: ESPAPIResponse) => response.status === SUCCESS
          )
        ) {
          delete this._schedulesByID[context.id];
        } else {
          this.syncSchedulesFromNodes(nodeList);
        }
        return result;
      },
    });

    /** Interceptor for schedule enable */
    const enableScheduleInterceptor = createInterceptor({
      action: async (context, args) => {
        this._schedulesByID[context.id].enabled = true;
      },
      rollback: (_, prevContext) => {
        this._schedulesByID[prevContext.id] = prevContext;
      },
      onSuccess: (result, args, context) => {
        const nodeList: string[] = [];
        result.forEach((response: ESPAPIResponse) => {
          const { node_id, status } = response as any;
          if (status === SUCCESS) {
            updateNodeSchedule({
              nodeId: node_id,
              id: context.id,
              operation: ScheduleOperation.ENABLE,
            });
          }
          nodeList.push(node_id);
        });
        this.syncSchedulesFromNodes(nodeList);
        return result;
      },
    });

    /** Interceptor for schedule disable */
    const disableScheduleInterceptor = createInterceptor({
      action: async (context, args) => {
        this._schedulesByID[context.id].enabled = false;
      },
      rollback: (_, prevContext) => {
        this._schedulesByID[prevContext.id] = prevContext;
      },
      onSuccess: (result, args, context) => {
        const nodeList: string[] = [];
        result.forEach((response: ESPAPIResponse) => {
          const { node_id, status } = response as any;
          if (status === SUCCESS) {
            updateNodeSchedule({
              nodeId: node_id,
              id: context.id,
              operation: ScheduleOperation.DISABLE,
            });
          }
          nodeList.push(node_id);
        });
        this.syncSchedulesFromNodes(nodeList);
        return result;
      },
    });

    // Attach interceptors to schedule object methods
    proxyActionHandler(schedule, "edit", updateScheduleInterceptor);
    proxyActionHandler(schedule, "remove", deleteScheduleInterceptor);
    proxyActionHandler(schedule, "add", addScheduleInterceptor);
    proxyActionHandler(schedule, "enable", enableScheduleInterceptor);
    proxyActionHandler(schedule, "disable", disableScheduleInterceptor);
  }

  /**
   * Determines if a schedule's configuration is synchronized with given schedule data
   * This method performs deep comparison of schedule properties to detect any differences
   *
   * @param {Schedule} existingSchedule - The existing schedule instance to compare
   * @param {any} scheduleData - New schedule data to compare against
   * @param {string[]} keys - Array of property keys to compare (e.g., ['name', 'enabled', 'triggers'])
   * @returns {{ isInSync: boolean, meta?: Record<string, any> }} Sync status and any out-of-sync metadata
   *
   * @example
   * // Check if schedule is in sync
   * const { isInSync, meta } = scheduleStore.isScheduleInSync(
   *   existingSchedule,
   *   newScheduleData,
   *   ['name', 'enabled', 'triggers']
   * );
   *
   * if (!isInSync) {
   *   console.log('Out of sync properties:', meta);
   *   // Handle out of sync state
   *   existingSchedule.addOutOfSyncMeta(nodeId, meta);
   * }
   *
   * @remarks
   * - Performs deep comparison for arrays and objects
   * - Returns metadata about which properties are out of sync
   * - Used internally during node synchronization
   */
  isScheduleInSync = (
    existingSchedule: Schedule,
    scheduleData: any,
    keys: string[]
  ): { isInSync: boolean; meta?: Record<string, any> } => {
    let isInSync = true;
    const outOfSyncMeta: Record<string, any> = {};

    keys.forEach((key) => {
      const existingValue = existingSchedule[key as keyof Schedule];
      const newValue = scheduleData[key];

      if (Array.isArray(existingValue) && Array.isArray(newValue)) {
        if (!compareArrays(existingValue, newValue)) {
          isInSync = false;
          outOfSyncMeta[key] = newValue;
        }
      } else if (
        typeof existingValue === "object" &&
        typeof newValue === "object"
      ) {
        if (JSON.stringify(existingValue) !== JSON.stringify(newValue)) {
          isInSync = false;
          outOfSyncMeta[key] = newValue;
        }
      } else if (
        existingValue !== newValue &&
        newValue !== null &&
        newValue !== undefined
      ) {
        isInSync = false;
        outOfSyncMeta[key] = newValue;
      }
    });

    return {
      isInSync,
      meta: Object.keys(outOfSyncMeta).length > 0 ? outOfSyncMeta : undefined,
    };
  };
  /**
   * Transforms a list of ESP Rainmaker nodes into a unified schedule representation
   *
   * This method is responsible for:
   * 1. Extracting schedule configurations from each node's services
   * 2. Merging schedules that exist across multiple nodes
   * 3. Detecting and handling out-of-sync configurations
   * 4. Creating observable Schedule instances
   *
   * @param {ESPRMNode[]} nodeList - Array of ESP Rainmaker nodes to process
   * @returns {Object.<string, Schedule>} Map of unified schedules indexed by schedule ID
   */
  #transformNodeListToSchedules = (
    nodeList: ESPRMNode[]
  ): { [key: string]: Schedule } => {
    return nodeList.reduce(
      (acc, node) => {
        const schedule = node?.nodeConfig?.services?.find(
          (service: ESPRMService) => service.type === ESPRM_SERVICE_SCHEDULES
        );
        if (!schedule) return acc;

        const scheduleList =
          schedule.params.find(
            (param: any) => param.type === ESPRM_PARAM_SCHEDULES
          )?.value || [];
        scheduleList.forEach((scheduleData: any) => {
          if (acc[scheduleData.id]) {
            acc[scheduleData.id].nodes.push(node.id);
            acc[scheduleData.id].action[node.id] = scheduleData.action;
            acc[scheduleData.id].devicesCount += Object.keys(
              scheduleData.action
            ).length;

            const { isInSync, meta } = this.isScheduleInSync(
              acc[scheduleData.id],
              scheduleData,
              ["name", "enabled", "triggers", "validity", "flags", "info"]
            );
            if (!isInSync) {
              acc[scheduleData.id].addOutOfSyncMeta(node.id, meta);
            }
          } else {
            if (this.rootStore) {
              acc[scheduleData.id] = new Schedule(
                {
                  ...scheduleData,
                  nodes: [node.id],
                  action: { [node.id]: scheduleData.action },
                  devicesCount: Object.keys(scheduleData.action).length,
                  outOfSyncMeta: {},
                },
                this.rootStore
              );
            }
          }
        });

        return acc;
      },
      {} as Record<string, Schedule>
    );
  };

  /**
   * Creates a new schedule with the provided configuration
   *
   * This action method:
   * 1. Generates a unique schedule ID if not provided
   * 2. Sets default values for optional parameters
   * 3. Creates an observable Schedule instance
   * 4. Adds the schedule to the store
   * 5. Triggers the schedule creation on the device
   *
   * @param {Partial<Schedule>} scheduleData - Partial schedule configuration
   * @returns {Promise<Schedule>} Created and initialized schedule instance
   * @throws {Error} If schedule creation fails
   *
   * @example
   * // Create a daily morning schedule
   * const schedule = await scheduleStore.createSchedule({
   *   name: 'Morning Routine',
   *   nodes: ['bedroom_light', 'kitchen_light'],
   *   action: {
   *     bedroom_light: { light: { power: true, brightness: 60 } },
   *     kitchen_light: { light: { power: true, brightness: 100 } }
   *   },
   *   triggers: [{ m: 420, d: 127 }], // 7:00 AM every day
   *   info: 'Automated morning lighting'
   * });
   */
  @action createSchedule = async (
    scheduleData: Partial<Schedule>
  ): Promise<Schedule> => {
    try {
      const devicesCount = Object.values(scheduleData.action || {}).reduce(
        (acc: number, deviceCofig: any) => {
          acc += Object.keys(deviceCofig).length;
          return acc;
        },
        0
      );

      const scheduleDataObj = {
        id: scheduleData.id || `schedule_${Date.now()}`,
        name: scheduleData.name || "New Schedule",
        nodes: scheduleData.nodes || [],
        action: scheduleData.action || {},
        devicesCount: devicesCount,
        triggers: scheduleData.triggers || [],
        validity: scheduleData.validity || null,
        flags: scheduleData.flags || null,
        info: scheduleData.info || null,
        enabled: scheduleData.enabled || false,
        outOfSyncMeta: {},
      } as Schedule;

      const schedule = new Schedule(scheduleDataObj, this.rootStore!);
      const observableSchedule = this.addSchedule(schedule);
      await observableSchedule.add();
      return observableSchedule;
    } catch (error) {
      throw error;
    }
  };

  /*
   * Get a schedule by its ID
   * @param {string} scheduleId - The ID of the schedule to get
   * @returns {Schedule | null} The schedule or null if not found
   */
  public getSchedule = (scheduleId: string): Schedule | null => {
    return this._schedulesByID[scheduleId] || null;
  };

  /*
   * Set the schedule list
   * @param {Schedule[]} schedules - The schedules to set
   */
  public setScheduleList = (schedules: Schedule[]) => {
    this._schedulesByID = schedules.reduce(
      (acc, schedule) => {
        acc[schedule.id] = schedule;
        return acc;
      },
      {} as Record<string, Schedule>
    );
  };

  /*
   * Add a schedule to the store
   * @param {Schedule} schedule - The schedule to add
   * @returns {Schedule} The added schedule
   */
  @action addSchedule = (schedule: Schedule) => {
    const observableSchedule = makeEverythingObservable(schedule);
    this.#interceptProxy(observableSchedule);
    this._schedulesByID[schedule.id] = observableSchedule;
    return observableSchedule;
  };

  /*
   * Update a schedule by its ID
   * @param {string} id - The ID of the schedule to update
   * @param {Schedule} schedule - The schedule to update
   */
  @action updateScheduleByID = (id: string, schedule: Schedule) => {
    this._schedulesByID[id] = schedule;
  };

  /*
   * Delete a schedule by its ID
   * @param {string} id - The ID of the schedule to delete
   */
  @action deleteSchedules = (ids: string[]) => {
    ids.forEach((id) => delete this._schedulesByID[id]);
  };

  /**
   * Synchronizes schedules from specified nodes
   *
   * This action method:
   * 1. Clears existing schedules from the store
   * 2. Fetches schedule configurations from specified nodes
   * 3. Transforms node configurations into Schedule instances
   * 4. Detects and handles out-of-sync configurations
   * 5. Updates the store with synchronized schedules
   *
   * @param {string[]} nodeIds - Array of node IDs to sync schedules from
   * @returns {Promise<void>}
   * @throws {Error} If synchronization fails
   */
  @action syncSchedulesFromNodes = async (nodeIds: string[]): Promise<void> => {
    try {
      this.clear();
      const nodeList =
        this.rootStore?.nodeStore.nodeList.filter((node) =>
          nodeIds.includes(node.id)
        ) || [];
      const transformedSchedules = this.#transformNodeListToSchedules(nodeList);
      // Merge with existing schedules, preserving any custom data
      Object.keys(transformedSchedules).forEach((scheduleId) => {
        this.addSchedule(transformedSchedules[scheduleId]);
      });
    } catch (error) {
      throw error;
    }
  };

  /**
   * Enables a schedule by its ID
   *
   * This action method activates a schedule, allowing it to execute according to its triggers.
   * The change is synchronized across all nodes associated with the schedule.
   *
   * @param {string} scheduleId - ID of the schedule to enable
   * @returns {Promise<void>}
   * @throws {Error} If schedule is not found or enabling fails
   */
  @action enableSchedule = async (scheduleId: string): Promise<void> => {
    const schedule = this._schedulesByID[scheduleId];
    if (!schedule) {
      throw new Error(`Schedule with ID ${scheduleId} not found`);
    }
    await schedule.enable();
  };

  /**
   * Disable a schedule by its ID
   * @param {string} scheduleId - The ID of the schedule to disable
   * @returns {Promise<void>}
   * @throws {Error} If schedule is not found or disabling fails
   */
  @action disableSchedule = async (scheduleId: string): Promise<void> => {
    const schedule = this._schedulesByID[scheduleId];
    if (!schedule) {
      throw new Error(`Schedule with ID ${scheduleId} not found`);
    }
    await schedule.disable();
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
      this: ScheduleStore,
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
    this._schedulesByID = {};
    this.beforeSetScheduleListHook = () => {};
    this.afterSetScheduleListHook = () => {};
  }
}

export default ScheduleStore;
