/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/** Entity keys that are never made observable: SDK bindings. */
export const NON_OBSERVABLE_ENTITY_KEYS: ReadonlySet<string> = new Set([
  "_raw",
  "operations",
]);

const inFlightByKey = new Map<string, Promise<unknown>>();

/** `true` while a `dedupe` run for `key` has not settled. */
export function hasInFlight(key: string): boolean {
  return inFlightByKey.has(key);
}

/**
 * Runs `work` once per `key` at a time. Concurrent callers with the same key
 * share the running promise instead of starting another request.
 */
export function dedupe<T>(key: string, work: () => Promise<T>): Promise<T> {
  const running = inFlightByKey.get(key);
  if (running) {
    return running as Promise<T>;
  }
  const promise = work().finally(() => {
    inFlightByKey.delete(key);
  });
  inFlightByKey.set(key, promise);
  return promise;
}

/** Forgets every in-flight promise. Used on dispose and in tests. */
export function clearInFlight(): void {
  inFlightByKey.clear();
}
