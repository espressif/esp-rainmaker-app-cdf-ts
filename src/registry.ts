/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { ESPSDKAdaptor } from "./types/adaptor";
import { ERROR_MESSAGE_MAP } from "./utils/common";
import { ESPCDFRegistryError } from "./errors";

/**
 * Registry for managing SDK adaptors.
 *
 * Provides singleton access to register, retrieve, and manage SDK adaptors
 * that implement the CDF SDK interface. Uses a Proxy to intercept method calls
 * and provide helpful error messages for unimplemented methods.
 */
export class AdaptorRegistry {
  private static instance: AdaptorRegistry;
  private registry: Map<string, ESPSDKAdaptor> = new Map();
  private _activeAdaptorIdentifier: string | null = null;

  private constructor() {}

  /**
   * Gets the singleton instance of the AdaptorRegistry.
   * @returns The singleton AdaptorRegistry instance
   */
  public static getInstance(): AdaptorRegistry {
    if (!AdaptorRegistry.instance) {
      AdaptorRegistry.instance = new AdaptorRegistry();
    }
    return AdaptorRegistry.instance;
  }

  /**
   * Register a new SDK Adaptor
   * @param adaptor SDK Adaptor implementation
   */
  public register(adaptor: ESPSDKAdaptor): void {
    if (this.registry.has(adaptor._identifier)) {
      throw new ESPCDFRegistryError(
        ERROR_MESSAGE_MAP.SDK_ADAPTOR_ALREADY_EXISTS(adaptor._identifier),
        "ADAPTOR_ALREADY_EXISTS",
        { adaptorIdentifier: adaptor._identifier }
      );
    }

    // Wrap the adaptor in a Proxy that intercepts method calls
    const proxiedAdaptor = new Proxy(adaptor, {
      get(target, prop, receiver) {
        const orig = Reflect.get(target, prop, receiver);
        if (typeof orig === "function") {
          return function (...args: any[]) {
            return orig.apply(target, args);
          };
        }

        // If the property doesn't exist on the adaptor at all,
        // return a function that throws an error.
        if (!(prop in target)) {
          return function () {
            throw new ESPCDFRegistryError(
              ERROR_MESSAGE_MAP.SDK_ADAPTOR_METHOD_PROPERTY_NOT_IMPLEMENTED(
                target._identifier,
                String(prop)
              ),
              "ADAPTOR_METHOD_PROPERTY_NOT_IMPLEMENTED",
              {
                adaptorIdentifier: target._identifier,
                methodOrProperty: String(prop),
              }
            );
          };
        }

        return orig;
      },
    }) as ESPSDKAdaptor;

    this.registry.set(adaptor._identifier, proxiedAdaptor);
  }

  /**
   * Get a registered SDK Adaptor by identifier
   * @param adaptorIdentifier Identifier of the SDK Adaptor
   */
  public getAdaptor(adaptorIdentifier: string): ESPSDKAdaptor {
    const adaptor = this.registry.get(adaptorIdentifier);
    if (!adaptor) {
      throw new ESPCDFRegistryError(
        ERROR_MESSAGE_MAP.SDK_ADAPTOR_NOT_FOUND(adaptorIdentifier),
        "ADAPTOR_NOT_FOUND",
        { adaptorIdentifier }
      );
    }
    return adaptor;
  }

  /**
   * Gets all registered adaptor identifiers.
   * @returns Array of adaptor identifiers
   */
  public getRegisteredAdaptorIdentifiers(): string[] {
    return Array.from(this.registry.keys());
  }

  /**
   * Removes an adaptor from the registry.
   * @param adaptorIdentifier - The identifier of the adaptor to remove
   * @throws Error if the adaptor is not found
   */
  public unregister(adaptorIdentifier: string): void {
    if (!this.registry.has(adaptorIdentifier)) {
      throw new ESPCDFRegistryError(
        ERROR_MESSAGE_MAP.SDK_ADAPTOR_NOT_FOUND(adaptorIdentifier),
        "ADAPTOR_NOT_FOUND",
        { adaptorIdentifier }
      );
    }
    this.registry.delete(adaptorIdentifier);
    // Clear the active adaptor if it was the one being unregistered
    if (this._activeAdaptorIdentifier === adaptorIdentifier) {
      this._activeAdaptorIdentifier = null;
    }
  }

  /**
   * Sets the active SDK adaptor by identifier.
   * The active adaptor is used as the default when no adaptorIdentifier is
   * explicitly provided (e.g. in userStore.auth methods or syncGroupsList).
   * @param adaptorIdentifier - The identifier of the adaptor to set as active
   * @throws ESPCDFRegistryError if the adaptor is not registered
   */
  public setActiveAdaptor(adaptorIdentifier: string): void {
    if (!this.registry.has(adaptorIdentifier)) {
      throw new ESPCDFRegistryError(
        ERROR_MESSAGE_MAP.SDK_ADAPTOR_NOT_FOUND(adaptorIdentifier),
        "ADAPTOR_NOT_FOUND",
        { adaptorIdentifier }
      );
    }
    this._activeAdaptorIdentifier = adaptorIdentifier;
  }

  /**
   * Returns the identifier of the currently active SDK adaptor, or null if none is set.
   * @returns The active adaptor identifier, or null
   */
  public getActiveAdaptorIdentifier(): string | null {
    return this._activeAdaptorIdentifier;
  }

  /**
   * Returns the currently active SDK adaptor instance.
   * @returns The active SDK adaptor
   * @throws ESPCDFRegistryError if no active adaptor has been set
   */
  public getActiveAdaptor(): ESPSDKAdaptor {
    if (!this._activeAdaptorIdentifier) {
      throw new ESPCDFRegistryError(
        ERROR_MESSAGE_MAP.NO_ACTIVE_ADAPTOR_SET,
        "NO_ACTIVE_ADAPTOR_SET",
        {}
      );
    }
    return this.getAdaptor(this._activeAdaptorIdentifier);
  }

  /**
   * Clears all registered adaptors from the registry.
   */
  public clear(): void {
    this.registry.clear();
    this._activeAdaptorIdentifier = null;
  }
}

export const registry = AdaptorRegistry.getInstance();
