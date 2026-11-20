/** Modes du Studio contenu (partagés entre le formulaire et le serveur). Aucun prompt ici. */
export type StudioModeId = "reel" | "caption" | "stories" | "plan" | "carousel" | "dm" | "comment" | "audit" | "profile" | "repurpose" | "trends";

export interface StudioField {
  name: string;
  label: string;
  kind: "text" | "textarea" | "select";
  placeholder?: string;
  options?: { value: string; label: string }[];
  required?: boolean;
  max: number;
}

export interface StudioMode {
  id: StudioModeId;
  label: string;
  description: string;
  fields: StudioField[];
  /** Recherche web utilisée pour ce mode (si activée). */
  webSearch?: boolean;
}

export const STUDIO_MODES: StudioMode[] = [
  {
    id: "reel",
    label: "Script Reel / TikTok",
    description: "3 accroches notées, le texte à dire, les cartons à l'écran et les plans à filmer.",
    fields: [
      { name: "idee", label: "Ton idée ou ce qui s'est passé", kind: "textarea", required: true, max: 1500, placeholder: "Ex. : client aux cheveux bouclés, burst fade, il a halluciné au miroir" },
      { name: "duree", label: "Durée visée", kind: "select", max: 4, options: [{ value: "30", label: "30 secondes" }, { value: "15", label: "15 secondes" }, { value: "45", label: "45 secondes" }] },
    ],
  },
  {
    id: "caption",
    label: "Légende",
    description: "Première ligne qui accroche, mots que les gens recherchent, une seule demande, 5 hashtags max.",
    fields: [
      { name: "sujet", label: "De quoi parle la publication ?", kind: "textarea", required: true, max: 1500, placeholder: "Ex. : vidéo avant/après d'un low taper + barbe" },
      { name: "role", label: "Type de publication", kind: "select", max: 2, options: [{ value: "A", label: "Vidéo (elle a déjà son accroche)" }, { value: "B", label: "Photo ou carrousel (la légende fait l'accroche)" }] },
      { name: "motsCles", label: "Mots que les gens tapent pour te trouver (optionnel)", kind: "text", max: 200, placeholder: "Ex. : barber Lausanne, dégradé Lausanne" },
    ],
  },
  {
    id: "stories",
    label: "Stories du jour",
    description: "3 à 6 stories avec le bon sticker, à partir de ton planning de la semaine.",
    fields: [
      { name: "objectif", label: "Objectif", kind: "select", max: 20, options: [{ value: "remplir", label: "Remplir mes créneaux libres" }, { value: "montrer", label: "Montrer mon travail" }, { value: "echanger", label: "Faire réagir (sondage, questions)" }, { value: "vendre", label: "Mettre en avant un forfait ou un produit" }] },
      { name: "contexte", label: "Ce qui se passe aujourd'hui (optionnel)", kind: "textarea", max: 800, placeholder: "Ex. : 3 transformations prévues, nouvelle cire en stock" },
    ],
  },
  {
    id: "plan",
    label: "Plan de la semaine",
    description: "Quoi publier chaque jour, sous quel format, avec quelle accroche.",
    fields: [
      { name: "actu", label: "Ce qui s'est passé cette semaine au salon", kind: "textarea", required: true, max: 1500, placeholder: "Ex. : grosse transformation samedi, un client m'a demandé la coupe d'un joueur, nouveau fauteuil" },
      { name: "rythme", label: "Nombre de publications", kind: "select", max: 2, options: [{ value: "4", label: "4 cette semaine" }, { value: "3", label: "3 cette semaine" }, { value: "5", label: "5 cette semaine" }] },
    ],
  },
  {
    id: "carousel",
    label: "Carrousel",
    description: "Couverture, une idée par slide, slide récap à enregistrer.",
    fields: [{ name: "sujet", label: "Sujet du carrousel", kind: "textarea", required: true, max: 1200, placeholder: "Ex. : quelle coupe selon la forme de ton visage" }],
  },
  {
    id: "dm",
    label: "Message / DM / avis",
    description: "Réponse à une demande, relance d'un client, collaboration, réponse à un avis Google.",
    fields: [
      { name: "type", label: "Type de message", kind: "select", max: 20, options: [{ value: "prix", label: "Répondre à une demande de prix / de dispo" }, { value: "relance", label: "Relancer un client régulier" }, { value: "collab", label: "Proposer une collaboration" }, { value: "avis", label: "Répondre à un avis Google" }, { value: "commentaire", label: "Répondre à un commentaire" }] },
      { name: "contexte", label: "Ce que la personne a écrit, ou qui c'est", kind: "textarea", required: true, max: 1500, placeholder: "Ex. : « Salut c'est combien une coupe + barbe ? Dispo samedi ? »" },
    ],
  },
  {
    id: "comment",
    label: "Commentaire chez un autre compte",
    description: "Un commentaire qui se remarque sous un post local ou d'un autre barber, sans faire de pub.",
    fields: [{ name: "post", label: "Colle le texte du post et le nom du compte", kind: "textarea", required: true, max: 2000 }],
  },
  {
    id: "audit",
    label: "Audit de mes contenus",
    description: "Ce qui marche vraiment chez toi, d'après tes contenus enregistrés dans NOLHAN OS.",
    fields: [{ name: "question", label: "Une question précise ? (optionnel)", kind: "text", max: 300, placeholder: "Ex. : pourquoi mes vidéos conseils font peu de vues ?" }],
  },
  {
    id: "profile",
    label: "Bio Instagram",
    description: "Note sur 100 et réécriture : nom, bio, posts épinglés, stories à la une, lien.",
    fields: [{ name: "bio", label: "Colle ton nom affiché, ta bio, ton lien et tes stories à la une", kind: "textarea", required: true, max: 1500 }],
  },
  {
    id: "repurpose",
    label: "Recycler un long contenu",
    description: "Une interview, un live ou un long texte transformé en une semaine de publications.",
    fields: [{ name: "source", label: "Colle la transcription ou le texte", kind: "textarea", required: true, max: 20000 }],
  },
  {
    id: "trends",
    label: "Tendances du moment",
    description: "Ce qui marche maintenant chez les barbiers, avec les sources, et 3 vidéos à tourner.",
    webSearch: true,
    fields: [
      { name: "focus", label: "Sur quoi ? (optionnel)", kind: "text", max: 200, placeholder: "Ex. : coupes demandées, sons TikTok, formats" },
      { name: "exemples", label: "Des vidéos que tu as vues et qui ont cartonné ? (optionnel)", kind: "textarea", max: 2000, placeholder: "Colle la description ou ce qui se passe dans la vidéo" },
    ],
  },
];

export function getStudioMode(id: string): StudioMode | undefined {
  return STUDIO_MODES.find((m) => m.id === id);
}
