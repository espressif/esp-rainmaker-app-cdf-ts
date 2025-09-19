/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { action } from "mobx";
import { CDF } from "./index";
import { ESPTransportConfig } from "../types/index";
import { handleNodeUpdateEvent } from "../utils/common";
import { ESPRMEventType } from "@espressif/rainmaker-base-sdk";

class SubscriptionStore {
  private readonly rootStore: CDF | null;

  constructor(rootStore?: CDF) {
    this.rootStore = rootStore || null;
  }

  /**
   * Subscribes all listeners to the user store's user instance.
   * @returns {void}
   *
   * GPT Context: This method subscribes all listeners to the user store's user instance for the specified event type. It ensures that the transport's listen method is called whenever the specified event type occurs.
   */
  subscribeAllListeners = async () => {
    this.rootStore?.userStore.user?.subscribe(
      ESPRMEventType.localDiscovery,
      this.transport.listen
    );
    this.rootStore?.userStore.user?.subscribe(
      ESPRMEventType.nodeUpdates,
      this.nodeUpdates.listen
    );
  };

  /**
   * Transport module to handle transport-related operations.
   */
  transport = {
    /**
     * Listens for transport details and updates the device store.
     * @param {string} nodeId - The ID of the node to update.
     * @param {ESPTransportConfig} transportDetails - The transport details to process.
     *
     * GPT Context: This function listens for transport details and updates the corresponding device's transport order and available transports in the device store.
     */
    listen: action(
      ({
        nodeId,
        transportDetails,
      }: {
        nodeId: string;
        transportDetails: ESPTransportConfig;
      }) => {
        if (this.rootStore?.nodeStore?._nodesByID[nodeId]) {
          this.rootStore.nodeStore.updateNodeTransport(
            nodeId,
            transportDetails
          );
        }
      }
    ),
  };

  nodeUpdates = {
    listen: action((event: any) =>
      handleNodeUpdateEvent(event, this.rootStore)
    ),
  };
}

export default SubscriptionStore;
