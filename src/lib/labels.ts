/** Libellés FR des enums — une seule source pour toute l'interface. */
export const CHANNEL_LABEL: Record<string, string> = {
  INSTAGRAM: "Instagram",
  TIKTOK: "TikTok",
  GOOGLE: "Google",
  PLANITY: "Planity",
  WORD_OF_MOUTH: "Bouche-à-oreille",
  WALK_IN: "Passage",
  OTHER: "Autre",
  UNKNOWN: "Inconnu",
};

export const CONTENT_TYPE_LABEL: Record<string, string> = {
  TRANSFORMATION: "Transformation",
  BEFORE_AFTER: "Avant/Après",
  FACE_CAMERA: "Face caméra",
  ADVICE: "Conseil",
  HUMOR: "Humour",
  LIFESTYLE: "Lifestyle",
  BEHIND_THE_SCENES: "Coulisses",
  STORYTELLING: "Storytelling",
  CLIENT_REACTION: "Réaction client",
  EDUCATION: "Éducation",
  OTHER: "Autre",
};

export const CONTENT_STATUS_LABEL: Record<string, string> = {
  IDEA: "Idée",
  TO_FILM: "À filmer",
  FILMED: "Filmé",
  TO_EDIT: "À monter",
  READY: "Prêt",
  PUBLISHED: "Publié",
};

export const PLATFORM_LABEL: Record<string, string> = { INSTAGRAM: "Instagram", TIKTOK: "TikTok" };

export const SOURCE_LABEL: Record<string, string> = { PLANITY: "Planity", INSTAGRAM: "Instagram", TIKTOK: "TikTok", MANUAL: "Manuel", DEMO: "DEMO" };

export const MISSION_STATUS_LABEL: Record<string, string> = { PENDING: "Pending", DONE: "Done", SKIPPED: "Skipped", PARTIAL: "Partially done" };

export const APPOINTMENT_STATUS_LABEL: Record<string, string> = { BOOKED: "Réservé", COMPLETED: "Réalisé", CANCELLED: "Annulé", NO_SHOW: "Absent" };

export const GOAL_LABEL: Record<string, { label: string; unit: "count" | "chf" }> = {
  INSTAGRAM_FOLLOWERS: { label: "Followers Instagram", unit: "count" },
  TIKTOK_FOLLOWERS: { label: "Followers TikTok", unit: "count" },
  VIEWS_WEEK: { label: "Vues / semaine", unit: "count" },
  CLIENTS_WEEK: { label: "Clients / semaine", unit: "count" },
  REVENUE_WEEK: { label: "CA / semaine", unit: "chf" },
  REVENUE_MONTH: { label: "CA / mois", unit: "chf" },
  VIDEOS_WEEK: { label: "Vidéos / semaine", unit: "count" },
  STORIES_DAY: { label: "Stories / jour", unit: "count" },
  NEW_CLIENTS_WEEK: { label: "Nouveaux clients / semaine", unit: "count" },
};

export const options = (rec: Record<string, string>) => Object.entries(rec).map(([value, label]) => ({ value, label }));
