# Persona

## Overview
Persona is an AI-powered campus clubs discovery platform for TAMU that builds a "Taste DNA" for every student across 5 domains: academic, professional, social, sports, and volunteering. It uses local transformer embeddings (all-MiniLM-L6-v2, 384-dim) to match students to clubs, recommend clubs, and discover club events - all with explainable "why" reasoning.

## Tech Stack
- **Frontend**: React + TypeScript + Vite + Tailwind CSS + shadcn/ui
- **Backend**: Node.js + Express
- **Database**: PostgreSQL with Drizzle ORM + pgvector extension
- **AI/ML**: Local all-MiniLM-L6-v2 via @xenova/transformers (384-dim vectors), pgvector indexes, no external API dependencies
- **Auth**: Replit Auth (OpenID Connect)
- **Routing**: wouter (frontend), Express (backend)

## Architecture

### Navigation
- Bottom navigation bar (mobile-style) with 4 tabs: My DNA, Clubs, Events, Friends
- No sidebar - uses `BottomNav` component fixed at bottom of screen

### Pages
- `/` - Landing page (unauthenticated) / Profile page (authenticated)
- `/recommendations` - Club recommendations across 5 campus domains
- `/events` - Event discovery with persona+social+urgency scoring
- `/social` - Social matching with compatibility scores

### Domains (Campus)
- `academic` - Academic clubs (IEEE, Coding Club, AI/ML, Research, etc.)
- `professional` - Professional development (Consulting, Entrepreneurship, Finance, etc.)
- `social` - Social/cultural clubs (Film, Gaming, Korean SA, Dance, etc.)
- `sports` - Club sports (Soccer, Climbing, Basketball, Pickleball, etc.)
- `volunteering` - Service organizations (Habitat, Big Event, Camp Kesem, etc.)

### Profile Page (redesigned)
- Full-screen themed background (Oceanic, Aurora, Ember, or custom image)
- Cover banner uses theme image with gradient overlay
- Avatar + name + cluster badges
- Settings menu (gear icon, top-right) with:
  - Theme switcher (3 presets + custom image upload)
  - Edit Layout toggle (section reordering)
- Glassy see-through sections with backdrop-blur-xl:
  - Top 3 Traits: highest scoring personality traits
  - myDNA Top 3: top club matches
  - Taste DNA Radar: full radar chart + bar breakdown
  - Gallery (Hobby Tags): combined hobby images + vertical reel cards with tags
- Theme images stored in `client/src/assets/images/theme-*.png`

### API Endpoints
- `GET /api/auth/user` - Current authenticated user
- `GET /api/taste-profile` - User's taste profile
- `POST /api/onboarding` - Complete onboarding with favorites + trait quiz
- `GET /api/recommendations/:domain` - Get club recommendations for a domain (academic/professional/social/sports/volunteering)
- `POST /api/interactions` - Record user interaction (like/love/skip/save)
- `GET /api/social/matches` - Get matched users with scores
- `GET /api/explore/hobbies` - Get hobby recommendations
- `GET /api/events/for-you` - Personalized events: finalScore = 0.45*personaScore + 0.30*socialScore + 0.25*urgencyScore
- `POST /api/demo/bootstrap` - Auto-create demo profile for authenticated user
- `POST /api/demo/reset` - Reset demo state (dev-only auth bypass)
- `GET /api/demo/story` - Demo script with talking points
- `GET /api/debug/ai-status` - AI readiness check
- `GET /api/debug/embedding-health` - Dashboard: embedding coverage, scoring mode status
- `GET /api/debug/embedding-similarity-sanity` - Per-domain cosine similarity proof
- `GET /api/debug/match-proof/:userId` - Cold-start matching proof
- `POST /api/admin/backfill-embeddings` - Generate missing embeddings + recompute user profiles

### Hybrid AI/ML Engine (Embeddings-First)
- **Embeddings-First Architecture**: ML drives ranking; traits only explain. Fallback to traits only if embeddings missing.
- **Vector Similarity (55%)**: Local neural embeddings via @xenova/transformers all-MiniLM-L6-v2 (384-dim, 100% reliable, no external API), cosine similarity scoring
- **Collaborative Filtering (25%)**: Embedding-based neighbor discovery (top 20 users by tasteEmbedding cosine similarity), weighted action aggregation (love 2.0, save 1.5, like 1.0, view 0.3, skip -0.5), communityPicks with explanations
- **Trait Explainability (20%)**: 8-axis trait algebra for human-readable "why" explanations only
- **Scoring Methods**: `embedding` (vector-only), `hybrid` (vector+CF+traits), `trait_fallback` (no embeddings)
- **fallbackReason**: `missing_user_embedding`, `missing_item_embedding`, `missing_both_embeddings`, `invalid_embedding_dim`
- Geolocation-aware event scoring with Haversine distance + privacy radius (TAMU coords: 30.6187, -96.3365)
- User taste embeddings recomputed synchronously on every interaction and onboarding (deterministic, not fire-and-forget)
- Startup warning logged if any items/events/hobbies missing embeddings

