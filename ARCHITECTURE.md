# Persona: Technical Architecture and Backend Design

## 1. Application Overview and Problem Statement

Persona is a taste intelligence platform that constructs a multidimensional psychological profile, called a "Taste DNA," for each user across five cultural domains: movies, music, games, food, and hobbies. The system solves four interconnected problems:

1. **Profile Construction**: Transform a user's self-reported preferences and behavioral signals into a quantifiable, eight-dimensional trait vector that captures not just what a person likes, but the psychological texture of why they like it.

2. **Personalized Recommendation**: Use the trait vector to score and rank content items across all five domains, filtering out previously interacted items and sorting by similarity to the user's profile.

3. **Social Matching**: Compute pairwise compatibility scores between users by measuring the geometric distance between their trait vectors, producing explainable match results with natural-language reasoning about shared and divergent tendencies.

4. **Event Discovery and Attendee Matching**: Surface relevant events (both institutional and user-created) ranked by taste alignment, and connect RSVPed attendees who share compatible profiles.

The system is designed to be explainable at every layer. Rather than outputting opaque "you might like this" suggestions, every recommendation, match score, and hobby suggestion includes a human-readable explanation grounded in the specific trait axes that drove the computation.

---

## 2. System Architecture

### 2.1 High-Level Topology

The application is a monolithic full-stack JavaScript/TypeScript application deployed as a single process. There is no microservice decomposition or message queue infrastructure. The architecture follows a three-tier pattern:

```
Client (React + Vite)  <-->  Express HTTP Server  <-->  PostgreSQL (Neon-backed)
```

A single Node.js process hosts both the Express API server and, in development mode, the Vite dev server via middleware mode. In production, the Express server serves pre-built static assets directly. Both the API and the frontend are served on a single port (5000), eliminating CORS configuration and simplifying deployment.

### 2.2 Server Bootstrap Sequence

The server bootstrap in `server/index.ts` follows this order:

1. **Express initialization**: Create the Express application and HTTP server. Configure JSON body parsing with raw body preservation (for webhook signature verification if needed) and URL-encoded form parsing.

2. **Request logging middleware**: Intercept `res.json()` calls to capture response bodies, then log method, path, status code, duration, and response payload for every `/api/*` request.

3. **Route registration**: `registerRoutes()` is called, which first initializes Passport.js and OIDC authentication, then registers all API route handlers.

4. **Database seeding**: `seedDatabase()` runs idempotently, checking row counts for items, hobbies, seed users, and events, inserting seed data only when the tables are underpopulated.

5. **Error handling middleware**: A global error handler catches unhandled errors from route handlers.

6. **Static/Vite serving**: In development, Vite middleware is attached for HMR and index.html transformation. In production, pre-built static files are served from the filesystem.

### 2.3 Database Layer

The database is PostgreSQL, hosted on Neon (Replit's managed Postgres offering). The connection is established through a `pg.Pool` with SSL enabled (`rejectUnauthorized: false` for Neon's self-signed certificates). The pool connects via the `DATABASE_URL` environment variable.

The ORM layer is **Drizzle ORM**, which provides:
- Type-safe table definitions in `shared/schema.ts`
- Composable query builders (`eq`, `and`, `inArray`, `ne`, `desc`)
- Schema-driven insert validation via `drizzle-zod` (generating Zod schemas from table definitions)
- Upsert support via `.onConflictDoUpdate()`
- Direct SQL escape hatch via `sql` template literals for aggregation queries

Schema synchronization uses `drizzle-kit`'s `db:push` command rather than sequential migration files, pushing the TypeScript schema definition directly to the database.

---

## 3. Data Model

### 3.1 Core Tables

**`users`** (managed by the auth integration)
- `id: varchar` (primary key, UUID)
- `email: varchar` (unique)
- `firstName, lastName, profileImageUrl: varchar`
- `createdAt, updatedAt: timestamp`

This table is populated and updated by the OIDC authentication flow. When a user authenticates, their identity provider claims are mapped to this table via an upsert operation.

**`sessions`** (managed by `connect-pg-simple`)
- Standard session store table for Express sessions
- Session data includes serialized Passport user objects containing OIDC tokens, claims, and expiry timestamps

