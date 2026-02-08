import { pool } from "./db";
import { computeCosineSimilarity, isValidEmbedding } from "./embeddings";

const EMBEDDING_DIM = 384;

interface CFCandidate {
  itemId: string;
  score: number;
  lovedByCount: number;
  avgNeighborSimilarity: number;
  topNeighborNames: string[];
}

interface CFResult {
  candidates: CFCandidate[];
  neighborCount: number;
}

const ACTION_WEIGHTS: Record<string, number> = {
  love: 2.0,
  save: 1.5,
  like: 1.0,
  view: 0.3,
  skip: -0.5,
};

export async function getEmbeddingNeighborCF(
  userId: string,
  domain: string,
  userEmbedding: number[],
  topN: number = 20,
  similarityThreshold: number = 0.3
): Promise<CFResult> {
  if (!isValidEmbedding(userEmbedding)) {
    return { candidates: [], neighborCount: 0 };
  }

  const vectorStr = `[${userEmbedding.join(",")}]`;
  const neighborsResult = await pool.query(`
    SELECT tp.user_id, u.first_name, u.last_name,
           1 - (tp.embedding <=> $1::vector) as similarity
    FROM taste_profiles tp
    JOIN users u ON tp.user_id = u.id
    WHERE tp.embedding IS NOT NULL
      AND tp.user_id != $2
      AND tp.onboarding_complete = true
      AND 1 - (tp.embedding <=> $1::vector) > $3
    ORDER BY tp.embedding <=> $1::vector
    LIMIT $4
  `, [vectorStr, userId, similarityThreshold, topN]);

  if (neighborsResult.rows.length === 0) {
    return { candidates: [], neighborCount: 0 };
  }

  const neighborIds = neighborsResult.rows.map((r: any) => r.user_id);
  const neighborSimilarities = new Map<string, number>();
  const neighborNames = new Map<string, string>();
  for (const row of neighborsResult.rows) {
    neighborSimilarities.set(row.user_id, parseFloat(row.similarity));
    neighborNames.set(row.user_id, `${row.first_name || ""} ${row.last_name || ""}`.trim());
  }

  const userInteractedResult = await pool.query(`
    SELECT DISTINCT item_id FROM interactions
    WHERE user_id = $1 AND domain = $2
  `, [userId, domain]);
  const userInteractedIds = new Set(userInteractedResult.rows.map((r: any) => r.item_id));

  const neighborInteractionsResult = await pool.query(`
    SELECT i.user_id, i.item_id, i.action, i.weight
    FROM interactions i
    WHERE i.user_id = ANY($1::varchar[])
      AND i.domain = $2
      AND i.weight > 0
  `, [neighborIds, domain]);

  const itemAggregation = new Map<string, {
    totalScore: number;
    lovedByCount: number;
    neighborSims: number[];
    contributorIds: Set<string>;
  }>();

  for (const row of neighborInteractionsResult.rows) {
    if (userInteractedIds.has(row.item_id)) continue;

    const neighborSim = neighborSimilarities.get(row.user_id) || 0;
    const actionWeight = ACTION_WEIGHTS[row.action] || parseFloat(row.weight) || 1.0;
    const weightedScore = neighborSim * actionWeight;

    if (!itemAggregation.has(row.item_id)) {
      itemAggregation.set(row.item_id, {
        totalScore: 0,
        lovedByCount: 0,
        neighborSims: [],
        contributorIds: new Set(),
      });
    }

    const agg = itemAggregation.get(row.item_id)!;
    agg.totalScore += weightedScore;
    if (row.action === "love" || row.action === "like" || row.action === "save") {
      agg.lovedByCount++;
    }
    agg.neighborSims.push(neighborSim);
    agg.contributorIds.add(row.user_id);
  }

  const candidates: CFCandidate[] = [];
  const entries = Array.from(itemAggregation.entries());
  for (const [itemId, agg] of entries) {
    const avgSim = agg.neighborSims.reduce((a: number, b: number) => a + b, 0) / agg.neighborSims.length;

    const topContributors = Array.from(agg.contributorIds)
      .sort((a: string, b: string) => (neighborSimilarities.get(b) || 0) - (neighborSimilarities.get(a) || 0))
      .slice(0, 2)
      .map((id: string) => neighborNames.get(id) || "Someone");

    candidates.push({
      itemId,
      score: agg.totalScore,
      lovedByCount: agg.lovedByCount,
      avgNeighborSimilarity: Math.round(avgSim * 100) / 100,
      topNeighborNames: topContributors,
    });
  }

  candidates.sort((a, b) => b.score - a.score);

  return {
    candidates: candidates.slice(0, 50),
    neighborCount: neighborsResult.rows.length,
  };
}