### Urgency Scoring
- Events include urgencyScore (0-100), urgencyLabel, and deadline fields
- Computed from signupDeadline, duesDeadline, and dateTime
- Labels: "last chance" (24h), "closing soon" (48h), "this week" (72h), "upcoming" (7d), "next week" (14d), "plenty of time"

### Event Scoring (Events Tab)
- **finalScore** = 0.45 * personaScore + 0.30 * socialScore + 0.25 * urgencyScore
- **personaScore**: Embedding cosine similarity between user taste profile and event embedding
- **socialScore**: (avgSimilarity * 0.5 + friendBonus + attendeeBonus), capped at 100, min 15
- **urgencyScore**: Time-based urgency (100 for <24h, descending)
- Events include mutualFriendsGoingCount, mutualFriendsPreview (top 3), attendeePreview, whyRecommended
- "Mutuals" are attendees with >65% embedding match to the current user
- whyRecommended combines friends going + persona alignment + urgency + deal status

### Event Categories
- `parties` - Nightlife, bars, social gatherings (pink badges)
- `deals` - Food deals, student discounts, BOGO offers (emerald badges)
- `campus` - Campus events, tailgates, watch parties, pop-ups (blue badges)
- `study` - Study groups, exam prep, academic meetups (amber badges)
- `shows` - Concerts, open mics, vinyl markets, live music (purple badges)
- `misc` - Farmers markets, festivals, charity runs, art walks (teal badges)

### Event Data Model (New Fields)
- `dealExpiresAt` (timestamp) - When a deal/promo expires
- `priceInfo` (text) - Human-readable price/deal details
- `isDeal` (boolean) - Whether event has a deal/promotion
- `organizerName` (text) - Event organizer name (separate from clubName)

### Taste Engine (Explainability Layer)
- Trait-based similarity scoring across 8 axes: novelty, intensity, cozy, strategy, social, creativity, nostalgia, adventure
- Tag-to-trait mapping for building user profiles from preferences
- Distance-based RMS scoring for realistic match distribution (green 75+, yellow 50-74, red <50)
- Explainable matching with "why you match" insights
- Cluster generation (Engineering Leader, Creative Builder, Service Leader, etc.)

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
- `taste_profiles` - User taste DNA with 8 trait axes + clusters + embedding vector(384)
- `items` - Campus clubs across 5 domains with trait values + embedding vector(384)
- `interactions` - User interactions with items (like/love/skip/save)
- `matches` - Cached match computations
- `hobbies` - Campus hobby entries with trait values + embedding vector(384)
- `events` - Lifestyle events with trait values + embedding vector(384) + locationLat/locationLng + dealExpiresAt/priceInfo/isDeal/organizerName + categories: parties/deals/campus/study/shows/misc
- `event_rsvps` - RSVP records linking users to events

### Key Backend Files
- `server/hybrid-engine.ts` - Embeddings-first scoring: vector sim + CF + traits (explainability only)
- `server/collaborative-filtering.ts` - Embedding-based neighbor CF with weighted action aggregation
- `server/embeddings.ts` - Local @xenova/transformers embeddings (all-MiniLM-L6-v2, 384-dim), recomputeTasteEmbedding (synchronous), checkEmbeddingHealth
- `server/taste-engine.ts` - 8-axis trait algebra (explainability layer only)
- `server/seed.ts` - 50 TAMU campus clubs + 24 events + 16 hobbies with embedding pipeline
- `server/routes.ts` - Express API routes including debug/health, demo/reset, and admin/backfill endpoints

### Seed Data
- 50 campus clubs: 10 per domain (academic, professional, social, sports, volunteering)
- 24 lifestyle events (parties, deals, study groups, concerts, campus events, misc) within 14-day rolling window
- 16 campus-specific hobbies (intramural sports, hackathon building, tailgating, etc.)
- 3 seed users: Colin (Engineering Leader), Andy (Creative Builder), Devon (Service Leader)
- Demo user profile: Tech Innovator / Hackathon Builder / Research Explorer

## User Preferences
- Dark mode by default
- Green accent color scheme (primary: hsl(142, 76%, 36%))
- Mobile-first bottom navigation design
- Modular/customizable profile layout