**`taste_profiles`**
- `id: varchar` (UUID, auto-generated)
- `userId: varchar` (unique, foreign key concept to `users.id`)
- Eight trait columns: `traitNovelty`, `traitIntensity`, `traitCozy`, `traitStrategy`, `traitSocial`, `traitCreativity`, `traitNostalgia`, `traitAdventure` (all `real`, default 0.5)
- `topClusters: text[]` (array of cluster labels like "Creative Thinker", "Adventurer")
- `onboardingComplete: boolean`
- `embedding: vector(1536)` (neural taste embedding, weighted average of liked item embeddings)
- `embeddingUpdatedAt: timestamp`
- `updatedAt: timestamp`

The trait columns form the core "Taste DNA" vector. Each value is a float between 0.0 and 1.0, where 0.5 represents a neutral baseline. The `userId` column has a unique constraint, enabling upsert semantics where repeated profile updates replace the previous values. The `embedding` column stores a 1536-dimensional vector representation of the user's taste, generated as a weighted average of embeddings from items they've positively interacted with.

**`items`**
- `id: varchar` (UUID)
- `domain: text` ("movies", "music", "games", "food", "hobbies")
- `title, description, imageUrl: text`
- `tags: text[]` (tag array for categorization)
- `popularity: integer`
- Eight trait columns (same schema as taste_profiles)
- `embedding: vector(1536)` (neural semantic embedding from title+tags+description)
- `embeddingUpdatedAt: timestamp`
- Indexed on `domain` for efficient domain-filtered queries
- HNSW index on `embedding` using `vector_cosine_ops`

Items represent recommendable content. Each item carries both a trait vector (for explainability) and a neural embedding (for semantic similarity). The trait vector represents the "personality" of that piece of content, while the embedding captures nuanced semantic relationships that traits alone cannot express.

**`interactions`**
- `id: varchar` (UUID)
- `userId, itemId: varchar`
- `domain: text`
- `action: text` ("like", "love", "save", "skip", "view")
- `weight: real` (action-specific multiplier)
- `createdAt: timestamp`
- Indexed on `userId`

Interactions record every user action on a content item. The weight field encodes action intensity: `love` = 2.0, `save` = 1.5, `like` = 1.0, `view` = 0.3, `skip` = -0.5. These weights are assigned at write time and stored alongside the interaction.

**`matches`**
- `id: varchar` (UUID)
- `userAId, userBId: varchar`
- `score: integer` (0-100)
- `color: text` ("green", "yellow", "grey")
- `explanations: text[]`
- `createdAt: timestamp`

This table exists for caching computed match results, though the current implementation computes matches on-the-fly at request time rather than reading from this cache.

**`hobbies`**
- Same structure as `items` but without `domain` or `popularity`
- Includes `starterLinks: text[]` for hobby onramp resources
- Eight trait columns for taste-based matching

**`events`**
- `id: varchar` (UUID)
- `title, description, location: text`
- `category: text` ("organized" or "custom")
- `dateTime: timestamp`
- `imageUrl: text` (maps to a frontend image identifier)
- `tags: text[]`
- `creatorId: varchar` (null for organized events, user ID for custom events)
- `creatorName, contactInfo: text`
- `attendeeCount: integer`
- `locationLat, locationLng: real` (GPS coordinates for proximity-based scoring)
- Eight trait columns
- `embedding: vector(1536)` (neural semantic embedding)
- `embeddingUpdatedAt: timestamp`
- Indexed on `category`
- HNSW index on `embedding` using `vector_cosine_ops`

Events carry both trait vectors and neural embeddings. The hybrid scoring for events includes a geolocation bonus (25% weight) based on Haversine distance from the user, alongside vector similarity (50%) and trait alignment (25%).

**`event_rsvps`**
- `id: varchar` (UUID)
- `eventId, userId: varchar`
- `createdAt: timestamp`
- Indexed on both `eventId` and `userId`

The junction table for event attendance. The composite of `(eventId, userId)` forms a logical unique constraint enforced at the application layer via a `hasUserRsvpd` check before insertion.

### 3.2 Schema Validation

Every table has a corresponding Zod insert schema generated by `drizzle-zod`'s `createInsertSchema()`. Auto-generated fields (`id`, `createdAt`, `updatedAt`) are omitted via `.omit()`. These schemas are used for both compile-time type inference and runtime request validation:

```typescript
export const insertTasteProfileSchema = createInsertSchema(tasteProfiles).omit({ id: true, updatedAt: true });
export type InsertTasteProfile = z.infer<typeof insertTasteProfileSchema>;
export type TasteProfile = typeof tasteProfiles.$inferSelect;
```

