/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ESPSDKAdaptor } from "../types/adaptor";
import type {
  ESPCDFLoginRequestPayload,
  ESPCDFForgotPasswordRequestPayload,
  ESPCDFSetNewPasswordRequestPayload,
  ESPCDFGetSignUpCodeRequestPayload,
  ESPCDFConfirmSignUpRequestPayload,
  ESPCDFLoginWithOauthRequestPayload,
} from "../types/authService";
import type { ESPCDFUser } from "../entities/ESPCDFUser";

/** Minimal interface for storing auth entity; avoids circular import with UserStore. */
export interface AuthStoreAdapter {
  setAuthorizationEntityForAdaptor(
    adaptorIdentifier: string,
    authEntity: ESPCDFUser,
  ): ESPCDFUser;
}

/**
 * Delegates auth calls to the active adaptor.
 * All methods pass through to the adaptor; login and loginWithOauth also store
 * the result in userStore.
 * @example
 * ```ts
 * store.userStore.auth.login({ username, password });
 * store.userStore.auth.forgotPassword({ username });
 * ```
 */
export class Auth {
  #store: AuthStoreAdapter;
  #getAdaptor: () => ESPSDKAdaptor;

  constructor(store: AuthStoreAdapter, getAdaptor: () => ESPSDKAdaptor) {
    this.#store = store;
    this.#getAdaptor = getAdaptor;
  }

  /**
   * Authenticates with email/username and password.
   * On success, stores the user in userStore; access via `userStore.user`.
   * @param request - Contains `username` and `password`
   * @returns API response with the observed user entity
   */
  login = async (request: ESPCDFLoginRequestPayload) => {
    const adaptor = this.#getAdaptor();
    const resp = await adaptor.login({ request });
    return {
      ...resp,
      data: this.#store.setAuthorizationEntityForAdaptor(
        adaptor._identifier,
        resp.data,
      ),
    };
  };

  /**
   * Authenticates via OAuth (e.g. Google, Apple).
   * On success, stores the user in userStore; access via `userStore.user`.
   * @param request - Contains `identityProvider` (e.g. "google", "apple")
   * @returns API response with the observed user entity
   */
  loginWithOauth = async (request: ESPCDFLoginWithOauthRequestPayload) => {
    const adaptor = this.#getAdaptor();
    const resp = await adaptor.loginWithOauth({ request });
    return {
      ...resp,
      data: this.#store.setAuthorizationEntityForAdaptor(
        adaptor._identifier,
        resp.data,
      ),
    };
  };

  /**
   * Initiates password reset by sending a verification code to the user's email.
   * User must then call `setNewPassword` with the received code.
   * @param request - Contains `username` (email)
   */
  forgotPassword = (request: ESPCDFForgotPasswordRequestPayload) =>
    this.#getAdaptor().forgotPassword({ request });

  /**
   * Completes password reset using the verification code from `forgotPassword`.
   * @param request - Contains `username`, `newPassword`, and `verificationCode`
   */
  setNewPassword = (request: ESPCDFSetNewPasswordRequestPayload) =>
    this.#getAdaptor().setNewPassword({ request });

  /**
   * Sends a verification code to the user's email for new account sign-up.
   * User must then call `confirmSignUp` with the received code.
   * @param request - Contains `username` (email) and `password`
   */
  getSignUpCode = (request: ESPCDFGetSignUpCodeRequestPayload) =>
    this.#getAdaptor().getSignUpCode({ request });

  /**
   * Confirms new account sign-up using the verification code from `getSignUpCode`.
   * @param request - Contains `username` and `verificationCode`
   */
  confirmSignUp = (request: ESPCDFConfirmSignUpRequestPayload) =>
    this.#getAdaptor().confirmSignUp({ request });
}
