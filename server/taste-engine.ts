import { type TasteProfile, TRAIT_AXES, getMatchColor } from "@shared/schema";

const TRAIT_LABELS: Record<string, string> = {
  novelty: "Novelty Seeking",
  intensity: "Intensity",
  cozy: "Cozy Preference",
  strategy: "Strategic Thinking",
  social: "Social Energy",
  creativity: "Creative Spirit",
  nostalgia: "Nostalgia Pull",
  adventure: "Adventure Drive",
};

export function getTraitsFromProfile(profile: TasteProfile): Record<string, number> {
  return {
    novelty: profile.traitNovelty ?? 0.5,
    intensity: profile.traitIntensity ?? 0.5,
    cozy: profile.traitCozy ?? 0.5,
    strategy: profile.traitStrategy ?? 0.5,
    social: profile.traitSocial ?? 0.5,
    creativity: profile.traitCreativity ?? 0.5,
    nostalgia: profile.traitNostalgia ?? 0.5,
    adventure: profile.traitAdventure ?? 0.5,
  };
}

function computeDistanceScore(traitsA: Record<string, number>, traitsB: Record<string, number>): number {
  let sumSqDiff = 0;
  for (const axis of TRAIT_AXES) {
    const diff = (traitsA[axis] ?? 0.5) - (traitsB[axis] ?? 0.5);
    sumSqDiff += diff * diff;
  }
  const rmsDiff = Math.sqrt(sumSqDiff / TRAIT_AXES.length);
  const similarity = 1 - rmsDiff * 1.4;
  const score = Math.max(15, Math.min(100, Math.round(similarity * 100)));
  return score;
}

export function computeMatchScore(
  profileA: TasteProfile,
  profileB: TasteProfile
): { score: number; color: "green" | "yellow" | "grey"; explanations: string[] } {
  const traitsA = getTraitsFromProfile(profileA);
  const traitsB = getTraitsFromProfile(profileB);

  const score = computeDistanceScore(traitsA, traitsB);

  const explanations: string[] = [];
  const traitDiffs: { axis: string; diff: number; valA: number; valB: number }[] = [];

  for (const axis of TRAIT_AXES) {
    traitDiffs.push({
      axis,
      diff: Math.abs(traitsA[axis] - traitsB[axis]),
      valA: traitsA[axis],
      valB: traitsB[axis],
    });
  }

  traitDiffs.sort((a, b) => a.diff - b.diff);

  const closest = traitDiffs.slice(0, 3);
  for (const t of closest) {
    const avgVal = (t.valA + t.valB) / 2;
    const level = avgVal > 0.7 ? "High" : avgVal > 0.4 ? "Moderate" : "Low";
    explanations.push(`Both have ${level.toLowerCase()} ${TRAIT_LABELS[t.axis].toLowerCase()}`);
  }

  if (traitDiffs.length > 3) {
    const furthest = traitDiffs[traitDiffs.length - 1];
    if (furthest.diff > 0.3) {
      explanations.push(
        `Different perspectives on ${TRAIT_LABELS[furthest.axis].toLowerCase()} add balance`
      );
    }
  }

  return { score, color: getMatchColor(score), explanations };
}

export function computeItemMatchScore(
  profile: TasteProfile,
  itemTraits: Record<string, number>
): { score: number; explanation: string } {
  const userTraits = getTraitsFromProfile(profile);

  const score = computeDistanceScore(userTraits, itemTraits);

  const closestAxis = TRAIT_AXES.reduce((best, axis) => {
    const diff = Math.abs(userTraits[axis] - (itemTraits[axis] ?? 0.5));
    const bestDiff = Math.abs(userTraits[best] - (itemTraits[best] ?? 0.5));
    return diff < bestDiff ? axis : best;
  });

  const explanation = `Matches your ${TRAIT_LABELS[closestAxis].toLowerCase()} preferences`;

  return { score, explanation };
}

export function computeHobbyMatch(
  profile: TasteProfile,
  hobbyTraits: Record<string, number>
): { score: number; whyItFits: string } {
  const userTraits = getTraitsFromProfile(profile);

  const score = computeDistanceScore(userTraits, hobbyTraits);

  const strongMatches: string[] = [];
  for (const axis of TRAIT_AXES) {
    const uv = userTraits[axis];
    const hv = hobbyTraits[axis] ?? 0.5;
    if (uv > 0.6 && hv > 0.6) {
      strongMatches.push(TRAIT_LABELS[axis].toLowerCase());
    }
  }

  const whyItFits = strongMatches.length > 0
    ? `Aligns with your ${strongMatches.slice(0, 2).join(" and ")} tendencies`
    : "A balanced fit across your taste profile";

  return { score, whyItFits };
}