This pattern ensures that insert types, select types, and runtime validators are all derived from a single source of truth: the Drizzle table definition.

---

## 4. Authentication and Session Management

### 4.1 OIDC Integration

Authentication is handled through Replit's OpenID Connect (OIDC) provider. The implementation uses the `openid-client` library for OIDC discovery and token management, and `passport` for session serialization.

**Discovery**: At startup, the server performs OIDC discovery against the issuer URL (`https://replit.com/oidc` or a custom `ISSUER_URL`). The discovery result is memoized for one hour to avoid repeated network calls:

```typescript
const getOidcConfig = memoize(
  async () => {
    return await client.discovery(
      new URL(process.env.ISSUER_URL ?? "https://replit.com/oidc"),
      process.env.REPL_ID!
    );
  },
  { maxAge: 3600 * 1000 }
);
```

**Authentication Flow**:
1. User clicks "Log in with Replit" on the frontend
2. Browser navigates to `/api/login`, which redirects to the OIDC authorization endpoint
3. After authenticating with Replit, the provider redirects to `/api/callback`
4. The callback handler exchanges the authorization code for tokens
5. The `verify` function extracts claims from the ID token, upserts the user record in the database, and stores tokens in the session
6. User is redirected back to the application

**Session Storage**: Sessions are stored in PostgreSQL via `connect-pg-simple`. The session table is `sessions` with a TTL of 7 days. Session cookies are configured as `httpOnly` and `secure`, with the Express app trusting proxy headers (`trust proxy: 1`) for correct HTTPS detection behind Replit's reverse proxy.

### 4.2 Authentication Middleware

The `isAuthenticated` middleware protects all API routes. It performs three checks:

1. Passport's `req.isAuthenticated()` returns true (session exists and is valid)
2. The session contains an `expires_at` timestamp
3. The current time has not exceeded `expires_at`

If the access token is expired but a refresh token exists, the middleware transparently refreshes the token:

```typescript
const tokenResponse = await client.refreshTokenGrant(config, refreshToken);
updateUserSession(user, tokenResponse);
```

This ensures long-lived sessions without requiring re-authentication until the refresh token itself expires.

---

## 5. The Hybrid AI/ML Scoring Engine

The scoring engine combines three complementary approaches in a hybrid architecture:

1. **Neural Embedding Similarity (55% weight)**: 1536-dimensional vector embeddings generated by OpenAI's `text-embedding-3-small` model, compared via cosine similarity
2. **Collaborative Filtering (25% weight)**: SQL-based user-item co-occurrence matrix identifying similar users by interaction overlap
3. **Trait Explainability (20% weight)**: The original 8-dimensional trait algebra, preserved for human-readable explanations

The system gracefully degrades: when embeddings are unavailable (API quota exceeded, new items without embeddings), it falls back to trait-only scoring automatically.

### 5.0 Embedding Pipeline

**Embedding Generation** (`server/embeddings.ts`):
- Uses OpenAI `text-embedding-3-small` model producing 1536-dimensional vectors
- Text input is constructed from `title + tags + description` concatenation
- Batch processing supports up to 100 texts per API call
- Embeddings stored as `vector(1536)` columns via pgvector extension with HNSW indexes

**pgvector Integration**:
- Extension enabled at database initialization
- HNSW indexes on all embedding columns using `vector_cosine_ops` operator class
- KNN search via `<=>` cosine distance operator
- Custom Drizzle type bridges the gap between pgvector's wire format and JavaScript number arrays

**User Taste Embeddings**:
- Generated as weighted average of liked item embeddings
- Interaction weights: love=2.0, save=1.5, like=1.0
- L2-normalized after averaging to maintain unit sphere property
- Updated asynchronously after each positive interaction (like/love/save)
- Also regenerated on onboarding completion

**Seed Embedding Pipeline** (`server/seed.ts`):
- On startup, checks for items/hobbies/events/profiles missing embeddings
- Generates embeddings in batch via OpenAI API
- For seed user profiles, creates composite embeddings from random item embeddings
- Entire pipeline is wrapped in error handling - failures are non-fatal

### 5.0.1 Collaborative Filtering

The CF component uses a SQL-based approach:

