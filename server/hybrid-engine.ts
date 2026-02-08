import { type TasteProfile, type Item, type Hobby, type Event, TRAIT_AXES, getMatchColor } from "@shared/schema";
import {
  computeCosineSimilarity,
  cosineSimilarityToScore,
  isValidEmbedding,
  findSimilarItemsByDomain,
  findSimilarByEmbedding,
  getCollaborativeFilteringSignals,
  haversineDistance,
  getDistanceBucket,
} from "./embeddings";
import { getTraitsFromProfile, computeMatchScore as traitMatchScore, computeItemMatchScore as traitItemMatchScore, computeHobbyMatch as traitHobbyMatch } from "./taste-engine";

const WEIGHTS = {
  VECTOR_SIM: 0.55,
  COLLAB_FILTER: 0.25,
  TRAIT_SIM: 0.20,
};

const SOCIAL_WEIGHTS = {
  VECTOR_SIM: 0.60,
  TRAIT_SIM: 0.40,
};

const EVENT_WEIGHTS = {
  VECTOR_SIM: 0.50,
  TRAIT_SIM: 0.25,
  GEO_BONUS: 0.25,
};

export interface HybridRecommendation {
  item: Item;
  hybridScore: number;
  vectorScore: number;
  cfScore: number;
  traitScore: number;
  explanation: string;
  traitExplanation: string;
  scoringMethod: "hybrid" | "vector" | "trait-only";
}

export interface HybridSocialMatch {
  userId: string;
  hybridScore: number;
  vectorScore: number;
  traitScore: number;
  color: "green" | "yellow" | "grey";
  explanations: string[];
  scoringMethod: "hybrid" | "trait-only";
}

export interface HybridEventScore {
  event: Event;
  hybridScore: number;
  vectorScore: number;
  traitScore: number;
  predictedEnjoyment: number;
  distanceBucket: string | null;
  explanation: string;
  scoringMethod: "hybrid" | "trait-only";
}

export interface HybridHobbyScore {
  hobby: Hobby;
  hybridScore: number;
  vectorScore: number;
  traitScore: number;
  whyItFits: string;
  scoringMethod: "hybrid" | "trait-only";
}

function normalizeScore(score: number, min: number = 0, max: number = 100): number {
  return Math.max(15, Math.min(100, Math.round(((score - min) / (max - min)) * 100)));
}

