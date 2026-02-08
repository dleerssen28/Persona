# Persona

## Overview
Persona is a taste intelligence platform that builds a "Taste DNA" for every user across movies, music, games, food, and hobbies. It uses this understanding to match users with compatible people, recommend content, and discover new hobbies - all with explainable "why" reasoning.

## Tech Stack
- **Frontend**: React + TypeScript + Vite + Tailwind CSS + shadcn/ui
- **Backend**: Node.js + Express
- **Database**: PostgreSQL with Drizzle ORM + pgvector extension
- **AI/ML**: OpenAI text-embedding-3-small (1536-dim vectors), pgvector HNSW indexes
- **Auth**: Replit Auth (OpenID Connect)
- **Routing**: wouter (frontend), Express (backend)

## Architecture

### Navigation
- Bottom navigation bar (mobile-style) with 4 tabs: My DNA, For You, Events, Friends
- No sidebar - uses `BottomNav` component fixed at bottom of screen

### Pages
- `/` - Landing page (unauthenticated) / Profile page (authenticated)
- `/recommendations` - Content recommendations across 5 domains
- `/events` - Event discovery with geolocation-aware scoring
- `/social` - Social matching with compatibility scores

### Profile Page (redesigned)
- Full-screen themed background (Oceanic, Aurora, Ember, or custom image)
- Cover banner uses theme image with gradient overlay
- Avatar + name + cluster badges
- Settings menu (gear icon, top-right) with:
  - Theme switcher (3 presets + custom image upload)
  - Edit Layout toggle (section reordering)
- Glassy see-through sections with backdrop-blur-xl:
  - Top 3 Traits: highest scoring personality traits
  - myDNA Top 3: top movie/music/game matches
  - Taste DNA Radar: full radar chart + bar breakdown
  - Gallery (Hobby Tags): combined hobby images + vertical reel cards with tags
- Theme images stored in `client/src/assets/images/theme-*.png`

### API Endpoints
- `GET /api/auth/user` - Current authenticated user
- `GET /api/taste-profile` - User's taste profile
- `POST /api/onboarding` - Complete onboarding with favorites + trait quiz
- `GET /api/recommendations/:domain` - Get recommendations for a domain
- `POST /api/interactions` - Record user interaction (like/love/skip/save)
- `GET /api/social/matches` - Get matched users with scores
- `GET /api/explore/hobbies` - Get hobby recommendations
- `POST /api/demo/bootstrap` - Auto-create demo profile for authenticated user
- `GET /api/debug/embedding-health` - Dashboard: embedding coverage, scoring mode status
- `POST /api/admin/backfill-embeddings` - Generate missing embeddings + recompute user profiles

### Hybrid AI/ML Engine (Embeddings-First)
- **Embeddings-First Architecture**: ML drives ranking; traits only explain. Fallback to traits only if embeddings missing.
- **Vector Similarity (55%)**: Neural embeddings via OpenAI text-embedding-3-small, cosine similarity scoring
- **Collaborative Filtering (25%)**: Embedding-based neighbor discovery (top 20 users by tasteEmbedding cosine similarity), weighted action aggregation (love 2.0, save 1.5, like 1.0, view 0.3, skip -0.5), communityPicks with explanations
- **Trait Explainability (20%)**: 8-axis trait algebra for human-readable "why" explanations only
- **Scoring Methods**: `embedding` (vector-only), `hybrid` (vector+CF+traits), `trait_fallback` (no embeddings)
- **fallbackReason**: `missing_user_embedding`, `missing_item_embedding`, `missing_both_embeddings`, `invalid_embedding_dim`
- Geolocation-aware event scoring with Haversine distance + privacy radius
- User taste embeddings recomputed synchronously on every interaction and onboarding (deterministic, not fire-and-forget)
- Startup warning logged if any items/events/hobbies missing embeddings

### Taste Engine (Explainability Layer)
- Trait-based similarity scoring across 8 axes: novelty, intensity, cozy, strategy, social, creativity, nostalgia, adventure
- Tag-to-trait mapping for building user profiles from preferences
- Distance-based RMS scoring for realistic match distribution (green 75+, yellow 50-74, red <50)
- Explainable matching with "why you match" insights
- Cluster generation (Creative Thinker, Adventurer, etc.)

### Key Components
- `RadarChart` - SVG radar visualization of taste traits
- `MatchPill` - Color-coded match score badge (green/yellow/red)
- `MatchGlow` - Glow effect wrapper based on match score
- `BottomNav` - Fixed bottom navigation with 4 tabs
- `hobby-images.ts` - Mapping of hobby names to stock images

### Stock Images
- 16 hobby images stored in `client/src/assets/images/`
- Profile cover image at `client/src/assets/images/profile-cover.jpg`
- Imported via `@/assets/images/` alias
- Used in explore page hobby cards, profile personal images, and reels sections

### Database Tables
- `users` - Auth users (managed by Replit Auth) + locationLat/locationLng/privacyRadiusKm
- `sessions` - Session storage (managed by Replit Auth)
- `taste_profiles` - User taste DNA with 8 trait axes + clusters + embedding vector(1536)
- `items` - Content items across 5 domains with trait values + embedding vector(1536)
- `interactions` - User interactions with items (like/love/skip/save)
- `matches` - Cached match computations
- `hobbies` - Hobby entries with trait values + embedding vector(1536)
- `events` - Events with trait values + embedding vector(1536) + locationLat/locationLng
- `event_rsvps` - RSVP records linking users to events

### Key Backend Files
- `server/hybrid-engine.ts` - Embeddings-first scoring: vector sim + CF + traits (explainability only)
- `server/collaborative-filtering.ts` - Embedding-based neighbor CF with weighted action aggregation
- `server/embeddings.ts` - OpenAI embeddings, recomputeTasteEmbedding (synchronous), checkEmbeddingHealth
- `server/taste-engine.ts` - 8-axis trait algebra (explainability layer only)
- `server/seed.ts` - Database seeding with embedding pipeline + startup health warning
- `server/routes.ts` - Express API routes including debug/health and admin/backfill endpoints

## User Preferences
- Dark mode by default
- Green accent color scheme (primary: hsl(142, 76%, 36%))
- Mobile-first bottom navigation design
- Modular/customizable profile layout