```sql
WITH user_liked AS (
  SELECT item_id FROM interactions WHERE user_id = $1 AND weight > 0
),
similar_users AS (
  SELECT user_id, COUNT(*) as overlap
  FROM interactions
  WHERE item_id IN (SELECT item_id FROM user_liked)
    AND user_id != $1 AND weight > 0
  GROUP BY user_id HAVING COUNT(*) >= 1
  ORDER BY overlap DESC LIMIT 50
),
cf_items AS (
  SELECT item_id, SUM(weight * overlap) as weighted_score
  FROM interactions JOIN similar_users ON user_id = similar_users.user_id
  WHERE domain = $2 AND weight > 0
    AND item_id NOT IN (SELECT item_id FROM user_liked)
  GROUP BY item_id ORDER BY weighted_score DESC LIMIT $3
)
```

This finds users who liked the same items, then surfaces items *they* liked that the current user hasn't seen yet, weighted by the overlap strength.

### 5.0.2 Geolocation

**User Location**: Users have `locationLat`/`locationLng` columns with a `privacyRadiusKm` (default 25km) that fuzzes their reported location.

**Event Location**: Events have precise `locationLat`/`locationLng` coordinates.

**Distance Calculation**: Haversine formula computing great-circle distance in km. Results are bucketed into privacy-preserving ranges: "< 1 km", "< 5 km", "< 10 km", "< 25 km", "< 50 km", "< 100 km", "> 100 km".

**Geo Bonus in Event Scoring**: Proximity contributes 25% of the event hybrid score:
- < 5 km: 100 bonus
- < 15 km: 85 bonus
- < 30 km: 70 bonus
- < 50 km: 55 bonus
- < 100 km: 40 bonus
- > 100 km: 20 bonus

### 5.1 The Trait Space (Explainability Layer)

The trait-based scoring from `server/taste-engine.ts` is preserved as the explainability layer. It contains no machine learning models, neural networks, or external AI services. Instead, it implements a deterministic, geometric scoring system built on distance metrics in an 8-dimensional trait space.

### 5.1 The Trait Space

Every entity in the system (users, items, hobbies, events) is represented as a point in an 8-dimensional space:

| Axis | Label | Low End | High End |
|------|-------|---------|----------|
| novelty | Novelty Seeking | Prefers familiar | Craves the new |
| intensity | Intensity | Calm, gentle | Extreme, visceral |
| cozy | Cozy Preference | Doesn't need comfort | Warmth-seeking |
| strategy | Strategic Thinking | Intuitive | Analytical |
| social | Social Energy | Solitary | Highly social |
| creativity | Creative Spirit | Conventional | Deeply creative |
| nostalgia | Nostalgia Pull | Forward-looking | Past-oriented |
| adventure | Adventure Drive | Sedentary | Thrill-seeking |

Each axis ranges from 0.0 to 1.0, with 0.5 as the neutral baseline. This design choice avoids binary categorization; a user who scores 0.65 on `novelty` has a mild preference for new experiences, while 0.95 represents someone who actively seeks the unfamiliar.

### 5.2 Distance-Based Scoring (RMS Similarity)

The core scoring function computes the Root Mean Square (RMS) of trait differences between two vectors:

```typescript
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
```

**How this works step by step:**

1. For each of the 8 trait axes, compute the squared difference between the two vectors.
2. Take the mean of these squared differences.
3. Take the square root (this is the RMS distance).
4. Multiply by 1.4 to amplify differentiation. Without this scaling factor, most scores would cluster in the 70-90 range since 8 randomly distributed traits rarely produce large aggregate distances. The 1.4 multiplier stretches the distribution to produce a meaningful spread.
5. Convert to a similarity percentage: `similarity = 1 - rmsDiff * 1.4`.
6. Clamp to the range [15, 100] to avoid negative or implausibly low scores.

**Why RMS instead of Euclidean distance?** RMS normalizes by the number of dimensions, producing consistent scores regardless of how many trait axes exist. If the system later adds a 9th axis, existing scores remain comparable without recalibration.

**Why not cosine similarity?** Cosine similarity measures directional alignment, which is insensitive to magnitude. In this system, a user with all traits at 0.3 and a user with all traits at 0.8 would have perfect cosine similarity (parallel vectors) despite having fundamentally different taste profiles. RMS distance captures both direction and magnitude.

### 5.3 Match Color Classification

Scores are classified into three tiers:

