/** Interface LLM interchangeable : l'interface utilisateur ne dépend jamais d'un fournisseur précis. */
export interface AIMessage {
  role: "user" | "assistant";
  content: string;
}

/** Page web réellement consultée par le modèle (recherche web). Jamais inventée. */
export interface AISource {
  title: string;
  url: string;
}

export interface AICompletion {
  text: string;
  model: string;
  provider: string;
  sources?: AISource[];
}

export interface AIRequest {
  system: string;
  messages: AIMessage[];
  maxTokens?: number;
  /** Autorise la recherche web (tendances actuelles). Ignorée par les fournisseurs qui ne la gèrent pas. */
  webSearch?: boolean;
}

export interface AIStreamHandlers {
  /** Morceau de texte généré (affichage progressif). */
  onText?: (delta: string) => void;
  /** Étape en cours, ex. « Recherche web en cours… ». */
  onStatus?: (status: string) => void;
}

export interface AIProvider {
  readonly name: string;
  isConfigured(): boolean;
  complete(input: AIRequest): Promise<AICompletion>;
  /** Même résultat que complete(), avec affichage progressif. Optionnel. */
  stream?(input: AIRequest, handlers: AIStreamHandlers): Promise<AICompletion>;
}

export class AIUnavailableError extends Error {}
