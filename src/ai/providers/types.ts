/** Interface LLM interchangeable : l'interface utilisateur ne dépend jamais d'un fournisseur précis. */
export interface AIMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AICompletion {
  text: string;
  model: string;
  provider: string;
}

export interface AIProvider {
  readonly name: string;
  isConfigured(): boolean;
  complete(input: { system: string; messages: AIMessage[]; maxTokens?: number }): Promise<AICompletion>;
}

export class AIUnavailableError extends Error {}
