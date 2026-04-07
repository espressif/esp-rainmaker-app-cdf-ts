/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Generic operation event emitter for entity operations
 * Provides a consistent, reusable pattern for emitting and listening to operation events
 *
 * @template TEntity - The entity type that emits events
 * @template TOperation - The operation type (string literal union)
 */
export type ESPCDFOperationListener<TEntity, TOperation extends string> = (
  entity: TEntity,
  operation: TOperation,
  success: boolean,
  data?: any,
  error?: any
) => void;

export class ESPCDFOperationEventEmitter<TEntity, TOperation extends string> {
  private listeners = new Set<ESPCDFOperationListener<TEntity, TOperation>>();

  /**
   * Subscribe to all operation events
   * @param listener - The callback function to register
   * @returns Unsubscribe function
   */
  subscribe(
    listener: ESPCDFOperationListener<TEntity, TOperation>
  ): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Emit an operation event to all registered listeners
   * @param entity - The entity that triggered the operation
   * @param operation - The operation type
   * @param success - Whether the operation succeeded
   * @param data - Optional data returned from the operation
   * @param error - Optional error if operation failed
   */
  emit(
    entity: TEntity,
    operation: TOperation,
    success: boolean,
    data?: any,
    error?: any
  ): void {
    this.listeners.forEach((listener) => {
      try {
        listener(entity, operation, success, data, error);
      } catch (err) {
        console.error(
          `[ESPCDFOperationEventEmitter] Error in listener for operation ${operation}:`,
          err
        );
      }
    });
  }

  /**
   * Remove all listeners and clean up
   */
  dispose(): void {
    this.listeners.clear();
  }

  /**
   * Get the number of active listeners
   */
  get listenerCount(): number {
    return this.listeners.size;
  }
}
