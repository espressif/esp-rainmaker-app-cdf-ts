/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { observable, action } from "mobx";
import { makeEverythingObservable } from "../utils/common";
import {
  ESPCDFAutomationsByIDMap,
  ESPSDKAdaptorAutomationsPaginationMap,
} from "../types/store/automation";
import { ESPCDFAutomation } from "../entities/ESPCDFAutomation";
import { ESPCDFPaginatedAPIResponse } from "../types";
import { AutomationStoreSynchronizer } from "./sync/AutomationStoreSynchronizer";

export default class AutomationStore {
  #synchronizer: AutomationStoreSynchronizer;

  @observable accessor ESPCDFAutomationsByIDMap: ESPCDFAutomationsByIDMap = {};

  // Pagination context map - stores pagination state per SDK adaptor
  @observable accessor sdkAdaptorAutomationsPaginationMap: ESPSDKAdaptorAutomationsPaginationMap =
    {};

  constructor() {
    this.#synchronizer = new AutomationStoreSynchronizer(this);
  }

  get automationsList(): ESPCDFAutomation[] {
    return Object.values(this.ESPCDFAutomationsByIDMap);
  }

  @action setAutomationsList(automations: ESPCDFAutomation[]) {
    // Merge with existing automations instead of replacing
    const newAutomations = automations.reduce((acc, automation) => {
      const id = this.getAutomationId(automation);
      if (!id) return acc;
      acc[id] = this.prepareAutomationForStore(automation);
      return acc;
    }, {} as ESPCDFAutomationsByIDMap);

    this.ESPCDFAutomationsByIDMap = {
      ...this.ESPCDFAutomationsByIDMap,
      ...newAutomations,
    };
  }

  /**
   * Gets the automation ID from either ESPCDFAutomation or
   */
  private getAutomationId(automation: ESPCDFAutomation): string | undefined {
    return automation.id;
  }

  /**
   * Prepares an automation for storage by making it observable and attaching to synchronizer
   */
  private prepareAutomationForStore(
    automation: ESPCDFAutomation
  ): ESPCDFAutomation {
    // Make automation and all nested properties observable recursively
    // Exclude '_raw' and 'operations' as they are SDK-specific and don't need reactivity
    const observableAutomation = makeEverythingObservable(
      automation,
      new Set(["_raw", "operations"])
    );

    // Attach automation to synchronizer for reactive updates
    this.#synchronizer.attach(observableAutomation);

    return observableAutomation;
  }

  @action addAutomation(automation: ESPCDFAutomation): ESPCDFAutomation {
    const id = this.getAutomationId(automation);
    if (!id) {
      throw new Error("Automation must have an id or id");
    }

    const preparedAutomation = this.prepareAutomationForStore(automation);
    this.ESPCDFAutomationsByIDMap[id] = preparedAutomation;
    return preparedAutomation;
  }

  @action updateAutomation(
    id: string,
    update: Partial<ESPCDFAutomation>
  ) {
    if (this.ESPCDFAutomationsByIDMap[id]) {
      Object.assign(this.ESPCDFAutomationsByIDMap[id], update);
    }
  }

  @action removeAutomation(id: string) {
    if (this.ESPCDFAutomationsByIDMap[id]) {
      // Detach from synchronizer before removing
      this.#synchronizer.detach(id);
      delete this.ESPCDFAutomationsByIDMap[id];
    }
  }

  /**
   * Clears all automations from the store and removes all callbacks
   * This should be called on logout to clean up state
   */
  @action clear() {
    // Detach all automations from synchronizer before clearing
    Object.keys(this.ESPCDFAutomationsByIDMap).forEach((id) => {
      this.#synchronizer.detach(id);
    });
    // Clear the automations map
    this.ESPCDFAutomationsByIDMap = {};
    // Clear pagination context
    this.sdkAdaptorAutomationsPaginationMap = {};
  }

  /**
   * Processes a paginated automations response and updates the store
   * Similar to existing-app-cdf's processAutomationsRes method
   * @param response - The paginated response from getAutomations
   * @param sdkIdentifier - Optional SDK identifier for storing pagination context per SDK
   * @returns The processed response with automations
   */
  @action processAutomationsRes(
    response: ESPCDFPaginatedAPIResponse<ESPCDFAutomation[]>,
    sdkIdentifier: string
  ): ESPCDFPaginatedAPIResponse<ESPCDFAutomation[]> {
    const { data: automations = [], pagination } = response;
    const { hasNext = false, fetchNext } = pagination || {};

    // Add new automations to the store
    automations.forEach((automation: ESPCDFAutomation) => {
      if (automation && automation.id) {
        this.addAutomation(automation);
      }
    });

    // Store pagination context per SDK if identifier provided
    this.sdkAdaptorAutomationsPaginationMap[sdkIdentifier] = {
      hasNextPage: hasNext,
      fetchNext: fetchNext ? () => fetchNext() : undefined,
    };

    return {
      status: "success",
      description: "Automations fetched successfully",
      data: automations.map(
        (automation: ESPCDFAutomation) =>
          this.getAutomationById(automation.id)!
      ),
      pagination: {
        hasNext,
        fetchNext:
          hasNext && fetchNext
            ? () => this.fetchNext(sdkIdentifier)
            : undefined,
      },
    };
  }

  /**
   * Fetches the next page of automations if available
   * Similar to existing-app-cdf's fetchNext method
   * @param sdkIdentifier - Optional SDK identifier to fetch next page for specific SDK
   * @returns The next page of automations
   */
  @action async fetchNext(
    sdkIdentifier: string
  ): Promise<ESPCDFPaginatedAPIResponse<ESPCDFAutomation[]>> {
    // If SDK identifier provided, use SDK-specific pagination context
    const paginationState =
      this.sdkAdaptorAutomationsPaginationMap[sdkIdentifier];
    if (!paginationState?.hasNextPage || !paginationState.fetchNext) {
      throw new Error("No more automations to fetch for this SDK");
    }
    const response = await paginationState.fetchNext();
    return this.processAutomationsRes(response, sdkIdentifier);
  }

  /**
   * Gets pagination context for a specific SDK
   * @param sdkIdentifier - The SDK identifier
   * @returns The pagination context or undefined if not found
   */
  getPaginationContext(sdkIdentifier: string) {
    return this.sdkAdaptorAutomationsPaginationMap[sdkIdentifier];
  }

  /**
   * Checks if there are more automations to fetch for a specific SDK
   * @param sdkIdentifier - The SDK identifier
   * @returns True if there are more automations to fetch
   */
  hasNext(sdkIdentifier: string): boolean {
    return (
      this.sdkAdaptorAutomationsPaginationMap[sdkIdentifier]?.hasNextPage ||
      false
    );
  }

  /**
   * Deletes an automation from both the backend (via SDK) and the local store
   * @param id The ID of the automation to delete
   * @returns Result of the operation
   */
  @action async deleteAutomation(id: string): Promise<void> {
    const automation = this.getAutomationById(id);
    if (!automation) {
      throw new Error(`Automation with ID ${id} not found`);
    }
    await automation.delete();
  }

  /**
   * Get an automation by its ID
   * @param id The automation ID
   * @returns The automation entity or undefined if not found
   */
  getAutomationById(id: string): ESPCDFAutomation | undefined {
    return this.ESPCDFAutomationsByIDMap[id];
  }
}
