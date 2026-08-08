/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ESPCDFProvisioningDeviceInterface,
  ESPCDFProvisioningDeviceOperations,
  ESPCDFWifiNetwork,
  ESPCDFProvisionProgressCallback,
  ESPCDFUserNodeMappingResponse,
  ESPCDFChallengeResponseVerificationRequest,
} from "../types";

/**
 * ESPCDFProvisioningDevice
 *
 * Unified provisioning device entity that wraps SDK-specific device implementations.
 * Provides a consistent interface for device provisioning operations across different SDKs.
 */
export class ESPCDFProvisioningDevice implements ESPCDFProvisioningDeviceInterface {
  name: string;
  transport: string;
  security: number;
  connected?: boolean;
  username?: string;
  versionInfo?: { [key: string]: any }[];
  capabilities?: string[];
  advertisementData?: { [key: string]: any }[];
  operations: ESPCDFProvisioningDeviceOperations;
  _raw?: any;

  constructor(deviceData: ESPCDFProvisioningDeviceInterface) {
    this.name = deviceData.name;
    this.transport = deviceData.transport;
    this.security = deviceData.security;
    this.connected = deviceData.connected;
    this.username = deviceData.username;
    this.versionInfo = deviceData.versionInfo;
    this.capabilities = deviceData.capabilities;
    this.advertisementData = deviceData.advertisementData;
    this._raw = deviceData._raw;
    this.operations = deviceData.operations;
  }

  /**
   * Connect to the device
   */
  async connect(): Promise<boolean> {
    return this.operations.connect();
  }

  /**
   * Disconnect from the device
   */
  async disconnect(): Promise<void> {
    return this.operations.disconnect();
  }

  /**
   * Get device capabilities
   */
  async getDeviceCapabilities(): Promise<string[]> {
    return this.operations.getDeviceCapabilities();
  }

  /**
   * Get device version information
   */
  async getDeviceVersionInfo(): Promise<Record<string, any>> {
    return this.operations.getDeviceVersionInfo();
  }

  /**
   * Set proof of possession (POP) code
   */
  async setProofOfPossession(pop: string): Promise<boolean> {
    return this.operations.setProofOfPossession(pop);
  }

  /**
   * Initialize session with the device
   */
  async initializeSession(): Promise<boolean> {
    return this.operations.initializeSession();
  }

  /**
   * Scan for available WiFi networks
   */
  async scanWifiList(): Promise<ESPCDFWifiNetwork[]> {
    return this.operations.scanWifiList();
  }

  /**
   * Provision device with WiFi credentials (traditional flow)
   */
  async provision(
    ssid: string,
    password: string,
    onProgress?: ESPCDFProvisionProgressCallback,
    homeId?: string
  ): Promise<void> {
    return this.operations.provision(ssid, password, onProgress, homeId);
  }

  /**
   * Initiate user-node mapping (challenge-response flow)
   */
  async initiateUserNodeMapping(
    params?: Record<string, any>
  ): Promise<ESPCDFUserNodeMappingResponse> {
    return this.operations.initiateUserNodeMapping(params);
  }

  /**
   * Verify user-node mapping (challenge-response flow)
   */
  async verifyUserNodeMapping(
    params: ESPCDFChallengeResponseVerificationRequest
  ): Promise<ESPCDFUserNodeMappingResponse> {
    return this.operations.verifyUserNodeMapping(params);
  }

  /**
   * Set network credentials directly (for challenge-response flow)
   */
  async setNetworkCredentials(ssid: string, password: string): Promise<number> {
    return this.operations.setNetworkCredentials(ssid, password);
  }

  /**
   * Send data to the device
   */
  async sendData(endPoint: string, data: string): Promise<string> {
    return this.operations.sendData(endPoint, data);
  }

  /**
   * Start assisted claiming
   */
  async startAssistedClaiming(onProgress?: Function, claimCapability?: string): Promise<void> {
    return this.operations.startAssistedClaiming(onProgress, claimCapability);
  }

  /**
   * Check if challenge-response support is available
   */
  async checkChallengeResponseSupport(): Promise<boolean> {
    return this.operations.checkChallengeResponseSupport();
  }

  /**
   * Indicates whether this device is in "on-network" provisioning mode
   * (already on the user's Wi-Fi, talked to via LAN HTTP at the chal-resp
   * endpoint). Same dispatch pattern as `checkChallengeResponseSupport` —
   * `useProvision` calls this to decide which stage list to render and
   * which `addDevice` variant to invoke.
   *
   * Defaults to `false` for adaptors that do not implement the operation, so
   * existing BLE / SoftAP transformers don't need any change.
   * @returns `true` for mDNS-discovered on-network devices, else `false`.
   */
  async checkOnNetworkProvisioning(): Promise<boolean> {
    return this.operations.checkOnNetworkProvisioning?.() ?? false;
  }

  /**
   * Clear the device's Wi-Fi state over the open provisioning session.
   *
   * Only the Wi-Fi credentials are cleared — the user-node association survives,
   * which is what lets {@link retryNetworkCredentials} resume rather than
   * re-provision from scratch.
   *
   * Resolves `false` when the adaptor does not implement it, so callers can
   * treat "not supported" and "device refused" the same way.
   * @returns `true` when the device acknowledged the reset.
   */
  async resetWifiStatus(): Promise<boolean> {
    return this.operations.resetWifiStatus?.() ?? false;
  }

  /**
   * Re-send Wi-Fi credentials after {@link resetWifiStatus}, resuming the flow
   * the first attempt started instead of repeating its association.
   * @param ssid - Wi-Fi SSID, unchanged from the first attempt.
   * @param password - The corrected Wi-Fi password.
   * @param onProgress - Progress callback; emits the same messages as `provision`.
   * @throws When the adaptor cannot resume a provisioning flow.
   */
  async retryNetworkCredentials(
    ssid: string,
    password: string,
    onProgress?: ESPCDFProvisionProgressCallback
  ): Promise<void> {
    if (!this.operations.retryNetworkCredentials) {
      throw new Error(
        "retryNetworkCredentials is not supported by this provisioning adaptor"
      );
    }
    return this.operations.retryNetworkCredentials(ssid, password, onProgress);
  }
}
