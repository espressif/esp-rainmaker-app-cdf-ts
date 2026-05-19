/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { observable, action } from "mobx";
import { ESPCDF } from "./index";
import { ESPCDFSchedule } from "../entities/ESPCDFSchedule";
import { makeEverythingObservable } from "../utils/common";
import { ScheduleStoreSynchronizer } from "./sync/ScheduleStoreSynchronizer";

class ScheduleStore {
  #synchronizer: ScheduleStoreSynchronizer;

  @observable accessor _schedulesByID: { [key: string]: ESPCDFSchedule } = {};

  constructor(rootStore?: ESPCDF) {
    this.#synchronizer = new ScheduleStoreSynchronizer(this, rootStore || null);
  }

  /**
   * Getter for schedules indexed by ID
   * @returns Map of schedules indexed by schedule ID
   */
  public get schedulesByID(): { [key: string]: ESPCDFSchedule } {
    return this._schedulesByID;
  }

  /**
   * Get the list of schedules from the store
   * @returns The list of schedules
   */
  get schedulesList(): ESPCDFSchedule[] {
    return Object.values(this._schedulesByID) as ESPCDFSchedule[];
  }

  /**
   * Setter for schedules indexed by ID
   * @param value - Map of schedules to set
   */
  public set schedulesByID(value: { [key: string]: ESPCDFSchedule }) {
    this._schedulesByID = value;
  }

  /**
   * Set the list of schedules in the store
   * @param schedulesList The list of schedules to set
   */
  @action setScheduleList(schedules: ESPCDFSchedule[]) {
    this.clear();
    schedules.forEach((schedule) => this.addSchedule(schedule));
  }

  /**
   * Add a schedule to the store
   * @param schedule The schedule to add
   * @returns The added schedule
   */
  @action addSchedule(schedule: ESPCDFSchedule): ESPCDFSchedule {
    // Make schedule and all nested properties observable recursively
    // Exclude '_raw' and 'operations' as they are SDK-specific and don't need reactivity
    const observableSchedule = makeEverythingObservable(
      schedule,
      new Set(["_raw", "operations"])
    );

    // Attach schedule to synchronizer for reactive updates
    this.#synchronizer.attach(observableSchedule);

    this._schedulesByID[schedule.id] = observableSchedule;
    return observableSchedule;
  }

  /**
   * Update a schedule in the store
   * @param scheduleId The ID of the schedule to update
   * @param update The update data
   */
  @action updateSchedule(scheduleId: string, update: Partial<ESPCDFSchedule>) {
    if (!this._schedulesByID[scheduleId]) {
      throw new Error(`Schedule with id ${scheduleId} not found`);
    }
    Object.assign(this._schedulesByID[scheduleId], update);
  }

  /**
   * Remove a schedule from the store
   * @param scheduleId The ID of the schedule to remove
   */
  @action removeSchedule(scheduleId: string) {
    if (!this._schedulesByID[scheduleId]) {
      throw new Error(`Schedule with id ${scheduleId} not found`);
    }
    // Detach from synchronizer before removing
    this.#synchronizer.detach(scheduleId);
    delete this._schedulesByID[scheduleId];
  }

  /**
   * Get a schedule by ID
   * @param scheduleId The ID of the schedule
   * @returns The schedule or undefined if not found
   */
  getScheduleById(scheduleId: string): ESPCDFSchedule | undefined {
    return this._schedulesByID[scheduleId] as ESPCDFSchedule | undefined;
  }

  /**
   * Get schedules for a specific node
   * @param nodeId The node ID
   * @returns The schedules for the node
   */
  getSchedulesForNode(nodeId: string): ESPCDFSchedule[] {
    return this.schedulesList.filter((schedule) =>
      schedule.nodes.includes(nodeId)
    );
  }
  /**
   * Clears all schedules and resets hooks to default values
   *
   * This method removes all schedules from the store and resets the
   * beforeSetScheduleListHook and afterSetScheduleListHook to empty functions.
   * @example
   * scheduleStore.clear();
   */
  @action clear() {
    // Detach all schedules from synchronizer before clearing
    Object.keys(this._schedulesByID).forEach((scheduleId) => {
      this.#synchronizer.detach(scheduleId);
    });
    this._schedulesByID = {};
  }
}

export default ScheduleStore;
