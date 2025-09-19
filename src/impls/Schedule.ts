import {
  Schedule as ScheduleInterface,
  ESPAPIResponse,
  CDF,
  ScheduleEditParams,
  ScheduleTrigger,
  ScheduleAction,
  SchedulePayload,
  ScheduleOperationParams,
  ScheduleGeneratePayloadParams,
  MultiNodeResponsePayload,
} from "../types/index";
import { ScheduleOperation, SUCCESS } from "../utils/constants";
import { isEqual, compareArrays } from "../utils/common";

/**
 * Schedule - Manages schedule operations
 *
 * This class handles all schedule-related operations including:
 * - Schedule CRUD operations (Create, Read, Update, Delete)
 * - Schedule enable/disable functionality
 * - Schedule transformation and payload generation
 * - Node-specific schedule operations
 *
 * @class Schedule
 * @implements {ScheduleInterface}
 */
class Schedule implements ScheduleInterface {
  #rootStore?: CDF | null;
  readonly id: string;
  name: string;
  nodes: string[];
  enabled?: boolean;
  triggers: ScheduleTrigger[];
  action: ScheduleAction;
  devicesCount: number;
  info?: string | null;
  flags?: number | null;
  validity?: {
    start: number;
    end: number;
  } | null;
  outOfSyncMeta: Record<string, any>;
  add: () => Promise<ESPAPIResponse | undefined | MultiNodeResponsePayload[]>;
  edit: ({
    name,
    triggers,
    action,
    info,
    flags,
    validity,
  }: ScheduleEditParams) => Promise<
    ESPAPIResponse | undefined | MultiNodeResponsePayload[]
  >;
  remove: () => Promise<
    ESPAPIResponse | undefined | MultiNodeResponsePayload[]
  >;
  disable: () => Promise<
    ESPAPIResponse | undefined | MultiNodeResponsePayload[]
  >;
  enable: () => Promise<
    ESPAPIResponse | undefined | MultiNodeResponsePayload[]
  >;
  callbackUpdateOperation: { [key: string]: ScheduleOperation };

  /**
   * Creates a new Schedule instance
   *
   * Initializes a schedule with the provided data and sets up the necessary
   * operations and bindings. The schedule is linked to the root store for
   * accessing other stores and services.
   *
   * @param {Schedule} schedule - The schedule data to initialize with
   * @param {CDF} rootStore - Reference to the root CDF store
   *
   * @example
   * const schedule = new Schedule({
   *   id: 'schedule123',
   *   name: 'Morning Schedule',
   *   nodes: ['node1'],
   *   action: { node1: { light: { power: true } } }
   *   triggers: [{ m: 30, d: 1 }]
   * }, rootStore);
   */
  constructor(schedule: Schedule, rootStore: CDF) {
    this.validateSchedule(schedule);
    this.#rootStore = rootStore;

    this.id = schedule.id;
    this.name = schedule.name;
    this.nodes = schedule.nodes || [];
    this.enabled = schedule.enabled || false;
    this.triggers = schedule.triggers || [];
    this.action = schedule.action || {};
    this.devicesCount = schedule.devicesCount || 0;
    this.info = schedule.info || null;
    this.flags = schedule.flags || null;
    this.validity = schedule.validity || null;
    this.outOfSyncMeta = schedule.outOfSyncMeta || {};

    this.edit = (args: ScheduleEditParams) => this.#edit(args);
    this.remove = this.#remove.bind(this);
    this.disable = this.#disable.bind(this);
    this.enable = this.#enable.bind(this);
    this.add = this.#add.bind(this);
    this.callbackUpdateOperation = {};
  }