export function buildTraitsFromSelections(
  favorites: Record<string, string[]>,
  quizTraits: Record<string, number>
): Record<string, number> {
  const TAG_TRAIT_MAP: Record<string, Partial<Record<string, number>>> = {
    "sci-fi": { novelty: 0.8, creativity: 0.7, adventure: 0.6 },
    "space": { novelty: 0.9, adventure: 0.8 },
    "emotional": { cozy: 0.6, nostalgia: 0.5 },
    "action": { intensity: 0.8, adventure: 0.7 },
    "thriller": { intensity: 0.7, strategy: 0.6 },
    "dark": { intensity: 0.7, novelty: 0.5 },
    "anime": { creativity: 0.7, nostalgia: 0.6 },
    "fantasy": { creativity: 0.8, adventure: 0.7, nostalgia: 0.5 },
    "magical": { creativity: 0.9, cozy: 0.6 },
    "mind-bending": { novelty: 0.9, strategy: 0.7 },
    "comedy": { social: 0.6, cozy: 0.5 },
    "quirky": { creativity: 0.8, novelty: 0.7 },
    "artistic": { creativity: 0.9 },
    "social": { social: 0.8 },
    "dark-comedy": { intensity: 0.5, creativity: 0.6 },
    "epic": { intensity: 0.7, adventure: 0.8 },
    "crime": { intensity: 0.6, strategy: 0.7 },
    "dialogue": { social: 0.5, creativity: 0.6 },
    "nonlinear": { novelty: 0.8, creativity: 0.7 },
    "philosophical": { novelty: 0.8, strategy: 0.6 },
    "superhero": { adventure: 0.7, intensity: 0.6 },
    "fun": { cozy: 0.5, social: 0.6 },
    "horror": { intensity: 0.9, novelty: 0.6 },
    "suspense": { intensity: 0.7, strategy: 0.5 },
    "cozy": { cozy: 0.9, social: 0.4 },
    "nature": { adventure: 0.6, cozy: 0.5 },
    "indie": { creativity: 0.8, novelty: 0.7 },
    "creative": { creativity: 0.9 },
    "mellow": { cozy: 0.7 },
    "electronic": { novelty: 0.6, intensity: 0.6 },
    "energy": { intensity: 0.8, adventure: 0.6 },
    "beats": { intensity: 0.5 },
    "hip-hop": { social: 0.6, creativity: 0.5 },
    "rhythm": { intensity: 0.5 },
    "lyrical": { creativity: 0.7 },
    "classical": { creativity: 0.7, nostalgia: 0.6, strategy: 0.5 },
    "elegant": { creativity: 0.6 },
    "complex": { strategy: 0.7, novelty: 0.6 },
    "jazz": { creativity: 0.8, novelty: 0.6, social: 0.5 },
    "soulful": { nostalgia: 0.6, cozy: 0.5 },
    "improvisation": { creativity: 0.9, novelty: 0.7 },
    "rock": { intensity: 0.7 },
    "guitar": { creativity: 0.5 },
    "pop": { social: 0.7 },
    "catchy": { cozy: 0.5 },
    "mainstream": { social: 0.6 },
    "rnb": { social: 0.5, cozy: 0.6 },
    "smooth": { cozy: 0.7 },
    "lofi": { cozy: 0.8, creativity: 0.5 },
    "chill": { cozy: 0.8 },
    "atmospheric": { creativity: 0.6 },
    "kpop": { social: 0.7, intensity: 0.5 },
    "energetic": { intensity: 0.7 },
    "visual": { creativity: 0.6 },
    "country": { nostalgia: 0.7, cozy: 0.6 },
    "storytelling": { creativity: 0.6 },
    "acoustic": { cozy: 0.7 },
    "reggae": { cozy: 0.7, social: 0.5 },
    "groove": { social: 0.5 },
    "rpg": { strategy: 0.7, adventure: 0.8 },
    "exploration": { adventure: 0.9, novelty: 0.7 },
    "story": { creativity: 0.6, nostalgia: 0.5 },
    "fps": { intensity: 0.9, strategy: 0.5 },
    "competitive": { intensity: 0.8, strategy: 0.7 },
    "reaction": { intensity: 0.7 },
    "strategy": { strategy: 0.9 },
    "planning": { strategy: 0.8 },
    "puzzle": { strategy: 0.7, creativity: 0.6 },
    "simulation": { strategy: 0.5, cozy: 0.6 },
    "relaxing": { cozy: 0.9 },
    "fighting": { intensity: 0.8 },
    "skill": { strategy: 0.6, intensity: 0.6 },
    "mmo": { social: 0.9 },
    "grinding": { intensity: 0.5 },
    "survival": { intensity: 0.7, adventure: 0.7 },
    "crafting": { creativity: 0.6 },
    "narrative": { creativity: 0.7, nostalgia: 0.5 },
    "cinematic": { creativity: 0.6, intensity: 0.5 },
    "multiplayer": { social: 0.8 },
    "racing": { intensity: 0.6 },
    "sports": { social: 0.5, intensity: 0.5 },
    "fast": { intensity: 0.7 },
    "retro": { nostalgia: 0.9 },
    "nostalgic": { nostalgia: 0.9 },
    "arcade": { nostalgia: 0.7, intensity: 0.5 },
    "japanese": { novelty: 0.6, creativity: 0.5 },
    "umami": { novelty: 0.6 },
    "precise": { strategy: 0.5 },
    "italian": { cozy: 0.7, nostalgia: 0.5 },
    "comfort": { cozy: 0.8 },
    "classic": { nostalgia: 0.6 },
    "spicy": { intensity: 0.8 },
    "bold": { intensity: 0.7, novelty: 0.5 },
    "aromatic": { creativity: 0.5 },
    "street-food": { adventure: 0.6, social: 0.5 },
    "casual": { cozy: 0.6 },
    "diverse": { novelty: 0.6 },
    "vegan": { novelty: 0.5, creativity: 0.5 },
    "health": { strategy: 0.4 },
    "bbq": { social: 0.7, cozy: 0.5 },
    "smoky": { intensity: 0.5 },
    "hearty": { cozy: 0.6 },
    "french": { creativity: 0.6 },
    "refined": { strategy: 0.5 },
    "mexican": { social: 0.6, intensity: 0.5 },
    "vibrant": { creativity: 0.5, intensity: 0.4 },
    "korean": { novelty: 0.6, intensity: 0.5 },
    "fermented": { novelty: 0.7 },
    "mediterranean": { cozy: 0.5, adventure: 0.4 },
    "fresh": { novelty: 0.4 },
    "healthy": { strategy: 0.4 },
    "baking": { cozy: 0.8, creativity: 0.6 },
    "sweet": { cozy: 0.7 },
    "artisan": { creativity: 0.7 },
    "quick": { intensity: 0.4 },
    "outdoor": { adventure: 0.8 },
    "fitness": { intensity: 0.6, adventure: 0.5 },
    "cooking": { creativity: 0.6, cozy: 0.7 },
    "art": { creativity: 0.9 },
    "reading": { nostalgia: 0.5, creativity: 0.5 },
    "intellectual": { strategy: 0.6 },
    "solitary": { social: 0.2 },
    "discipline": { strategy: 0.6, intensity: 0.5 },
    "music": { creativity: 0.7 },
    "technical": { strategy: 0.6 },
    "patient": { cozy: 0.6, strategy: 0.4 },
    "culture": { novelty: 0.6, social: 0.5 },
    "hands-on": { creativity: 0.6 },
    "tech": { strategy: 0.7, novelty: 0.6 },
    "problem-solving": { strategy: 0.8 },
    "logical": { strategy: 0.8 },
  };

  const traitAccumulator: Record<string, number[]> = {};
  for (const axis of TRAIT_AXES) {
    traitAccumulator[axis] = [];
  }

  const ONBOARDING_ITEMS: Record<string, { tags: string[] }[]> = {
    movies: [
      { tags: ["sci-fi", "space", "emotional"] },
      { tags: ["action", "thriller", "dark"] },
      { tags: ["anime", "fantasy", "magical"] },
      { tags: ["sci-fi", "thriller", "mind-bending"] },
      { tags: ["comedy", "quirky", "artistic"] },
      { tags: ["thriller", "social", "dark-comedy"] },
      { tags: ["fantasy", "epic", "adventure"] },
      { tags: ["crime", "dialogue", "nonlinear"] },
      { tags: ["sci-fi", "action", "philosophical"] },
      { tags: ["anime", "cozy", "nature"] },
      { tags: ["superhero", "action", "fun"] },
      { tags: ["horror", "intense", "suspense"] },
    ],
    music: [
      { tags: ["indie", "creative", "mellow"] },
      { tags: ["electronic", "energy", "beats"] },
      { tags: ["hip-hop", "rhythm", "lyrical"] },
      { tags: ["classical", "elegant", "complex"] },
      { tags: ["jazz", "soulful", "improvisation"] },
      { tags: ["rock", "intense", "guitar"] },
      { tags: ["pop", "catchy", "mainstream"] },
      { tags: ["rnb", "smooth", "emotional"] },
      { tags: ["lofi", "chill", "atmospheric"] },
      { tags: ["kpop", "energetic", "visual"] },
      { tags: ["country", "storytelling", "acoustic"] },
      { tags: ["reggae", "chill", "groove"] },
    ],
    games: [
      { tags: ["rpg", "exploration", "story"] },
      { tags: ["fps", "competitive", "reaction"] },
      { tags: ["strategy", "planning", "complex"] },
      { tags: ["indie", "creative", "puzzle"] },
      { tags: ["simulation", "cozy", "relaxing"] },
      { tags: ["fighting", "competitive", "skill"] },
      { tags: ["mmo", "social", "grinding"] },
      { tags: ["survival", "crafting", "intense"] },
      { tags: ["narrative", "emotional", "cinematic"] },
      { tags: ["competitive", "action", "multiplayer"] },
      { tags: ["racing", "sports", "fast"] },
      { tags: ["retro", "nostalgic", "arcade"] },
    ],
    food: [
      { tags: ["japanese", "umami", "precise"] },
      { tags: ["italian", "comfort", "classic"] },
      { tags: ["spicy", "bold", "aromatic"] },
      { tags: ["street-food", "casual", "diverse"] },
      { tags: ["vegan", "health", "creative"] },
      { tags: ["bbq", "smoky", "hearty"] },
      { tags: ["french", "elegant", "refined"] },
      { tags: ["mexican", "vibrant", "spicy"] },
      { tags: ["korean", "fermented", "bold"] },
      { tags: ["mediterranean", "fresh", "healthy"] },
      { tags: ["baking", "sweet", "artisan"] },
      { tags: ["comfort", "nostalgic", "quick"] },
    ],
    hobbies: [
      { tags: ["visual", "creative", "outdoor"] },
      { tags: ["adventure", "nature", "fitness"] },
      { tags: ["cooking", "creative", "cozy"] },
      { tags: ["art", "creative", "visual"] },
      { tags: ["strategy", "social", "fun"] },
      { tags: ["reading", "intellectual", "solitary"] },
      { tags: ["fitness", "discipline", "health"] },
      { tags: ["music", "creative", "technical"] },
      { tags: ["nature", "cozy", "patient"] },
      { tags: ["adventure", "culture", "social"] },
      { tags: ["crafting", "creative", "hands-on"] },
      { tags: ["tech", "problem-solving", "logical"] },
    ],
  };

  for (const [domain, selectedIds] of Object.entries(favorites)) {
    const domainItems = ONBOARDING_ITEMS[domain] || [];
    for (const id of selectedIds) {
      const idx = parseInt(id.replace(/[^0-9]/g, "")) - 1;
      if (idx >= 0 && idx < domainItems.length) {
        const item = domainItems[idx];
        for (const tag of item.tags) {
          const mapping = TAG_TRAIT_MAP[tag];
          if (mapping) {
            for (const [axis, value] of Object.entries(mapping)) {
              if (traitAccumulator[axis]) {
                traitAccumulator[axis].push(value as number);
              }
            }
          }
        }
      }
    }
  }

  const result: Record<string, number> = {};
  for (const axis of TRAIT_AXES) {
    const values = traitAccumulator[axis];
    const tagAvg = values.length > 0
      ? values.reduce((a, b) => a + b, 0) / values.length
      : 0.5;
    const quizVal = quizTraits[axis] ?? 0.5;
    result[axis] = tagAvg * 0.6 + quizVal * 0.4;
  }

  return result;
}

export function generateClusters(traits: Record<string, number>): string[] {
  const clusters: string[] = [];

  if (traits.creativity > 0.65) clusters.push("Creative Thinker");
  if (traits.adventure > 0.65) clusters.push("Adventurer");
  if (traits.strategy > 0.65) clusters.push("Strategic Mind");
  if (traits.novelty > 0.65) clusters.push("Novelty Seeker");
  if (traits.cozy > 0.65) clusters.push("Comfort Connoisseur");
  if (traits.intensity > 0.65) clusters.push("Thrill Seeker");
  if (traits.social > 0.65) clusters.push("Social Butterfly");
  if (traits.nostalgia > 0.65) clusters.push("Nostalgia Lover");

  if (traits.creativity > 0.6 && traits.novelty > 0.6) clusters.push("Innovator");
  if (traits.cozy > 0.6 && traits.nostalgia > 0.6) clusters.push("Comfort Classic");
  if (traits.intensity > 0.6 && traits.strategy > 0.6) clusters.push("Tactical Gamer");
  if (traits.adventure > 0.6 && traits.social > 0.6) clusters.push("Explorer");

  return Array.from(new Set(clusters)).slice(0, 5);
}
