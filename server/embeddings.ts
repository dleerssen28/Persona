import OpenAI from "openai";
import { pool } from "./db";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIM = 1536;

export async function generateEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text.slice(0, 8000),
  });
  return response.data[0].embedding;
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
  const batchSize = 100;
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize).map(t => t.slice(0, 8000));
    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: batch,
    });
    const sorted = response.data.sort((a, b) => a.index - b.index);
    allEmbeddings.push(...sorted.map(d => d.embedding));
  }

  return allEmbeddings;
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

export async function updateUserTasteEmbedding(userId: string): Promise<void> {
  const interactionsResult = await pool.query(`
    SELECT i.item_id, i.weight, it.embedding
    FROM interactions i
    JOIN items it ON i.item_id = it.id
    WHERE i.user_id = $1 AND i.weight > 0 AND it.embedding IS NOT NULL
    ORDER BY i.created_at DESC
    LIMIT 100
  `, [userId]);

  if (interactionsResult.rows.length === 0) return;

  const embeddings: number[][] = [];
  const weights: number[] = [];

  for (const row of interactionsResult.rows) {
    let emb: number[];
    if (typeof row.embedding === "string") {
      emb = row.embedding.replace(/[\[\]]/g, "").split(",").map(Number);
    } else {
      emb = row.embedding;
    }
    if (emb && emb.length > 0) {
      embeddings.push(emb);
      weights.push(row.weight);
    }
  }

  if (embeddings.length === 0) return;

  const profileEmbedding = computeWeightedAverageEmbedding(embeddings, weights);

  const profileResult = await pool.query(
    "SELECT id FROM taste_profiles WHERE user_id = $1",
    [userId]
  );

  if (profileResult.rows.length > 0) {
    await storeEmbedding("taste_profiles", profileResult.rows[0].id, profileEmbedding);
  }
}