```typescript
export function getMatchColor(score: number): "green" | "yellow" | "grey" {
  if (score >= 75) return "green";   // Strong match
  if (score >= 50) return "yellow";  // Moderate match
  return "grey";                     // Low compatibility
}
```

These thresholds were chosen to produce a realistic distribution: with 8 independently varying axes, most random pairs will score in the 40-60 range. Truly compatible profiles (green) represent genuine alignment across multiple dimensions.

### 5.4 Explainability: Match Explanations

For user-to-user matching, the system generates natural-language explanations:

1. Compute absolute differences for all 8 trait axes between the two users.
2. Sort by ascending difference (most similar first).
3. Take the 3 closest traits. For each, determine the average value and classify as "high" (>0.7), "moderate" (0.4-0.7), or "low" (<0.4).
4. Generate explanation strings: "Both have high creative spirit", "Both have moderate strategic thinking".
5. If the most divergent trait has a difference > 0.3, add a balancing explanation: "Different perspectives on intensity add balance".

This produces explanations like:
- "Both have high creative spirit"
- "Both have moderate adventure drive"
- "Both have low nostalgia pull"
- "Different perspectives on intensity add balance"

For item-to-user matching, the explanation identifies the single trait axis with the smallest difference: "Matches your novelty seeking preferences".

For hobby-to-user matching, the system identifies mutually high traits (both user and hobby > 0.6): "Aligns with your intensity and creative spirit tendencies".

### 5.5 Profile Construction from Onboarding

When a user completes onboarding, they select favorites across all five domains and answer trait-calibration questions. The profile builder uses a tag-based trait accumulation system:

1. **Tag-to-Trait Mapping**: A comprehensive lookup table maps content tags to trait contributions. For example:
   - Tag "sci-fi" contributes: `{ novelty: 0.8, creativity: 0.7, adventure: 0.6 }`
   - Tag "cozy" contributes: `{ cozy: 0.9, social: 0.4 }`
   - Tag "strategy" contributes: `{ strategy: 0.9 }`

   The map contains 80+ tag entries covering all five domains.

2. **Accumulation**: For each item the user selected during onboarding, look up its tags, resolve each tag to trait contributions, and push those values into per-axis accumulators.

3. **Averaging**: For each axis, compute the mean of all accumulated values. If no tags contributed to an axis, default to 0.5 (neutral).

4. **Blending with Quiz**: The quiz provides direct self-reported trait values. The final profile is a weighted blend:
   ```
   final_trait = tag_average * 0.6 + quiz_value * 0.4
   ```
   This gives 60% weight to behavioral signal (what they actually chose) and 40% to self-assessment (what they say about themselves).

5. **Cluster Generation**: From the final trait vector, the system assigns personality cluster labels. Single-axis clusters activate when a trait exceeds 0.65:
   - creativity > 0.65 -> "Creative Thinker"
   - adventure > 0.65 -> "Adventurer"
   - strategy > 0.65 -> "Strategic Mind"

   Combination clusters activate when two traits both exceed 0.6:
   - creativity > 0.6 AND novelty > 0.6 -> "Innovator"
   - cozy > 0.6 AND nostalgia > 0.6 -> "Comfort Classic"
   - intensity > 0.6 AND strategy > 0.6 -> "Tactical Gamer"
   - adventure > 0.6 AND social > 0.6 -> "Explorer"

   Clusters are deduplicated and capped at 5.

### 5.6 Uniform Scoring Across Domains

A critical design decision is that the same `computeDistanceScore` function is used for every scoring context:
- **Content recommendations**: Compare user's taste profile to item's trait vector
- **Social matching**: Compare two users' taste profiles
- **Hobby suggestions**: Compare user's profile to hobby's trait vector
- **Event relevance**: Compare user's profile to event's trait vector
- **Attendee compatibility at events**: Compare two RSVPed users' profiles

This uniformity means a user who scores 78% match with "Japanese Cuisine" and 78% match with another user has the same degree of alignment in both cases. The consistency is possible because items, hobbies, events, and users all exist in the same 8-dimensional space.

---

## 6. Storage Interface and Data Access

### 6.1 The IStorage Interface

All database access is mediated through the `IStorage` interface in `server/storage.ts`. This interface defines 22 methods covering:

