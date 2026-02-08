import { pool } from "./db";

const EMBEDDING_DIM = 384;

let extractorPromise: Promise<any> | null = null;

async function getExtractor() {
  if (!extractorPromise) {
    extractorPromise = (async () => {
      const { pipeline } = await import("@xenova/transformers");
      console.log("[embeddings] Loading local all-MiniLM-L6-v2 model...");
      const extractor = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
      console.log("[embeddings] Local model loaded successfully (384-dim)");
      return extractor;
    })();
  }
  return extractorPromise;
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const extractor = await getExtractor();
  const result = await extractor(text.slice(0, 8000), { pooling: "mean", normalize: true });
  return Array.from(result.data as Float32Array);
}

export function buildEmbeddingText(item: {
  title: string;
  tags?: string[] | null;
  description?: string | null;
}): string {
  const parts = [item.title];
  if (item.tags && item.tags.length > 0) {
    parts.push(`Tags: ${item.tags.join(", ")}`);
  }
  if (item.description) {
    parts.push(item.description);
  }
  return parts.join(". ");
}

export async function generateAndStoreEmbedding(
  table: "items" | "hobbies" | "events" | "taste_profiles",
  id: string,
  text: string
): Promise<number[]> {
  const embedding = await generateEmbedding(text);
  const vectorStr = `[${embedding.join(",")}]`;
  await pool.query(
    `UPDATE ${table} SET embedding = $1::vector, embedding_updated_at = NOW() WHERE id = $2`,
    [vectorStr, id]
  );
  return embedding;
}

export async function storeEmbedding(
  table: "items" | "hobbies" | "events" | "taste_profiles",
  id: string,
  embedding: number[]
): Promise<void> {
  const vectorStr = `[${embedding.join(",")}]`;
  await pool.query(
    `UPDATE ${table} SET embedding = $1::vector, embedding_updated_at = NOW() WHERE id = $2`,
    [vectorStr, id]
  );
}

export async function generateBatchEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const results: number[][] = [];
  for (const text of texts) {
    const embedding = await generateEmbedding(text);
    results.push(embedding);
  }
  return results;
}

export function isValidEmbedding(embedding: number[] | null | undefined): boolean {
  return Array.isArray(embedding) && embedding.length === EMBEDDING_DIM;
}

export function computeCosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length !== EMBEDDING_DIM) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;
  return dot / denom;
}

export function cosineSimilarityToScore(similarity: number): number {
  const normalized = (similarity + 1) / 2;
  const score = Math.round(normalized * 100);
  return Math.max(15, Math.min(100, score));
}

export function computeWeightedAverageEmbedding(
  embeddings: number[][],
  weights: number[]
): number[] {
  if (embeddings.length === 0) return [];
  const dim = embeddings[0].length;
  const result = new Array(dim).fill(0);
  let totalWeight = 0;

  for (let i = 0; i < embeddings.length; i++) {
    const w = weights[i] || 1.0;
    totalWeight += Math.abs(w);
    for (let j = 0; j < dim; j++) {
      result[j] += embeddings[i][j] * w;
    }
  }

  if (totalWeight > 0) {
    for (let j = 0; j < dim; j++) {
      result[j] /= totalWeight;
    }
  }

  const norm = Math.sqrt(result.reduce((s, v) => s + v * v, 0));
  if (norm > 0) {
    for (let j = 0; j < dim; j++) {
      result[j] /= norm;
    }
  }

  return result;
}

const ALLOWED_EMBEDDING_TABLES = new Set(["items", "hobbies", "events", "taste_profiles"]);

export async function findSimilarByEmbedding(
  table: "items" | "hobbies" | "events" | "taste_profiles",
  embedding: number[],
  limit: number = 20,
  excludeIds: string[] = []
): Promise<{ id: string; similarity: number }[]> {
  if (!ALLOWED_EMBEDDING_TABLES.has(table)) {
    throw new Error(`Invalid table name: ${table}`);
  }
  if (embedding.length !== EMBEDDING_DIM) {
    return [];
  }

  const vectorStr = `[${embedding.join(",")}]`;
  let query = `
    SELECT id, 1 - (embedding <=> $1::vector) as similarity
    FROM ${table}
    WHERE embedding IS NOT NULL
  `;
  const params: any[] = [vectorStr];
  let paramIdx = 2;

  if (excludeIds.length > 0) {
    query += ` AND id != ALL($${paramIdx}::varchar[])`;
    params.push(excludeIds);
    paramIdx++;
  }

  query += ` ORDER BY embedding <=> $1::vector LIMIT $${paramIdx}`;
  params.push(limit);

  const result = await pool.query(query, params);
  return result.rows.map(row => ({
    id: row.id,
    similarity: parseFloat(row.similarity),
  }));
}