export async function hybridRecommend(
  profile: TasteProfile,
  availableItems: Item[],
  userId: string,
  domain: string
): Promise<HybridRecommendation[]> {
  const hasProfileEmbedding = isValidEmbedding(profile.embedding);
  const itemsWithEmbeddings = availableItems.filter(i => isValidEmbedding(i.embedding));
  const useVectors = hasProfileEmbedding && itemsWithEmbeddings.length > 0;

  let vectorScores: Map<string, number> = new Map();
  let cfScores: Map<string, number> = new Map();
  let hasCfData = false;

  if (useVectors) {
    for (const item of itemsWithEmbeddings) {
      const sim = computeCosineSimilarity(profile.embedding!, item.embedding!);
      vectorScores.set(item.id, cosineSimilarityToScore(sim));
    }

    try {
      const cfSignals = await getCollaborativeFilteringSignals(userId, domain, 50);
      if (cfSignals.length > 0) {
        hasCfData = true;
        const maxCf = Math.max(...cfSignals.map(s => s.cfScore));
        for (const signal of cfSignals) {
          cfScores.set(signal.itemId, normalizeScore(signal.cfScore, 0, maxCf));
        }
      }
    } catch {
    }
  }

  const NEUTRAL_CF = 50;

  const results: HybridRecommendation[] = availableItems.map(item => {
    const itemTraits: Record<string, number> = {};
    for (const axis of TRAIT_AXES) {
      const key = `trait${axis.charAt(0).toUpperCase() + axis.slice(1)}` as keyof typeof item;
      itemTraits[axis] = (item[key] as number) ?? 0.5;
    }
    const traitResult = traitItemMatchScore(profile, itemTraits);
    const traitScore = traitResult.score;

    if (useVectors && vectorScores.has(item.id)) {
      const vs = vectorScores.get(item.id)!;
      const cf = cfScores.get(item.id) ?? NEUTRAL_CF;

      let hybridScore: number;
      if (hasCfData) {
        hybridScore = Math.round(
          vs * WEIGHTS.VECTOR_SIM +
          cf * WEIGHTS.COLLAB_FILTER +
          traitScore * WEIGHTS.TRAIT_SIM
        );
      } else {
        const adjustedVectorWeight = WEIGHTS.VECTOR_SIM + WEIGHTS.COLLAB_FILTER * 0.6;
        const adjustedTraitWeight = WEIGHTS.TRAIT_SIM + WEIGHTS.COLLAB_FILTER * 0.4;
        hybridScore = Math.round(
          vs * adjustedVectorWeight +
          traitScore * adjustedTraitWeight
        );
      }

      const explanationParts: string[] = [];
      if (vs >= 75) explanationParts.push("Strong semantic match to your taste profile");
      else if (vs >= 50) explanationParts.push("Good alignment with your preferences");
      if (cfScores.has(item.id)) explanationParts.push("Liked by people with similar taste");
      explanationParts.push(traitResult.explanation);

      return {
        item,
        hybridScore: Math.max(15, Math.min(100, hybridScore)),
        vectorScore: vs,
        cfScore: cf,
        traitScore,
        explanation: explanationParts[0],
        traitExplanation: traitResult.explanation,
        scoringMethod: "hybrid" as const,
      };
    }

    return {
      item,
      hybridScore: traitScore,
      vectorScore: 0,
      cfScore: 0,
      traitScore,
      explanation: traitResult.explanation,
      traitExplanation: traitResult.explanation,
      scoringMethod: "trait-only" as const,
    };
  });

  results.sort((a, b) => b.hybridScore - a.hybridScore);
  return results;
}

export function hybridSocialMatch(
  myProfile: TasteProfile,
  otherProfile: TasteProfile
): HybridSocialMatch {
  const traitResult = traitMatchScore(myProfile, otherProfile);
  const hasEmbeddings = isValidEmbedding(myProfile.embedding) && isValidEmbedding(otherProfile.embedding);

  if (hasEmbeddings) {
    const sim = computeCosineSimilarity(myProfile.embedding!, otherProfile.embedding!);
    const vectorScore = cosineSimilarityToScore(sim);

    const hybridScore = Math.round(
      vectorScore * SOCIAL_WEIGHTS.VECTOR_SIM +
      traitResult.score * SOCIAL_WEIGHTS.TRAIT_SIM
    );

    const finalScore = Math.max(15, Math.min(100, hybridScore));

    const explanations = [...traitResult.explanations];
    if (vectorScore >= 75) {
      explanations.unshift("Deep taste alignment detected by AI analysis");
    } else if (vectorScore >= 50) {
      explanations.unshift("Meaningful overlap in taste preferences");
    }

    return {
      userId: otherProfile.userId,
      hybridScore: finalScore,
      vectorScore,
      traitScore: traitResult.score,
      color: getMatchColor(finalScore),
      explanations,
      scoringMethod: "hybrid",
    };
  }

  return {
    userId: otherProfile.userId,
    hybridScore: traitResult.score,
    vectorScore: 0,
    traitScore: traitResult.score,
    color: traitResult.color,
    explanations: traitResult.explanations,
    scoringMethod: "trait-only",
  };
}

