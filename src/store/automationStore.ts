/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { CDF } from "./index";
import { observable, action, computed } from "mobx";
import {
  ESPAutomation,
  ESPPaginatedAutomationsResponse,
  ESPGeoCoordinates,
  ESPAutomationEventType,
} from "../types/index";
import {
  makeEverythingObservable,
  proxyActionHandler,
  createInterceptor,
  extendObservable,
  capitalize,
} from "../utils/common";
import * as constants from "../utils/constants";

class AutomationStore {
  private readonly rootStore: CDF | null;

  #fetchNextRef: Function | null = null;

  // for dynamic properties addition
  [key: string]: any;

  #interceptProxy(automation: ESPAutomation) {
    const updateNameInterceptor = createInterceptor({
      action: (context: ESPAutomation, args) => {
        context.automationName = args[0];
      },
      rollback: (context: ESPAutomation, prevContext: ESPAutomation) => {
        context.automationName = prevContext.automationName;
      },
    });

    const updateLocationInterceptor = createInterceptor({
      action: (context: ESPAutomation, args) => {
        context.location = args[0];
      },
      rollback: (context: ESPAutomation, prevContext: ESPAutomation) => {
        context.location = prevContext.location;
      },
    });

    const enableInterceptor = createInterceptor({
      action: (context: ESPAutomation, args) => {
        context.enabled = args[0];
      },
      rollback: (context: ESPAutomation, prevContext: ESPAutomation) => {
        context.enabled = prevContext.enabled;
      },
    });

    const updateEventsInterceptor = createInterceptor({
      action: (context: ESPAutomation, args) => {
        context.events = args[0];
      },
      rollback: (context: ESPAutomation, prevContext: ESPAutomation) => {
        context.events = prevContext.events;
      },
    });

    const updateActionsInterceptor = createInterceptor({
      action: (context: ESPAutomation, args) => {
        context.actions = args[0];
      },
      rollback: (context: ESPAutomation, prevContext: ESPAutomation) => {
        context.actions = prevContext.actions;
      },
    });

    const setRetriggerInterceptor = createInterceptor({
      action: (context: ESPAutomation, args) => {
        context.retrigger = args[0];
      },
      rollback: (context: ESPAutomation, prevContext: ESPAutomation) => {
        context.retrigger = prevContext.retrigger;
      },
    });

    const deleteInterceptor = createInterceptor({
      action: (context: ESPAutomation, args) => {
        const { automationId } = context;
        this.removeAutomationFromLists(automationId);
      },
      rollback: (context: ESPAutomation, prevContext: ESPAutomation) => {
        this.addAutomationToList(prevContext);
      },
    });

    const updateInterceptor = createInterceptor({
      action: (context: ESPAutomation, args) => {
        const automationDetails = args[0];
        Object.assign(context, automationDetails);
      },
      rollback: (context: ESPAutomation, prevContext: ESPAutomation) => {
        Object.assign(context, prevContext);
      },
    });