- **User operations**: `getUser`, `getAllUsers`
- **Taste profile CRUD**: `getTasteProfile`, `upsertTasteProfile`, `getAllTasteProfiles`, `getUsersWithProfiles`
- **Item operations**: `getItemsByDomain`, `getItemById`, `getItemsByIds`, `createItem`, `getItemCount`
- **Interaction recording**: `createInteraction`, `getUserInteractions`
- **Hobby operations**: `getHobbies`, `createHobby`, `getHobbyCount`
- **Event operations**: `getEvents`, `getEventById`, `createEvent`, `getEventCount`
- **RSVP operations**: `createEventRsvp`, `getEventRsvps`, `getUserEventRsvps`, `deleteEventRsvp`, `hasUserRsvpd`

The `DatabaseStorage` class implements this interface using Drizzle ORM queries. API route handlers never execute raw SQL or interact with the `db` object directly; they always go through `storage.*` methods.

### 6.2 Key Query Patterns

**Upsert with conflict handling**: The taste profile upsert uses Drizzle's `.onConflictDoUpdate()` targeting the unique `userId` column. This allows the same code path to handle both first-time profile creation and subsequent updates.

**Filtered queries**: `getEvents(category?)` conditionally applies a `WHERE` clause only when a category filter is provided, returning all events otherwise. `getUserInteractions(userId, domain?)` follows the same optional-filter pattern.

**Batch retrieval**: `getItemsByIds(ids)` uses Drizzle's `inArray` operator to fetch multiple items in a single query, avoiding N+1 patterns when resolving items for a user's collection.

**Social matching query**: `getUsersWithProfiles(excludeUserId)` performs an `INNER JOIN` between `users` and `taste_profiles` with two conditions: exclude the requesting user, and only include profiles that have completed onboarding. This ensures social matches only include users with fully populated trait vectors.

---

## 7. API Routes

All routes except authentication endpoints are gated behind the `isAuthenticated` middleware. The route layer is deliberately thin; it handles request parsing, calls storage and taste engine functions, and formats responses.

### 7.1 Profile and Onboarding

**`POST /api/demo/bootstrap`**: Creates a pre-configured taste profile for the authenticated user using a hardcoded "Garv Puri" profile (novelty: 0.75, intensity: 0.65, cozy: 0.4, strategy: 0.7, social: 0.6, creativity: 0.8, nostalgia: 0.35, adventure: 0.85). Skips if the user already has a completed profile. This endpoint exists for demo/development purposes to bypass the onboarding flow.

**`GET /api/taste-profile`**: Returns the authenticated user's taste profile, or `null` if no profile exists.

**`POST /api/onboarding`**: Accepts `{ favorites: Record<string, string[]>, traits: Record<string, number> }`, computes the blended trait vector via `buildTraitsFromSelections`, generates cluster labels, and upserts the profile.

### 7.2 Recommendations

**`GET /api/recommendations/:domain`**: The recommendation pipeline:
1. Fetch the user's taste profile
2. Fetch all items in the requested domain
3. Fetch the user's past interactions in that domain
4. Filter out previously interacted items
5. For each remaining item, extract its trait vector, compute `computeItemMatchScore` against the user profile
6. Sort descending by score
7. Return the top 12

This is a content-based filtering approach. There is no collaborative filtering (no "users who liked X also liked Y"). The advantage is zero cold-start problem for items (every item has trait values at creation time) and explainability (every score is traceable to specific trait differences).

### 7.3 Interactions and Collection

**`POST /api/interactions`**: Records an interaction with an action-specific weight. The weight map is:
- `love`: 2.0 (strongest positive signal)
- `save`: 1.5 (intent to revisit)
- `like`: 1.0 (standard positive)
- `view`: 0.3 (passive engagement)
- `skip`: -0.5 (negative signal)

**`GET /api/interactions/collection`**: Aggregates a user's "liked", "loved", and "saved" interactions, resolves the associated items via a batch `getItemsByIds` call, and returns the joined result. Skips are excluded since they represent negative signals.

### 7.4 Social Matching

**`GET /api/social/matches`**: Computes compatibility scores between the authenticated user and all other users with completed profiles. For each pair:
1. Compute RMS distance score
2. Determine color tier
3. Generate explanation strings
4. Extract the other user's trait vector
5. Find shared clusters (intersection of `topClusters` arrays)

Results are sorted by descending score.

### 7.5 Events

**`GET /api/events?category=`**: Fetches events with optional category filter. For each event:
1. Compute taste-based match score against the user's profile
2. Fetch all RSVPs for that event
3. Resolve the first 10 RSVPed users to get their display information
4. Include `hasRsvpd` boolean and `rsvpCount`

