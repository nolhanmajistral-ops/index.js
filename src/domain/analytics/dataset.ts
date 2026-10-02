import type { AcquisitionChannel, AttributionConfidence, ConnectionStatus, ContentStatus, ContentType, DataSource, GoalMetric, LeadStatus, MissionStatus, Platform } from "@prisma/client";
import type { AppointmentRow, RevenueRow } from "@/domain/revenue/types";

/** Jeu de données interne unique consommé par Dashboard, Analyse, Coach et Missions (règle de cohérence). */
export interface ClientRow {
  id: string;
  createdAt: Date;
  acquisitionChannel: AcquisitionChannel;
  originContentId: string | null;
  source: DataSource;
}

export interface AttributionRow {
  clientId: string;
  channel: AcquisitionChannel;
  confidence: AttributionConfidence;
  contentId: string | null;
}

export interface ContentMetricRow {
  capturedAt: Date;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  followersGained: number;
  profileVisits: number;
  messages: number;
  leads: number;
}

export interface ContentRow {
  id: string;
  platform: Platform;
  type: ContentType;
  status: ContentStatus;
  title: string;
  hook: string | null;
  publishedAt: Date | null;
  plannedAt: Date | null;
  archivedAt: Date | null;
  source: DataSource;
  latest: ContentMetricRow | null;
}

export interface SocialMetricRow {
  platform: Platform;
  capturedAt: Date;
  followers: number | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  source: DataSource;
}

export interface LeadRow {
  id: string;
  createdAt: Date;
  channel: AcquisitionChannel;
  contentId: string | null;
  status: LeadStatus;
}

export interface MissionRow {
  date: Date;
  code: string;
  status: MissionStatus;
}

export interface AnalyticsDataset {
  now: Date;
  tz: string;
  appointments: AppointmentRow[];
  revenues: RevenueRow[];
  clients: ClientRow[];
  attributions: AttributionRow[];
  contents: ContentRow[];
  socialMetrics: SocialMetricRow[];
  socialAccounts: { platform: Platform; status: ConnectionStatus; handle: string | null }[];
  goals: { id: string; metric: GoalMetric; target: number }[];
  leads: LeadRow[];
  missions: MissionRow[];
  services: { name: string; priceCents: number }[];
  pendingMatchReviews: number;
  imports: { count: number; lastAt: Date | null };
  usesPlanity: boolean;
}

export function emptyDataset(now = new Date()): AnalyticsDataset {
  return {
    now,
    tz: "Europe/Zurich",
    appointments: [],
    revenues: [],
    clients: [],
    attributions: [],
    contents: [],
    socialMetrics: [],
    socialAccounts: [],
    goals: [],
    leads: [],
    missions: [],
    services: [],
    pendingMatchReviews: 0,
    imports: { count: 0, lastAt: null },
    usesPlanity: false,
  };
}
