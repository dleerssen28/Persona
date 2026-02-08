# Persona — Taste Intelligence Platform

## The Problem

Real-world loneliness is skyrocketing. Existing social platforms match on superficial signals (photos, bios, location). Content recommendations lack explainability. Event discovery ignores *who* you'd actually enjoy an event *with*. Persona solves all three by building a **Taste DNA** — a neural embedding of your preferences across movies, music, games, food, and hobbies — then using that DNA to match you with compatible people, recommend content you'll actually love, and predict which events will be meaningful to you. Every recommendation comes with a human-readable "why."

---

## AI/ML Architecture (Not Smoke — Proof)

### Transformer Embeddings (Local, Real, 384-dim)
- **Model**: `all-MiniLM-L6-v2` via `@xenova/transformers` — runs entirely in-process, zero external API dependencies
- **Dimension**: 384-dim normalized vectors for all items, events, hobbies, and user taste profiles
- **Coverage**: 100% of all entities embedded at startup; verified via `/api/debug/embedding-health`
- **Proof**: `/api/debug/ai-status` returns `embeddingDim: 384`, `modelName`, `avgVectorNorm` (confirms non-zero, normalized vectors)

### Vector Similarity Search (pgvector)
- PostgreSQL `pgvector` extension with `vector(384)` columns on items, events, hobbies, taste_profiles
- Cosine distance operator `<=>` for nearest-neighbor retrieval
- Used for: content ranking, social matching, collaborative filtering neighbor discovery, event attendee matching

### Collaborative Filtering ("People Like You Liked")
- Embedding-based neighbor discovery: top 20 users by taste embedding cosine similarity
- Weighted action aggregation: love (2.0), save (1.5), like (1.0), view (0.3), skip (-0.5)
- Community picks with "loved by N users with similar taste" explanations

### Hybrid Ranking + Explainability Layer
- **Scoring formula**: `0.55 × vectorSimilarity + 0.25 × collaborativeFiltering + 0.20 × traitExplainability`
- **Scoring methods**: `embedding` (vector-primary), `hybrid` (vector+CF+traits), `trait_fallback` (graceful degradation)
- **Fallback tracking**: `fallbackReason` field on every scored item (`missing_user_embedding`, `missing_item_embedding`, etc.)
- Every score includes a human-readable explanation of *why* it was ranked

---

## Interdisciplinary Map

### ML / Recommender Systems
- Transformer-based sentence embeddings for semantic content understanding
- Hybrid scoring: neural similarity + collaborative filtering + trait algebra
- Cold-start handling via trait-derived embeddings when interaction history is sparse

### Psychology (Interpretable Personality Axes)
- 8-axis taste trait model: novelty, intensity, cozy, strategy, social, creativity, nostalgia, adventure
- Tag-to-trait mapping builds user profiles from stated preferences
- Cluster generation (Creative Thinker, Adventurer, Strategic Mind, etc.) for identity framing

### Social Computing / Network Science
- Compatibility graph: embedding-based social matching with match percentages
- Attendee matching at events: "who at this event would you vibe with?"
- Shared interest detection via cluster overlap + embedding cosine similarity

### Geospatial Computing
- Haversine distance calculation for event proximity scoring
- Distance buckets: <5km, <15km, <30km, <50km, <100km, >100km
- Privacy radius support per user
- Event scoring formula integrates proximity: `0.55 taste + 0.25 proximity + 0.20 timeRelevance`

### HCI / Explainable AI
- Every recommendation, match, and event score includes "why" text
- Match colors (green 75+, yellow 50-74, red <50) for instant comprehension
- `top3SharedThemes` derived from embedding midpoint nearest-neighbor search
- Cold-start proof endpoint shows high match despite low explicit overlap, with explanation

---

## 60-Second Demo Script

1. **[5s] AI Proof** → `GET /api/debug/ai-status`
   "Local transformer model, 384-dim embeddings, 100% coverage. Zero external APIs."

2. **[10s] Recommendations** → `GET /api/recommendations/movies`
   "Hybrid ML ranking: vector similarity + collaborative filtering + explainability. Every item has a vectorScore."

3. **[10s] Cold Start Solved** → `GET /api/debug/match-proof/seed-devon`
   "85%+ match with <10% item overlap. Embeddings capture latent taste beyond explicit history."

4. **[10s] Event Compatibility** → `GET /api/events/for-you?lat=37.4275&lng=-122.1697`
   "3-factor scoring: taste similarity + geospatial proximity + time relevance. Real-world fit prediction."

5. **[10s] Attendee Matching** → `GET /api/events/{id}/attendee-matches`
   "Who at this event matches your Taste DNA? Match %, top traits, 'why we match' sentence."

6. **[10s] Embedding Sanity** → `GET /api/debug/embedding-similarity-sanity`
   "Pairwise cosine similarity matrix per domain. Semantic clustering is real, not random."

**Pre-demo**: Run `POST /api/demo/reset` to guarantee clean state.

---

## Why Not Generic Tinder / Why This Is Novel

- **Not swipe-based**: Taste DNA is built from explicit preferences + interaction history, not photos
- **Not black-box**: Every score has a human-readable "why" — judges can audit the ML
- **Not single-domain**: 5 domains (movies, music, games, food, hobbies) create a rich, cross-domain taste profile
- **Not API-dependent**: Local transformer model runs in-process — no OpenAI, no rate limits, no costs
- **Not location-only**: Events scored by taste + proximity + time, not just distance
- **Cold start solved**: High matches found even with zero shared interaction history via embedding semantics
- **Provably real ML**: Debug endpoints expose embedding dimensions, vector norms, cosine similarity matrices, scoring methods — all auditable
