import { AIUnavailableError, type AIProvider } from "./types";

/** Aucun LLM configuré : le coach fonctionne en mode déterministe (règles + données réelles). */
export const noneProvider: AIProvider = {
  name: "none",
  isConfigured: () => false,
  async complete() {
    throw new AIUnavailableError("Aucun fournisseur IA configuré (AI_PROVIDER=none).");
  },
};
