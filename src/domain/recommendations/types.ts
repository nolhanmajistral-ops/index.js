export type Confidence = "HIGH" | "MEDIUM" | "LOW";
export type EvalMetric = "newClients" | "revenue" | "views" | "followers" | "avgTicket" | "contentsPublished" | "recurrence" | "clientsServed" | "dataCompleteness";

export interface ActionCandidate {
  ruleCode: string;
  title: string;
  action: string;
  why: string;
  dataUsed: Record<string, string | number | null>;
  expectedResult: string;
  confidence: Confidence;
  criteria: { goalLinked: boolean; realData: boolean; feasible: boolean; measurable: boolean; learning: boolean };
  urgency: number; // 0..1
  evaluation: { metric: EvalMetric; horizonDays: number };
  priorityScore?: number;
}

export interface RuleContext {
  /** Poids appris par règle (LearningEngine) : 1 = neutre, <1 = moins efficace par le passé. */
  ruleWeights?: Record<string, number>;
  /** Codes de missions ignorées récemment (≥ 2 fois en 7 jours). */
  recentlySkipped?: string[];
}
