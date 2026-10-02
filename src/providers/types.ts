/**
 * Contrats communs des providers externes.
 * Les providers ne sont appelés QUE par le DataHub ; app/ et domain/ ne les importent jamais.
 */
export type ProviderConnectionStatus =
  | "CONNECTED"
  | "CONNECTED_IMPORT"
  | "DISCONNECTED"
  | "SYNCING"
  | "PARTIAL"
  | "ERROR"
  | "CONFIGURATION_REQUIRED";

export interface ProviderResult<T> {
  ok: boolean;
  status: ProviderConnectionStatus;
  data?: T;
  message?: string;
}

export const configurationRequired = <T>(message: string): ProviderResult<T> => ({ ok: false, status: "CONFIGURATION_REQUIRED", message });
