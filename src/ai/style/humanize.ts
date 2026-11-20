/**
 * Style « humain » : ce qui fait qu'un texte sonne écrit par une IA, et ce qu'une personne dirait à la place.
 * Les règles sont données au modèle ; cleanText() corrige ensuite mécaniquement ce qui peut l'être sans jugement.
 */
export const STYLE_RULES = `STYLE (les textes doivent sonner comme Nolhan, pas comme une IA)
- Français parlé, simple, tutoiement. Phrases courtes. Une idée par phrase.
- Du concret : un chiffre, un prix, un lieu, un geste, un nom de coupe. Jamais trois phrases abstraites d'affilée.
- Pas de tiret long (—) : virgule, point ou deux-points à la place.
- Mots interdits (remplace-les ou coupe) : « plonger dans », « explorer », « véritable », « game-changer », « révolutionner », « incontournable », « crucial », « primordial », « essentiel », « booster », « décupler », « propulser », « sublimer », « optimiser/maximiser » sans chiffre, « tirer parti de », « levier », « la clé du succès », « en effet », « de plus », « par ailleurs », « en outre », « ainsi », « en somme », « en conclusion », « il est important de noter », « dans un monde où », « à l'ère du numérique », « sans plus attendre », « vous l'aurez compris », « n'hésite pas à », « que tu sois débutant ou expert ».
- Pas de structures d'IA : « Ce n'est pas X, c'est Y » (une fois maximum), triplets d'adjectifs à répétition, fragments « Pas de blabla. Que du concret. », questions-révélations « Le résultat ? », intros du type « Dans cette vidéo… ».
- Pas d'appâts creux : « abonne-toi pour plus », « identifie quelqu'un qui… », « double tap si… ».
- Emojis : comme ponctuation, rarement, jamais en premier caractère.`;

const INVISIBLE = /[​-‍⁠﻿­᠎\u{E0000}-\u{E007F}]/gu;

/** Nettoyage typographique sans jugement : caractères invisibles, tirets longs, points de suspension, apostrophes. */
export function cleanText(input: string): string {
  return (
    input
      .replace(INVISIBLE, "")
      // Tiret long entre deux mots → virgule ; en début de ligne (liste) → tiret simple.
      .replace(/^(\s*)[—–](\s)/gm, "$1-$2")
      .replace(/\s*—\s*/g, ", ")
      .replace(/(\S) – (\S)/g, "$1, $2")
      .replace(/…/g, "...")
      .replace(/[‘’]/g, "'")
      // Ponctuation doublée laissée par le remplacement (« , . » / « ,, »).
      .replace(/,\s*([.,;:!?])/g, "$1")
      .replace(/[ \t]+\n/g, "\n")
  );
}