export function hybridEventScore(
  profile: TasteProfile,
  event: Event,
  userLat?: number | null,
  userLng?: number | null
): HybridEventScore {
  const eventTraits: Record<string, number> = {};
  for (const axis of TRAIT_AXES) {
    const key = `trait${axis.charAt(0).toUpperCase() + axis.slice(1)}` as keyof typeof event;
    eventTraits[axis] = (event[key] as number) ?? 0.5;
  }
  const traitResult = traitItemMatchScore(profile, eventTraits);

  const hasEmbeddings = isValidEmbedding(profile.embedding) && isValidEmbedding(event.embedding);
  let distanceBucket: string | null = null;
  let geoBonus = 50;

  if (userLat && userLng && event.locationLat && event.locationLng) {
    const dist = haversineDistance(userLat, userLng, event.locationLat, event.locationLng);
    distanceBucket = getDistanceBucket(dist);
    if (dist < 5) geoBonus = 100;
    else if (dist < 15) geoBonus = 85;
    else if (dist < 30) geoBonus = 70;
    else if (dist < 50) geoBonus = 55;
    else if (dist < 100) geoBonus = 40;
    else geoBonus = 20;
  }

  if (hasEmbeddings) {
    const sim = computeCosineSimilarity(profile.embedding!, event.embedding!);
    const vectorScore = cosineSimilarityToScore(sim);

    const hybridScore = Math.round(
      vectorScore * EVENT_WEIGHTS.VECTOR_SIM +
      traitResult.score * EVENT_WEIGHTS.TRAIT_SIM +
      geoBonus * EVENT_WEIGHTS.GEO_BONUS
    );
    const finalScore = Math.max(15, Math.min(100, hybridScore));

    const predictedEnjoyment = Math.round(
      vectorScore * 0.6 + traitResult.score * 0.4
    );

    const explanationParts: string[] = [];
    if (vectorScore >= 75) explanationParts.push("AI predicts high enjoyment based on your taste DNA");
    else if (vectorScore >= 50) explanationParts.push("Good match with your preferences");
    else explanationParts.push(traitResult.explanation);
    if (distanceBucket && geoBonus >= 70) explanationParts.push(`Conveniently located ${distanceBucket} away`);

    return {
      event,
      hybridScore: finalScore,
      vectorScore,
      traitScore: traitResult.score,
      predictedEnjoyment: Math.max(15, Math.min(100, predictedEnjoyment)),
      distanceBucket,
      explanation: explanationParts.join(". "),
      scoringMethod: "hybrid",
    };
  }

  return {
    event,
    hybridScore: traitResult.score,
    vectorScore: 0,
    traitScore: traitResult.score,
    predictedEnjoyment: traitResult.score,
    distanceBucket,
    explanation: traitResult.explanation,
    scoringMethod: "trait-only",
  };
}

export function hybridHobbyScore(
  profile: TasteProfile,
  hobby: Hobby
): HybridHobbyScore {
  const hobbyTraits: Record<string, number> = {};
  for (const axis of TRAIT_AXES) {
    const key = `trait${axis.charAt(0).toUpperCase() + axis.slice(1)}` as keyof typeof hobby;
    hobbyTraits[axis] = (hobby[key] as number) ?? 0.5;
  }
  const traitResult = traitHobbyMatch(profile, hobbyTraits);

  const hasEmbeddings = isValidEmbedding(profile.embedding) && isValidEmbedding(hobby.embedding);

  if (hasEmbeddings) {
    const sim = computeCosineSimilarity(profile.embedding!, hobby.embedding!);
    const vectorScore = cosineSimilarityToScore(sim);

    const hybridScore = Math.round(
      vectorScore * 0.55 +
      traitResult.score * 0.45
    );
    const finalScore = Math.max(15, Math.min(100, hybridScore));

    let whyItFits = traitResult.whyItFits;
    if (vectorScore >= 75) {
      whyItFits = `AI analysis shows strong alignment. ${whyItFits}`;
    }

    return {
      hobby,
      hybridScore: finalScore,
      vectorScore,
      traitScore: traitResult.score,
      whyItFits,
      scoringMethod: "hybrid",
    };
  }

  return {
    hobby,
    hybridScore: traitResult.score,
    vectorScore: 0,
    traitScore: traitResult.score,
    whyItFits: traitResult.whyItFits,
    scoringMethod: "trait-only",
  };
}