export async function findSimilarItemsByDomain(
  embedding: number[],
  domain: string,
  limit: number = 20,
  excludeIds: string[] = []
): Promise<{ id: string; similarity: number }[]> {
  const vectorStr = `[${embedding.join(",")}]`;
  let query = `
    SELECT id, 1 - (embedding <=> $1::vector) as similarity
    FROM items
    WHERE embedding IS NOT NULL AND domain = $2
  `;
  const params: any[] = [vectorStr, domain];
  let paramIdx = 3;

  if (excludeIds.length > 0) {
    query += ` AND id != ALL($${paramIdx}::varchar[])`;
    params.push(excludeIds);
    paramIdx++;
  }

  query += ` ORDER BY embedding <=> $1::vector LIMIT $${paramIdx}`;
  params.push(limit);

  const result = await pool.query(query, params);
  return result.rows.map(row => ({
    id: row.id,
    similarity: parseFloat(row.similarity),
  }));
}

export async function getCollaborativeFilteringSignals(
  userId: string,
  domain: string,
  limit: number = 20
): Promise<{ itemId: string; cfScore: number }[]> {
  const result = await pool.query(`
    WITH user_liked AS (
      SELECT item_id FROM interactions
      WHERE user_id = $1 AND domain = $2 AND weight > 0
    ),
    similar_users AS (
      SELECT i2.user_id, COUNT(*) as overlap
      FROM interactions i2
      WHERE i2.item_id IN (SELECT item_id FROM user_liked)
        AND i2.user_id != $1
        AND i2.weight > 0
      GROUP BY i2.user_id
      HAVING COUNT(*) >= 1
      ORDER BY overlap DESC
      LIMIT 50
    ),
    cf_items AS (
      SELECT i3.item_id,
        SUM(i3.weight * su.overlap) as weighted_score,
        COUNT(DISTINCT i3.user_id) as user_count
      FROM interactions i3
      JOIN similar_users su ON i3.user_id = su.user_id
      WHERE i3.domain = $2
        AND i3.weight > 0
        AND i3.item_id NOT IN (SELECT item_id FROM user_liked)
      GROUP BY i3.item_id
      ORDER BY weighted_score DESC
      LIMIT $3
    )
    SELECT item_id, weighted_score as cf_score FROM cf_items
  `, [userId, domain, limit]);

  return result.rows.map(row => ({
    itemId: row.item_id,
    cfScore: parseFloat(row.cf_score),
  }));
}