  /**
   * Generates payload for schedule operations based on the ESP Rainmaker SDK format
   *
   * This function creates the correct payload structure for schedule operations:
   * - ADD: Creates a new schedule with required and optional parameters
   *        Required: id, name, action, triggers, operation
   *        Optional: info, flags, validity
   * - EDIT: Updates an existing schedule with new configuration
   *        Required: id, name, action, triggers, operation
   *        Optional: info, flags, validity
   * - REMOVE: Removes a schedule by ID
   *        Required: id, operation
   * - ENABLE/DISABLE: Toggles schedule activation state
   *        Required: id, operation
   *
   * @see {@link https://docs.rainmaker.espressif.com/docs/product_overview/features/scheduling#add-a-new-schedule API Reference}
   *
   * @param {ScheduleOperation} type              - Operation type (ADD/EDIT/REMOVE/ENABLE/DISABLE)
   * @param {Object} param                        - Payload parameters
   * @param {ScheduleAction} param.action         - Device action configuration (e.g., power, brightness)
   * @param {string} param.nodeId                 - Target node identifier
   * @param {ScheduleTrigger[]} param.triggers    - Array of schedule triggers:
   *                                                  m: minutes since midnight (0-1439)
   *                                                  d: days bitmap (LSB is Monday)
   *                                                  dd: date (1-31)
   *                                                  mm: months bitmap (LSB is January)
   *                                                  yy: year (e.g., 2024)
   *                                                  r: repeat yearly flag
   *                                                  rsec: relative seconds from now
   * @param {string} param.scheduleId             - Unique schedule identifier
   * @param {string} param.scheduleName           - Human-readable schedule name
   * @param {string} [param.info]                 - Optional schedule description
   * @param {number} [param.flags]                - Optional schedule configuration flags
   * @param {{
   *    start: number;                            - Start timestamp (Unix seconds)
   *    end: number;                              - End timestamp (Unix seconds)
   * }} [param.validity]                          - Optional schedule validity period
   *
   * @returns {SchedulePayload} Formatted payload for ESP Rainmaker API
   * @throws {Error} When operation type is unknown or nodeId is missing
   *
   * @example
   * // Create a schedule for weekday mornings
   * const payload = this.#generatePayload(
   *     ScheduleOperation.ADD,
   *     {
   *         action: {                            // Device actions
   *             light: {
   *                 power: true,                 // Turn on
   *                 brightness: 100              // Full brightness
   *             }
   *         },
   *         nodeId: 'node123',                   // Target device
   *         triggers: [{                         // Schedule timing
   *             m: 480,                          // 8:00 AM (480 minutes)
   *             d: 31,                           // Mon-Fri (11111 in binary)
   *         }],
   *         scheduleId: 'schedule456',           // Unique ID
   *         scheduleName: 'Morning Routine',     // Display name
   *         info: 'Weekday morning lights',      // Description
   *         flags: 0,                            // No special flags
   *         validity: {                          // Active period
   *             start: 1673567400,               // Jan 13, 2024
   *             end: 1704931800                  // Jan 13, 2025
   *         }
   *     }
   * );
   */
  #generatePayload(
    type: ScheduleOperation,
    param?: ScheduleGeneratePayloadParams
  ): SchedulePayload {
    const {
      action,
      nodeId,
      triggers,
      scheduleId,
      scheduleName,
      info,
      flags,
      validity,
    } = param || {};
    // Helper function to create payload with only defined values
    const createPayload = (basePayload: Record<string, any>) => {
      const payload: Record<string, any> = { ...basePayload };
      // Only add optional fields if they are defined
      if (info !== null) payload.info = info;
      if (flags !== null) payload.flags = flags;
      if (validity !== null) payload.validity = validity;

      return payload;
    };

    // Schedule payload based on operation type
    const schedulePayload: Record<string, any> = {
      [ScheduleOperation.ADD]: createPayload({
        id: scheduleId,
        operation: ScheduleOperation.ADD,
        name: scheduleName,
        action: action,
        info: info,
        triggers: triggers,
        flags: flags,
        validity: validity,
      }),
      [ScheduleOperation.REMOVE]: {
        id: scheduleId,
        operation: ScheduleOperation.REMOVE,
      },
      [ScheduleOperation.EDIT]: createPayload({
        id: scheduleId,
        name: scheduleName,
        operation: ScheduleOperation.EDIT,
        action: action,
        info: info,
        triggers: triggers,
        flags: flags,
        validity: validity,
      }),
      [ScheduleOperation.ENABLE]: {
        id: scheduleId,
        operation: ScheduleOperation.ENABLE,
      },
      [ScheduleOperation.DISABLE]: {
        id: scheduleId,
        operation: ScheduleOperation.DISABLE,
      },
    };

    const payload = schedulePayload[type];
    if (!payload) {
      throw new Error(`Unknown operation type: ${type}`);
    }
    if (!nodeId) {
      throw new Error("nodeId is required for generating payload");
    }

    return {
      nodeId,
      payload: {
        Schedule: [
          {
            Schedules: [payload],
          },
        ],
      },
    };
  }

  /**
   * Determines the appropriate operation type for editing a Schedule based on action existence
   * @param nodeId - The node identifier
   * @param newaction - The new action to be applied
   * @returns The operation type: ScheduleOperation.ADD, ScheduleOperation.EDIT, or ScheduleOperation.REMOVE
   */
  #determineEditOperation(
    nodeId: string,
    newaction: any,
    scheduleName: string,
    triggers: ScheduleTrigger[],
    info: string | null | undefined,
    flags: number | null | undefined,
    validity: { start: number; end: number } | null | undefined
  ): ScheduleOperation {
    if (!nodeId) {
      throw new Error("nodeId is required for determining edit operation");
    }

    const existInOldaction = !!this.action[nodeId];
    const existInNewaction = !!newaction?.[nodeId];

    if (existInOldaction && !existInNewaction) return ScheduleOperation.REMOVE;
    if (!existInOldaction && existInNewaction) return ScheduleOperation.ADD;
    if (
      existInOldaction &&
      existInNewaction &&
      !isEqual(this.action[nodeId], newaction[nodeId])
    ) {
      return ScheduleOperation.EDIT;
    }

    if (scheduleName !== this.name) return ScheduleOperation.EDIT;
    if (!compareArrays(triggers, this.triggers)) return ScheduleOperation.EDIT;
    if (info !== this.info) return ScheduleOperation.EDIT;
    if (flags !== this.flags) return ScheduleOperation.EDIT;
    if (!isEqual(validity, this.validity)) return ScheduleOperation.EDIT;

    // Default case: no change needed (both action are falsy)
    return ScheduleOperation.NO_CHANGE;
  }

  /**
   * Handles all schedule operations by generating and sending appropriate payloads
   *
   * This method is the core handler for all schedule operations. It handles:
   * - Payload generation for each operation type
   * - Node-specific operation determination for edits
   * - Batch processing for multiple nodes
   * - API communication with ESP Rainmaker
   *
   * Operation Types and Required Parameters:
   * - ADD:     Requires name, triggers, action
   * - EDIT:    Requires name, triggers, action (automatically determines add/edit/remove per node)
   * - REMOVE:  Only requires type (uses current schedule ID)
   * - ENABLE:  Only requires type (uses current schedule ID)
   * - DISABLE: Only requires type (uses current schedule ID)
   *
   * @param {ScheduleOperation} type                     - Operation to perform
   * @param {Object} [param]                             - Operation parameters
   * @param {string} [param.scheduleName]                - Schedule display name (defaults to current name)
   * @param {ScheduleTrigger[]} [param.triggers]         - Schedule triggers array with options:
   *                                                         m: minutes (0-1439, e.g., 480 = 8:00 AM)
   *                                                         d: days bitmap (31 = Mon-Fri)
   *                                                         dd: date (1-31)
   *                                                         mm: months bitmap
   *                                                         yy: year
   *                                                         r: repeat flag
   *                                                         rsec: relative seconds
   * @param {ScheduleAction} [param.action]              - Device actions per node:
   *                                                         { nodeId: { deviceType: { param: value } } }
   * @param {string[]} [param.nodes]                     - Target node IDs (defaults to current nodes)
   * @param {string} [param.info]                        - Schedule description
   * @param {number} [param.flags]                       - Configuration flags
   * @param {{
   *    start: number;                                   - Start time (Unix timestamp)
   *    end: number;                                     - End time (Unix timestamp)
   * }} [param.validity]                                 - Schedule validity period
   *
   * @returns {Promise<ESPAPIResponse | undefined>} Response from the ESP Rainmaker API
   * @throws {Error} When:
   *    - User is not found in root store
   *    - Required parameters are missing
   *    - API operation fails
   *
   * @example
   * // Simple enable operation
   * await this.#operations(ScheduleOperation.ENABLE);
   *
   * @example
   * // Create weekday morning schedule
   * await this.#operations(
   *     ScheduleOperation.ADD,
   *     {
   *         scheduleName: 'Morning Routine',
   *         triggers: [{
   *             m: 480,                                  // 8:00 AM
   *             d: 31,                                   // Mon-Fri (11111)
   *             r: true                                  // Repeat weekly
   *         }],
   *         action: {
   *             'node1': {                               // Actions per node
   *                 light: {
   *                     power: true,                     // Turn on
   *                     brightness: 80                   // Set brightness
   *                 }
   *             }
   *         },
   *         nodes: ['node1'],
   *         info: 'Automatic morning lights',
   *         validity: {
   *             start: 1673567400,                       // Schedule start date
   *             end: 1704931800                          // Schedule end date
   *         }
   *     }
   * );
   *
   * @see {@link https://docs.rainmaker.espressif.com/docs/product_overview/features/scheduling API Reference}
   */
  #operations = (
    type: ScheduleOperation,
    param?: ScheduleOperationParams
  ): Promise<ESPAPIResponse | undefined | MultiNodeResponsePayload[]> => {
    const {
      scheduleName = this.name,
      triggers = this.triggers,
      action = this.action,
      nodes = this.nodes,
      info = this.info,
      flags = this.flags,
      validity = this.validity,
    } = param || {};
    const user = this.#rootStore?.userStore.user;
    if (!user) {
      throw new Error("User not found");
    }

    const payload = nodes.reduce((acc: any, nodeId: string) => {
      if (type === ScheduleOperation.EDIT) {
        // Handle edit operations with dynamic operation type determination
        const operationType = this.#determineEditOperation(
          nodeId,
          action,
          scheduleName,
          triggers,
          info,
          flags,
          validity
        );

        if (operationType === ScheduleOperation.NO_CHANGE) {
          return acc;
        }
        this.callbackUpdateOperation[nodeId] = operationType;
        acc.push(
          this.#generatePayload(operationType, {
            action: action[nodeId],
            nodeId,
            triggers,
            scheduleId: this.id,
            scheduleName,
            info,
            flags,
            validity,
          })
        );
        return acc;
      }

      // Handle other operation types directly
      acc.push(
        this.#generatePayload(type, {
          action: action[nodeId],
          nodeId,
          triggers,
          scheduleId: this.id,
          scheduleName,
          info,
          flags,
          validity,
        })
      );

      return acc;
    }, []);

    if (payload.length === 0) {
      // If no changes, return success response for all nodes
      const response = nodes.map((nodeId) => ({
        node_id: nodeId,
        status: SUCCESS,
        description: "",
      }));
      return new Promise((resolve) => resolve(response));
    }
    // Send the payload to the setMultipleNodesParams SDK api
    // ref - https://espressif.github.io/esp-rainmaker-app-sdk-ts/classes/ESPRMUser.ESPRMUser.html#setmultiplenodesparams
    return user.setMultipleNodesParams(payload);
  };

  // ========================================================================
  // OPERATIONS
  // ========================================================================

  /**
   * Adds a new schedule to the system
   *
   * Creates a new schedule with the current configuration and sends it to all
   * associated nodes through the ESP Rainmaker API.
   *
   * @returns {Promise<ESPAPIResponse | undefined>} API response from the add operation
   * @throws {Error} If the operation fails
   *
   * @example
   * const response = await schedule.add();
   */
  #add = (): Promise<
    ESPAPIResponse | undefined | MultiNodeResponsePayload[]
  > => {
    return this.#operations(ScheduleOperation.ADD);
  };

  /**
   * Updates an existing schedule with new configuration
   *
   * This method updates the schedule across all associated nodes with new parameters.
   * It can modify the name, triggers, action, and other properties of the schedule.
   *
   * @param {string} params.name                                          - New name for the schedule
   * @param {ScheduleTrigger} params.triggers                             - Updated trigger configuration
   * @param {ScheduleAction} params.action                                - Updated action configuration
   * @param {string} [params.info]                                        - Updated schedule information
   * @param {number} [params.flags]                                       - Updated schedule flags
   * @param {{ start: number, end: number }} [params.validity]            - Updated validity period
   * @returns {Promise<ESPAPIResponse | undefined>}                       - API response from the edit operation
   *
   */
  #edit = ({
    name,
    triggers,
    action,
    info,
    flags,
    validity,
  }: ScheduleEditParams): Promise<
    ESPAPIResponse | undefined | MultiNodeResponsePayload[]
  > => {
    const nodes = Object.keys({ ...action, ...this.action });
    return this.#operations(ScheduleOperation.EDIT, {
      scheduleName: name,
      triggers,
      action,
      nodes,
      info,
      flags,
      validity,
    });
  };

  /**
   * Removes the schedule from all associated nodes
   *
   * This method deletes the schedule configuration from all nodes where it exists.
   * The operation is performed through the ESP Rainmaker API.
   *
   * @returns {Promise<ESPAPIResponse | undefined>} API response from the remove operation
   * @throws {Error} If the operation fails
   *
   * @example
   * const response = await schedule.remove();
   */
  #remove = (): Promise<
    ESPAPIResponse | undefined | MultiNodeResponsePayload[]
  > => {
    return this.#operations(ScheduleOperation.REMOVE);
  };

  /**
   * Re-enables a previously disabled schedule
   *
   * This method activates a schedule that was previously disabled,
   * allowing it to execute according to its configured triggers.
   *
   * @returns {Promise<ESPAPIResponse | undefined>} API response from the enable operation
   * @throws {Error} If the operation fails
   *
   * @example
   * const response = await schedule.enable();
   */
  #enable = (): Promise<
    ESPAPIResponse | undefined | MultiNodeResponsePayload[]
  > => {
    return this.#operations(ScheduleOperation.ENABLE);
  };

  /**
   * Disables the schedule temporarily without removing it
   *
   * This method disables the schedule execution while preserving its configuration.
   * The schedule can be re-enabled later using the enable method.
   *
   * @returns {Promise<ESPAPIResponse | undefined>} API response from the disable operation
   * @throws {Error} If the operation fails
   *
   * @example
   * const response = await schedule.disable();
   */
  #disable = (): Promise<
    ESPAPIResponse | undefined | MultiNodeResponsePayload[]
  > => {
    return this.#operations(ScheduleOperation.DISABLE);
  };

  /**
   * Checks if the schedule is enabled
   *
   * @returns {boolean} True if the schedule is enabled, false otherwise
   */
  isEnabled = (): boolean => {
    return this.enabled || false;
  };

  // ========================================================================
  // OUT-OF-SYNC METADATA
  // ========================================================================

  /**
   * Adds out-of-sync metadata for a specific node
   *
   * This method stores metadata indicating that a node's schedule configuration
   * is not synchronized with the server state.
   *
   * @param {string} nodeId - The identifier of the node
   * @param {any} value - The metadata value to store
   *
   * @example
   * schedule.addOutOfSyncMeta('node1', { lastSync: timestamp });
   */
  addOutOfSyncMeta = (nodeId: string, value: any) => {
    this.outOfSyncMeta[nodeId] = value;
  };

  /**
   * Retrieves out-of-sync metadata for a specific node
   *
   * @param {string} nodeId - The identifier of the node
   * @returns {any} The stored metadata for the node
   *
   * @example
   * const syncStatus = schedule.getOutOfSyncMeta('node1');
   */
  getOutOfSyncMeta = (nodeId: string) => {
    return this.outOfSyncMeta[nodeId];
  };

  /**
   * Removes out-of-sync metadata for a specific node
   *
   * This method clears the stored metadata indicating that a node's schedule
   * configuration has been synchronized.
   *
   * @param {string} nodeId - The identifier of the node
   *
   * @example
   * schedule.removeOutOfSyncMeta('node1');
   */
  removeOutOfSyncMeta = (nodeId: string) => {
    delete this.outOfSyncMeta[nodeId];
  };

  /**
   * Clears all out-of-sync metadata
   *
   * This method removes all stored metadata about node synchronization status,
   * effectively marking all nodes as synchronized.
   *
   * @example
   * schedule.clearOutOfSyncMeta();
   */
  clearOutOfSyncMeta = () => {
    this.outOfSyncMeta = {};
  };

  validateSchedule = ({ name, triggers, action }: Schedule) => {
    if (!name) {
      throw new Error("Name is required");
    }
    if (!triggers) {
      throw new Error("Triggers are required");
    }
    if (
      !triggers.every(
        (trigger) => trigger.m !== undefined || trigger.rsec !== undefined
      )
    ) {
      throw new Error(
        "Every trigger must have either minutes (m) or relative seconds (rsec) defined"
      );
    }
    if (!action) {
      throw new Error("Action is required");
    }
    if (Object.keys(action).length === 0) {
      throw new Error("Action must contain at least one node configuration");
    }
  };
}

export default Schedule;