Results are sorted by descending match score.

**`POST /api/events/:id/rsvp`**: Toggle RSVP. If the user has already RSVPed, delete the RSVP and return `{ rsvpd: false }`. Otherwise, create a new RSVP and return `{ rsvpd: true }`.

**`GET /api/events/:id/matches`**: For a specific event, find all other RSVPed users, compute pairwise compatibility with the requesting user, and return sorted matches. This reveals "who at this event shares your taste?" with contact information for real-world connection.

### 7.6 Hobby Exploration

**`GET /api/explore/hobbies`**: Scores all hobbies against the user's profile using `computeHobbyMatch`, which identifies mutually high traits (both > 0.6) to generate "why it fits" explanations. Results include a randomized `usersDoingIt` count (5-54) for social proof.

---

## 8. Database Seeding

The seed system (`server/seed.ts`) is idempotent and runs on every server startup. It populates four categories of data:

### 8.1 Content Items (60 items)
- **Movies** (16): From Interstellar to The Shawshank Redemption, each with hand-tuned trait vectors reflecting the film's character
- **Music** (16): Genre categories from Indie/Alternative to Punk/Ska
- **Games** (14): Genre categories from Open World RPGs to Party/Co-op
- **Food** (14): Cuisine categories from Japanese to Brunch & Breakfast

Each item's trait vector was manually calibrated to reflect the genuine experiential qualities of that content. For example, "Mad Max: Fury Road" has `traitIntensity: 0.95` and `traitCozy: 0.05`, while "Spirited Away" has `traitCreativity: 0.95` and `traitCozy: 0.7`.

### 8.2 Hobbies (16 entries)
From Go-Karting to Pottery & Ceramics, each with trait vectors reflecting the hobby's physical, social, and cognitive demands.

### 8.3 Seed Users (3 profiles)
Three fictional users with distinct taste profiles to demonstrate social matching:
- **Colin Weis**: Strategic Mind, Thrill Seeker (high intensity 0.85, high strategy 0.9)
- **Andy Chen**: Creative Thinker, Innovator (high novelty 0.8, high creativity 0.85)
- **Devon Leerssen**: Comfort Connoisseur, Social Butterfly (high cozy 0.85, high social 0.8)

These profiles are chosen to span different regions of the 8-dimensional space, producing diverse match scores against any real user.

### 8.4 Events (8 entries)
- **5 Organized**: Lakers vs Celtics, Kendrick Lamar concert, CS Club meetup, Spring Music Festival, Spring Hackathon
- **3 Custom**: Movie & Pizza Night (by Colin), Pickleball at the Rec (by Andy), Board Game Marathon (by Devon)

Custom events are linked to seed users via `creatorId`, making the social graph tangible.

### 8.5 Seeding Strategy
The seeder checks row counts before inserting. If the count is less than the expected seed count (indicating corrupted or partial data), it clears the table and re-inserts all rows. This ensures data integrity across server restarts without duplicating rows.

---

## 9. Frontend Architecture (Brief)

The frontend is a React SPA built with Vite, using TypeScript and Tailwind CSS. Key architectural choices:

- **Routing**: `wouter` (lightweight alternative to React Router)
- **Data Fetching**: `@tanstack/react-query` with a pre-configured default fetcher that makes GET requests to `/api/*` endpoints
- **Mutations**: `apiRequest` utility wrapping `fetch` for POST/PATCH/DELETE, with explicit cache invalidation via `queryClient.invalidateQueries()`
- **UI Components**: `shadcn/ui` (Radix-based component library)
- **Charts**: Custom SVG radar chart component for trait visualization

The frontend is organized around 5 pages mapped to bottom navigation tabs:
1. **My DNA** (`/`): Profile page with themed backgrounds, glassy sections, radar chart, collection
2. **For You** (`/recommendations`): TikTok-style vertical snap scrolling of recommendations with domain tabs
3. **Friends** (`/social`): Compatibility-sorted user cards with match explanations
4. **Events** (`/events`): Vertical snap scrolling event cards with category filter and RSVP
5. **Hobbies** (`/explore`): Hobby cards with match percentages and stock images

---

## 10. What the System Actually Does End-to-End

### 10.1 User Signup Through Profile Creation

