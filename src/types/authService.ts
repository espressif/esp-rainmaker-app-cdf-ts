/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

export interface ESPCDFBaseRequestPayload {
  /**
   * Identifier of the SDK adaptor to use.
   * If omitted, the registry's active adaptor (set via `registry.setActiveAdaptor()`) is used.
   */
  adaptorIdentifier?: string;
}
export interface ESPCDFLoginRequestPayload extends ESPCDFBaseRequestPayload {
  username: string;
  password: string;
}

export interface ESPCDFForgotPasswordRequestPayload extends ESPCDFBaseRequestPayload {
  username: string;
}

export interface ESPCDFSetNewPasswordRequestPayload extends ESPCDFBaseRequestPayload {
  username: string;
  newPassword: string;
  verificationCode: string;
}

export interface ESPCDFGetSignUpCodeRequestPayload extends ESPCDFBaseRequestPayload {
  username: string;
  password: string;
}
export interface ESPCDFConfirmSignUpRequestPayload extends ESPCDFBaseRequestPayload {
  username: string;
  verificationCode: string;
  tags?: string[];
}

export interface ESPCDFLoginWithOauthRequestPayload extends ESPCDFBaseRequestPayload {
  identityProvider: string;
}