export function haversineDistance(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function getDistanceBucket(distanceKm: number): string {
  if (distanceKm < 1) return "< 1 km";
  if (distanceKm < 5) return "< 5 km";
  if (distanceKm < 10) return "< 10 km";
  if (distanceKm < 25) return "< 25 km";
  if (distanceKm < 50) return "< 50 km";
  if (distanceKm < 100) return "< 100 km";
  return "> 100 km";
}

export async function recomputeTasteEmbedding(userId: string): Promise<{ updated: boolean; interactionCount: number; method: string }> {
  const profileResult = await pool.query(
    "SELECT id FROM taste_profiles WHERE user_id = $1",
    [userId]
  );
  if (profileResult.rows.length === 0) {
    return { updated: false, interactionCount: 0, method: "no_profile" };
  }
  const profileId = profileResult.rows[0].id;

  const interactionsResult = await pool.query(`
    SELECT i.item_id, i.action, i.weight, it.embedding
    FROM interactions i
    JOIN items it ON i.item_id = it.id
    WHERE i.user_id = $1 AND it.embedding IS NOT NULL
    ORDER BY i.created_at DESC
    LIMIT 200
  `, [userId]);

  const embeddings: number[][] = [];
  const weights: number[] = [];

  for (const row of interactionsResult.rows) {
    let emb: number[];
    if (typeof row.embedding === "string") {
      emb = row.embedding.replace(/[\[\]]/g, "").split(",").map(Number);
    } else {
      emb = row.embedding;
    }
    if (emb && emb.length === EMBEDDING_DIM) {
      embeddings.push(emb);
      const w = parseFloat(row.weight);
      weights.push(w);
    }
  }

  if (embeddings.length > 0) {
    const profileEmbedding = computeWeightedAverageEmbedding(embeddings, weights);
    await storeEmbedding("taste_profiles", profileId, profileEmbedding);
    console.log(`[tasteEmbedding] Recomputed for user ${userId}: ${embeddings.length} items, weights: [${weights.slice(0, 5).join(", ")}${weights.length > 5 ? "..." : ""}]`);
    return { updated: true, interactionCount: embeddings.length, method: "interactions" };
  }

  return { updated: false, interactionCount: 0, method: "no_interactions" };
}

export async function deriveEmbeddingFromProfile(userId: string): Promise<{ updated: boolean; method: string }> {
  const profileResult = await pool.query(
    `SELECT id, trait_novelty, trait_intensity, trait_cozy, trait_strategy,
            trait_social, trait_creativity, trait_nostalgia, trait_adventure,
            top_clusters, embedding
     FROM taste_profiles WHERE user_id = $1`,
    [userId]
  );
  if (profileResult.rows.length === 0) {
    return { updated: false, method: "no_profile" };
  }
  const prof = profileResult.rows[0];

  if (isValidEmbedding(prof.embedding)) {
    let emb: number[];
    if (typeof prof.embedding === "string") {
      emb = prof.embedding.replace(/[\[\]]/g, "").split(",").map(Number);
    } else {
      emb = prof.embedding;
    }
    if (emb.length === EMBEDDING_DIM) {
      return { updated: false, method: "already_has_embedding" };
    }
  }

  const first = await recomputeTasteEmbedding(userId);
  if (first.updated) {
    return { updated: true, method: "interactions" };
  }

  const traitText = [
    `Taste profile traits:`,
    `novelty=${prof.trait_novelty}`,
    `intensity=${prof.trait_intensity}`,
    `cozy=${prof.trait_cozy}`,
    `strategy=${prof.trait_strategy}`,
    `social=${prof.trait_social}`,
    `creativity=${prof.trait_creativity}`,
    `nostalgia=${prof.trait_nostalgia}`,
    `adventure=${prof.trait_adventure}`,
    prof.top_clusters ? `Clusters: ${prof.top_clusters.join(", ")}` : "",
  ].filter(Boolean).join(". ");

  const embedding = await generateEmbedding(traitText);
  await storeEmbedding("taste_profiles", prof.id, embedding);
  console.log(`[tasteEmbedding] Derived from traits for user ${userId}`);
  return { updated: true, method: "derived_from_traits" };
}

export async function checkEmbeddingHealth(): Promise<{
  itemsMissingEmbeddings: number;
  eventsMissingEmbeddings: number;
  hobbiesMissingEmbeddings: number;
  usersWithTasteEmbedding: number;
  totalUsers: number;
  totalItems: number;
  totalEvents: number;
  totalHobbies: number;
}> {
  const results = await Promise.all([
    pool.query("SELECT COUNT(*) as count FROM items WHERE embedding IS NULL"),
    pool.query("SELECT COUNT(*) as count FROM events WHERE embedding IS NULL"),
    pool.query("SELECT COUNT(*) as count FROM hobbies WHERE embedding IS NULL"),
    pool.query("SELECT COUNT(*) as count FROM taste_profiles WHERE embedding IS NOT NULL"),
    pool.query("SELECT COUNT(*) as count FROM taste_profiles"),
    pool.query("SELECT COUNT(*) as count FROM items"),
    pool.query("SELECT COUNT(*) as count FROM events"),
    pool.query("SELECT COUNT(*) as count FROM hobbies"),
  ]);

  return {
    itemsMissingEmbeddings: parseInt(results[0].rows[0].count),
    eventsMissingEmbeddings: parseInt(results[1].rows[0].count),
    hobbiesMissingEmbeddings: parseInt(results[2].rows[0].count),
    usersWithTasteEmbedding: parseInt(results[3].rows[0].count),
    totalUsers: parseInt(results[4].rows[0].count),
    totalItems: parseInt(results[5].rows[0].count),
    totalEvents: parseInt(results[6].rows[0].count),
    totalHobbies: parseInt(results[7].rows[0].count),
  };
}

export async function preloadModel(): Promise<void> {
  await getExtractor();
}