1. User visits the application and sees a landing page.
2. User clicks "Log in with Replit," which initiates the OIDC flow.
3. After authenticating, the callback handler upserts the user into the `users` table and establishes a PostgreSQL-backed session.
4. The frontend checks for an existing taste profile. Finding none, it triggers the demo bootstrap endpoint, which creates a pre-configured Taste DNA.
5. The user now has an 8-dimensional trait vector and cluster labels stored in `taste_profiles`.

### 10.2 Receiving Recommendations

1. User navigates to For You and selects a domain (e.g., "movies").
2. Frontend queries `GET /api/recommendations/movies`.
3. Backend fetches all 16 movie items, filters out any the user has already interacted with, computes RMS distance for each remaining item against the user's profile, sorts by score, and returns the top 12.
4. Frontend renders items as full-screen snap-scrolling cards showing title, tags, match percentage, and explanation.
5. User swipes up to see the next item, or taps Like/Love/Save/Skip buttons.
6. Each interaction is POSTed to the backend with a weighted action, and the cache for that domain is invalidated so the interacted item disappears from the list.

### 10.3 Social Matching

1. User navigates to Friends.
2. Frontend queries `GET /api/social/matches`.
3. Backend fetches all other users with completed profiles, computes pairwise compatibility scores, generates explanations, and returns sorted results.
4. Frontend renders match cards showing name, avatar, percentage badge (color-coded green/yellow/grey), explanation bullets, cluster badges, and a radar chart overlay comparing both profiles.

### 10.4 Event Discovery and RSVPs

1. User navigates to Events.
2. Frontend queries `GET /api/events` (optionally with `?category=organized` or `?category=custom`).
3. Backend scores all events against the user's profile, fetches RSVP data and attendee info, and returns sorted results.
4. Frontend renders events as full-screen snap-scrolling cards with background images, match badges, location, date, tags, and attendee avatars.
5. User taps "I want to go" to RSVP. The button toggles between "I want to go" and "Going".
6. When RSVPed, the user can expand a "Matched Attendees" panel. The frontend queries `GET /api/events/:id/matches`, which computes compatibility between the user and every other RSVPed attendee, returning sorted results with contact info.
7. This enables real-world connections: "You and Andy (82% match) are both going to the hackathon. Here's their email."

### 10.5 Hobby Exploration

1. User navigates to Hobbies.
2. Frontend queries `GET /api/explore/hobbies`.
3. Backend scores all hobbies against the user's profile, generating "why it fits" explanations identifying shared high traits.
4. Frontend renders hobby cards with stock images, match percentages, tags, and explanations.

### 10.6 Profile and Collection

1. User navigates to My DNA.
2. Frontend fetches taste profile, top recommendations across domains, hobbies, and the user's collection.
3. The profile page renders a full-screen themed background (Oceanic, Aurora, or Ember), a cover banner with the theme image, avatar, name, cluster badges, and a series of glassy translucent sections:
   - Top 3 Traits: The three highest-scoring trait axes with bar visualization
   - myDNA Top 3: Top movie/music/game recommendation for the user
   - My Collection: Items the user has liked/loved/saved from For You, organized by action type with domain icons
   - Taste DNA Radar: Full 8-axis SVG radar chart with bar breakdown
   - Gallery: Hobby images and tags from the explore page

---

## 11. AI/ML Architecture Summary

The system implements a hybrid intelligence architecture:

- **Neural Embeddings**: OpenAI `text-embedding-3-small` generates 1536-dimensional vector representations for all entities. Stored via pgvector with HNSW indexes for fast KNN search.

- **Collaborative Filtering**: SQL-based user-item co-occurrence analysis finds users with overlapping tastes and surfaces items they enjoyed.

- **Trait Algebra**: 8-dimensional geometric scoring preserved as the explainability layer, providing human-readable reasons for every recommendation.

- **Geolocation-Aware Events**: Haversine distance calculation with privacy-preserving distance buckets and proximity bonuses in event scoring.

- **Graceful Degradation**: When embeddings are unavailable (API quota, new items), the system transparently falls back to trait-only scoring with no user-visible errors.

- **No real-time updates or WebSockets.** The system uses standard HTTP request-response with cache invalidation via React Query.

- **Async embedding updates**: User taste embeddings are regenerated asynchronously after positive interactions, using fire-and-forget background processing.

The system demonstrates that combining neural embeddings for semantic understanding with geometric trait algebra for explainability produces recommendations that are both accurate and transparent.
