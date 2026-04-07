/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { action } from "mobx";
import { ESPCDFTransportConfig } from "../types";
import { ESPCDF } from "./index";
import {
  handleNodeUpdateEvent,
  handleNodeTransportUpdate,
} from "../services/nodeEventHandlers";

class SubscriptionStore {
  private readonly rootStore: ESPCDF | null;

  constructor(rootStore?: ESPCDF) {
    this.rootStore = rootStore || null;
  }

  /**
   * Transport module to handle transport-related operations.
   */
  transport = {
    /**
     * Listens for transport details and updates the device store.
     * @param {string} nodeId - The ID of the node to update.
     * @param {ESPTransportConfig} transportDetails - The transport details to process.
     */
    listen: action(
      ({
        nodeId,
        transportDetails,
      }: {
        nodeId: string;
        transportDetails: ESPCDFTransportConfig;
      }) => {
        if (this.rootStore?.nodeStore?.getNodeById(nodeId)) {
          handleNodeTransportUpdate(
            this.rootStore,
            nodeId,
            transportDetails,
            "add"
          );
        }
      }
    ),
  };

  nodeUpdates = {
    /**
     * Listens for node update events and routes them to appropriate handlers.
     * @param {any} event - The node update event from the SDK.
     */
    listen: action((event: any) => {
      handleNodeUpdateEvent(event, this.rootStore);
    }),
  };
}

export default SubscriptionStore;