    // Apply interceptors to automation methods
    proxyActionHandler(automation, "updateName", updateNameInterceptor);
    proxyActionHandler(automation, "updateLocation", updateLocationInterceptor);
    proxyActionHandler(automation, "enable", enableInterceptor);
    proxyActionHandler(automation, "updateEvents", updateEventsInterceptor);
    proxyActionHandler(automation, "updateActions", updateActionsInterceptor);
    proxyActionHandler(automation, "setRetrigger", setRetriggerInterceptor);
    proxyActionHandler(automation, "delete", deleteInterceptor);
    proxyActionHandler(automation, "update", updateInterceptor);
  }

  // Observable properties organized by event type
  @observable accessor _nodeAutomations: { [key: string]: ESPAutomation } = {};
  @observable accessor _weatherAutomations: { [key: string]: ESPAutomation } =
    {};
  @observable accessor _daylightAutomations: { [key: string]: ESPAutomation } =
    {};
  @observable accessor _geoCoordinates: ESPGeoCoordinates | null = null;

  // pagination handler refs
  @observable accessor _hasNext: boolean = false;

  constructor(rootStore?: CDF) {
    this.rootStore = rootStore || null;
  }

  // Helper method to add automation to appropriate list
  private addAutomationToList(automation: ESPAutomation): ESPAutomation {
    const observableAutomation = makeEverythingObservable(automation);
    this.#interceptProxy(observableAutomation);

    switch (automation.eventType) {
      case ESPAutomationEventType.NodeParams:
        this._nodeAutomations[automation.automationId] = observableAutomation;
        break;
      case ESPAutomationEventType.Weather:
        this._weatherAutomations[automation.automationId] =
          observableAutomation;
        break;
      case ESPAutomationEventType.Daylight:
        this._daylightAutomations[automation.automationId] =
          observableAutomation;
        break;
      default:
        // Default to node automations
        this._nodeAutomations[automation.automationId] = observableAutomation;
    }

    return observableAutomation;
  }

  // Helper method to remove automation from all lists
  private removeAutomationFromLists(automationId: string): void {
    delete this._nodeAutomations[automationId];
    delete this._weatherAutomations[automationId];
    delete this._daylightAutomations[automationId];
  }

  // Getters and Setters for Node Automations
  public get nodeAutomations(): { [key: string]: ESPAutomation } {
    return this._nodeAutomations;
  }
  public set nodeAutomations(value: { [key: string]: ESPAutomation }) {
    this._nodeAutomations = value;
  }

  // Getters and Setters for Weather Automations
  public get weatherAutomations(): { [key: string]: ESPAutomation } {
    return this._weatherAutomations;
  }
  public set weatherAutomations(value: { [key: string]: ESPAutomation }) {
    this._weatherAutomations = value;
  }

  // Getters and Setters for Daylight Automations
  public get daylightAutomations(): { [key: string]: ESPAutomation } {
    return this._daylightAutomations;
  }
  public set daylightAutomations(value: { [key: string]: ESPAutomation }) {
    this._daylightAutomations = value;
  }

  // General getters
  public get hasNext(): boolean {
    return this._hasNext;
  }

  public get geoCoordinates(): ESPGeoCoordinates | null {
    return this._geoCoordinates;
  }
  public set geoCoordinates(value: ESPGeoCoordinates | null) {
    this._geoCoordinates = value;
  }

  // Computed properties
  @computed get nodeAutomationList(): ESPAutomation[] {
    return Object.values(this.nodeAutomations);
  }

  @computed get weatherAutomationList(): ESPAutomation[] {
    return Object.values(this.weatherAutomations);
  }

  @computed get daylightAutomationList(): ESPAutomation[] {
    return Object.values(this.daylightAutomations);
  }

  @computed get automationList(): ESPAutomation[] {
    return [
      ...this.nodeAutomationList,
      ...this.weatherAutomationList,
      ...this.daylightAutomationList,
    ];
  }

  @computed get enabledAutomations(): ESPAutomation[] {
    return this.automationList.filter((automation) => automation.enabled);
  }

  @computed get disabledAutomations(): ESPAutomation[] {
    return this.automationList.filter((automation) => !automation.enabled);
  }

  @computed get enabledNodeAutomations(): ESPAutomation[] {
    return this.nodeAutomationList.filter((automation) => automation.enabled);
  }

  @computed get disabledNodeAutomations(): ESPAutomation[] {
    return this.nodeAutomationList.filter((automation) => !automation.enabled);
  }

  @computed get enabledWeatherAutomations(): ESPAutomation[] {
    return this.weatherAutomationList.filter(
      (automation) => automation.enabled
    );
  }

  @computed get disabledWeatherAutomations(): ESPAutomation[] {
    return this.weatherAutomationList.filter(
      (automation) => !automation.enabled
    );
  }

  @computed get enabledDaylightAutomations(): ESPAutomation[] {
    return this.daylightAutomationList.filter(
      (automation) => automation.enabled
    );
  }

  @computed get disabledDaylightAutomations(): ESPAutomation[] {
    return this.daylightAutomationList.filter(
      (automation) => !automation.enabled
    );
  }

  @computed get automationsByNodeId(): { [nodeId: string]: ESPAutomation[] } {
    // Only include node automations since they always have nodeId
    return this.nodeAutomationList.reduce(
      (acc, automation) => {
        const nodeId = automation.nodeId;
        if (nodeId) {
          if (!acc[nodeId]) {
            acc[nodeId] = [];
          }
          acc[nodeId].push(automation);
        }
        return acc;
      },
      {} as { [nodeId: string]: ESPAutomation[] }
    );
  }

  // Hooks
  beforeSetAutomationListHook: (automations: ESPAutomation[]) => void =
    () => {};
  afterSetAutomationListHook: (automations: ESPAutomation[]) => void = () => {};

  // Action and helper functions

  /**
   * Sets the list of automations in the store, organizing them by event type.
   *
   * @param {ESPAutomation[]} automations - The list of automations to set.
   */
  @action setAutomationList(automations: ESPAutomation[]) {
    // Clear existing automations
    this._nodeAutomations = {};
    this._weatherAutomations = {};
    this._daylightAutomations = {};

    // Add each automation to the appropriate list
    automations.forEach((automation) => {
      this.addAutomationToList(automation);
    });
  }

  /**
   * Adds a new automation to the store and makes it observable.
   *
   * @param {ESPAutomation} automation - The automation to add.
   * @returns {ESPAutomation} The observable automation that was added.
   */
  @action addAutomation(automation: ESPAutomation): ESPAutomation {
    return this.addAutomationToList(automation);
  }

  /**
   * Updates an automation in the store.
   *
   * @param {string} automationId - The ID of the automation to update.
   * @param {Partial<ESPAutomation>} update - The update data.
   */
  @action updateAutomation(
    automationId: string,
    update: Partial<ESPAutomation>
  ) {
    const automation = this.getAutomationById(automationId);
    if (automation) {
      Object.assign(automation, update);
    }
  }

  /**
   * Gets an automation by ID from all lists.
   * @param {string} automationId - The automation ID.
   * @returns {ESPAutomation | undefined} The automation object if found.
   */
  getAutomationById(automationId: string): ESPAutomation | undefined {
    return (
      this.nodeAutomations[automationId] ||
      this.weatherAutomations[automationId] ||
      this.daylightAutomations[automationId]
    );
  }

  /**
   * Gets automations for a specific node (only node-based automations).
   * @param {string} nodeId - The node ID.
   * @returns {ESPAutomation[]} Array of node automations for the node.
   */
  getAutomationsByNodeId(nodeId: string): ESPAutomation[] {
    return this.automationsByNodeId[nodeId] || [];
  }

  /**
   * Gets weather automations for a specific location.
   * @param {ESPGeoCoordinates} location - The location coordinates.
   * @returns {ESPAutomation[]} Array of weather automations for the location.
   */
  getWeatherAutomationsByLocation(
    location: ESPGeoCoordinates
  ): ESPAutomation[] {
    return this.weatherAutomationList.filter(
      (automation) =>
        automation.location &&
        automation.location.latitude === location.latitude &&
        automation.location.longitude === location.longitude
    );
  }

  /**
   * Gets daylight automations for a specific location.
   * @param {ESPGeoCoordinates} location - The location coordinates.
   * @returns {ESPAutomation[]} Array of daylight automations for the location.
   */
  getDaylightAutomationsByLocation(
    location: ESPGeoCoordinates
  ): ESPAutomation[] {
    return this.daylightAutomationList.filter(
      (automation) =>
        automation.location &&
        automation.location.latitude === location.latitude &&
        automation.location.longitude === location.longitude
    );
  }

  /**
   * Sets the automation list with pre- and post-processing hooks.
   * @param {ESPAutomation[]} automationList - The list of automations to set.
   *
   * GPT Context: This function allows developers to inject custom logic before and after setting the automation list.
   */
  @action setAutomationListWithHooks(automationList: ESPAutomation[]) {
    this.beforeSetAutomationListHook(automationList);
    this.setAutomationList(automationList);
    this.afterSetAutomationListHook(automationList);
  }

  /**
   * Updates multiple automations at once.
   * @param {Partial<ESPAutomation>[]} updates - Array of automation updates.
   */
  @action updateMultipleAutomations(updates: Partial<ESPAutomation>[]) {
    updates.forEach((update) => {
      if (update.automationId) {
        this.updateAutomation(update.automationId, update);
      }
    });
  }

  /**
   * Deletes automations from the store.
   * @param {string[]} ids - Array of automation IDs to delete.
   */
  @action async deleteAutomations(ids: string[]) {
    ids.forEach((id) => {
      this.removeAutomationFromLists(id);
    });
  }

  /**
   * Clears all automation data from the store.
   */
  @action clear() {
    this._nodeAutomations = {};
    this._weatherAutomations = {};
    this._daylightAutomations = {};
    this._geoCoordinates = null;
    this._hasNext = false;
    this.#fetchNextRef = null;
  }

  /**
   * Sets geo coordinates in the store.
   * @param {ESPGeoCoordinates} coordinates - The geo coordinates to set.
   */
  @action setGeoCoordinates(coordinates: ESPGeoCoordinates) {
    this.geoCoordinates = coordinates;
  }

  /**
   * Fetches the next page of automations if available.
   */
  @action async fetchNext() {
    if (!this.#fetchNextRef) {
      throw new Error(constants.NO_MORE_AUTOMATIONS_TO_FETCH_ERR);
    }
    try {
      const response = await this.#fetchNextRef();
      return this.processAutomationsRes(response);
    } catch (error) {
      throw error;
    }
  }

  /**
   * Processes the automation response and updates the store.
   * @param {ESPPaginatedAutomationsResponse} response - The response from the automation API.
   * @returns {ESPPaginatedAutomationsResponse} The processed response.
   */
  processAutomationsRes(
    response: ESPPaginatedAutomationsResponse
  ): ESPPaginatedAutomationsResponse {
    const { automations = [], hasNext = false, fetchNext = null } = response;

    // Add new automations to the appropriate lists
    automations.forEach((automation: ESPAutomation) => {
      this.addAutomation(automation);
    });

    // Update pagination state
    this._hasNext = hasNext;
    this.#fetchNextRef = fetchNext;

    return {
      automations: automations.map(
        (automation: ESPAutomation) =>
          this.getAutomationById(automation.automationId)!
      ),
      hasNext,
      fetchNext: hasNext ? () => this.fetchNext() : undefined,
    };
  }

  /**
   * Syncs the automation list from the cloud.
   */
  syncAutomationList = async () => {
    if (!this.rootStore?.userStore.user) {
      throw new Error(constants.USER_NOT_LOGGED_IN_ERR);
    }
    try {
      const user = this.rootStore.userStore.user;
      const response = await user.getAutomations();
      this.clear();
      return this.processAutomationsRes(response);
    } catch (error) {
      throw error;
    }
  };

  /**
   * Adds a property to the store dynamically.
   * @param {string} propertyName - The name of the property to add.
   * @param {any} initialValue - The initial value of the property.
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
      this: AutomationStore,
      value: any
    ) {
      this[propertyName] = value;
    });
  }
}

export default AutomationStore;
