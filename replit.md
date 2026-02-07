# Persona

## Overview
Persona is a taste intelligence platform that builds a "Taste DNA" for every user across movies, music, games, food, and hobbies. It uses this understanding to match users with compatible people, recommend content, and discover new hobbies - all with explainable "why" reasoning.

## Tech Stack
- **Frontend**: React + TypeScript + Vite + Tailwind CSS + shadcn/ui
- **Backend**: Node.js + Express
- **Database**: PostgreSQL with Drizzle ORM
- **Auth**: Replit Auth (OpenID Connect)
- **Routing**: wouter (frontend), Express (backend)

## Architecture

### Navigation
- Bottom navigation bar (mobile-style) with 4 tabs: My DNA, For You, Friends, Hobbies
- No sidebar - uses `BottomNav` component fixed at bottom of screen

### Pages
- `/` - Landing page (unauthenticated) / Profile page (authenticated)
- `/recommendations` - Content recommendations across 5 domains
- `/social` - Social matching with compatibility scores
- `/explore` - Hobby discovery with match percentages and stock images

### Profile Page (redesigned)
- Cover banner image at top
- Avatar + name + cluster badges
- Modular reorderable sections with edit mode:
  - Top 3 Traits: highest scoring personality traits
  - myDNA Top 3: top movie/music/game matches
  - Taste DNA Radar: full radar chart + bar breakdown
  - Personal Images: hobby images from top matches
  - Reels & Hobby Tags: vertical hobby cards with colored tags
- Edit Layout button toggles section reordering UI

### API Endpoints
- `GET /api/auth/user` - Current authenticated user
- `GET /api/taste-profile` - User's taste profile
- `POST /api/onboarding` - Complete onboarding with favorites + trait quiz
- `GET /api/recommendations/:domain` - Get recommendations for a domain
- `POST /api/interactions` - Record user interaction (like/love/skip/save)
- `GET /api/social/matches` - Get matched users with scores
- `GET /api/explore/hobbies` - Get hobby recommendations
- `POST /api/demo/bootstrap` - Auto-create demo profile for authenticated user

### Taste Engine
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
- `users` - Auth users (managed by Replit Auth)
- `sessions` - Session storage (managed by Replit Auth)
- `taste_profiles` - User taste DNA with 8 trait axes + clusters
- `items` - Content items across 5 domains with trait values
- `interactions` - User interactions with items (like/love/skip/save)
- `matches` - Cached match computations
- `hobbies` - Hobby entries with trait values and descriptions

## User Preferences
- Dark mode by default
- Green accent color scheme (primary: hsl(142, 76%, 36%))
- Mobile-first bottom navigation design
- Modular/customizable profile layout
