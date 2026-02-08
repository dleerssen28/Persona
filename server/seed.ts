import { storage } from "./storage";
import { db, pool } from "./db";
import { users } from "@shared/models/auth";
import type { InsertItem, InsertHobby, InsertTasteProfile, InsertEvent } from "@shared/schema";
import type { UpsertUser } from "@shared/models/auth";
import { eq, sql } from "drizzle-orm";
import { items, hobbies, events } from "@shared/schema";
import { buildEmbeddingText, generateBatchEmbeddings, generateEmbedding, storeEmbedding, computeWeightedAverageEmbedding } from "./embeddings";

const SEED_USERS: { user: UpsertUser; profile: InsertTasteProfile }[] = [
  {
    user: { id: "seed-colin", email: "colin.weis@personagraph.io", firstName: "Colin", lastName: "Weis", profileImageUrl: null },
    profile: {
      userId: "seed-colin",
      traitNovelty: 0.45, traitIntensity: 0.85, traitCozy: 0.3,
      traitStrategy: 0.9, traitSocial: 0.55, traitCreativity: 0.4,
      traitNostalgia: 0.25, traitAdventure: 0.75,
      topClusters: ["Strategic Mind", "Thrill Seeker", "Tactical Gamer"],
      onboardingComplete: true,
    },
  },
  {
    user: { id: "seed-andy", email: "andy.chen@personagraph.io", firstName: "Andy", lastName: "Chen", profileImageUrl: null },
    profile: {
      userId: "seed-andy",
      traitNovelty: 0.8, traitIntensity: 0.5, traitCozy: 0.55,
      traitStrategy: 0.65, traitSocial: 0.7, traitCreativity: 0.85,
      traitNostalgia: 0.45, traitAdventure: 0.7,
      topClusters: ["Creative Thinker", "Innovator", "Explorer"],
      onboardingComplete: true,
    },
  },
  {
    user: { id: "seed-devon", email: "devon.leerssen@personagraph.io", firstName: "Devon", lastName: "Leerssen", profileImageUrl: null },
    profile: {
      userId: "seed-devon",
      traitNovelty: 0.35, traitIntensity: 0.3, traitCozy: 0.85,
      traitStrategy: 0.4, traitSocial: 0.8, traitCreativity: 0.6,
      traitNostalgia: 0.75, traitAdventure: 0.3,
      topClusters: ["Comfort Connoisseur", "Social Butterfly", "Nostalgia Lover"],
      onboardingComplete: true,
    },
  },
];

const GARV_PROFILE: Omit<InsertTasteProfile, "userId"> = {
  traitNovelty: 0.75, traitIntensity: 0.65, traitCozy: 0.4,
  traitStrategy: 0.7, traitSocial: 0.6, traitCreativity: 0.8,
  traitNostalgia: 0.35, traitAdventure: 0.85,
  topClusters: ["Adventurer", "Creative Thinker", "Innovator", "Strategic Mind"],
  onboardingComplete: true,
};

export { GARV_PROFILE };

const SEED_ITEMS: InsertItem[] = [
  // === MOVIES (16 items) ===
  { domain: "movies", title: "Interstellar", tags: ["sci-fi", "space", "emotional"], description: "A team of explorers travel through a wormhole in space to ensure humanity's survival.", popularity: 1240, traitNovelty: 0.85, traitIntensity: 0.7, traitCozy: 0.3, traitStrategy: 0.6, traitSocial: 0.4, traitCreativity: 0.8, traitNostalgia: 0.4, traitAdventure: 0.9 },
  { domain: "movies", title: "The Dark Knight", tags: ["action", "thriller", "dark"], description: "Batman faces the Joker in a battle for Gotham's soul.", popularity: 1180, traitNovelty: 0.6, traitIntensity: 0.9, traitCozy: 0.1, traitStrategy: 0.7, traitSocial: 0.4, traitCreativity: 0.5, traitNostalgia: 0.3, traitAdventure: 0.7 },
  { domain: "movies", title: "Spirited Away", tags: ["anime", "fantasy", "magical"], description: "A girl enters a world of spirits and must find her way home.", popularity: 980, traitNovelty: 0.8, traitIntensity: 0.4, traitCozy: 0.7, traitStrategy: 0.3, traitSocial: 0.4, traitCreativity: 0.95, traitNostalgia: 0.7, traitAdventure: 0.7 },
  { domain: "movies", title: "Inception", tags: ["sci-fi", "thriller", "mind-bending"], description: "A thief who steals secrets through dream-sharing technology.", popularity: 1100, traitNovelty: 0.9, traitIntensity: 0.8, traitCozy: 0.2, traitStrategy: 0.85, traitSocial: 0.3, traitCreativity: 0.8, traitNostalgia: 0.2, traitAdventure: 0.7 },
  { domain: "movies", title: "The Grand Budapest Hotel", tags: ["comedy", "quirky", "artistic"], description: "The adventures of a legendary concierge at a famous European hotel.", popularity: 720, traitNovelty: 0.7, traitIntensity: 0.3, traitCozy: 0.6, traitStrategy: 0.4, traitSocial: 0.6, traitCreativity: 0.95, traitNostalgia: 0.8, traitAdventure: 0.5 },
  { domain: "movies", title: "Parasite", tags: ["thriller", "social", "dark-comedy"], description: "A poor family schemes to infiltrate a wealthy household.", popularity: 950, traitNovelty: 0.8, traitIntensity: 0.7, traitCozy: 0.2, traitStrategy: 0.8, traitSocial: 0.7, traitCreativity: 0.7, traitNostalgia: 0.3, traitAdventure: 0.4 },
  { domain: "movies", title: "Lord of the Rings", tags: ["fantasy", "epic", "adventure"], description: "A hobbit embarks on a perilous quest to destroy a powerful ring.", popularity: 1300, traitNovelty: 0.5, traitIntensity: 0.8, traitCozy: 0.4, traitStrategy: 0.5, traitSocial: 0.6, traitCreativity: 0.7, traitNostalgia: 0.7, traitAdventure: 0.95 },
  { domain: "movies", title: "Pulp Fiction", tags: ["crime", "dialogue", "nonlinear"], description: "Interconnected stories of crime in Los Angeles.", popularity: 890, traitNovelty: 0.8, traitIntensity: 0.7, traitCozy: 0.2, traitStrategy: 0.5, traitSocial: 0.5, traitCreativity: 0.85, traitNostalgia: 0.5, traitAdventure: 0.4 },
  { domain: "movies", title: "The Matrix", tags: ["sci-fi", "action", "philosophical"], description: "A hacker discovers reality is a simulation controlled by machines.", popularity: 1150, traitNovelty: 0.9, traitIntensity: 0.85, traitCozy: 0.1, traitStrategy: 0.7, traitSocial: 0.3, traitCreativity: 0.8, traitNostalgia: 0.4, traitAdventure: 0.8 },
  { domain: "movies", title: "Up", tags: ["animation", "emotional", "adventure"], description: "An elderly man ties thousands of balloons to his house to fly to South America.", popularity: 1050, traitNovelty: 0.6, traitIntensity: 0.4, traitCozy: 0.8, traitStrategy: 0.3, traitSocial: 0.5, traitCreativity: 0.7, traitNostalgia: 0.9, traitAdventure: 0.8 },
  { domain: "movies", title: "Mad Max: Fury Road", tags: ["action", "post-apocalyptic", "intense"], description: "A woman rebels against a tyrannical ruler in a post-apocalyptic wasteland.", popularity: 920, traitNovelty: 0.7, traitIntensity: 0.95, traitCozy: 0.05, traitStrategy: 0.4, traitSocial: 0.3, traitCreativity: 0.6, traitNostalgia: 0.2, traitAdventure: 0.9 },
  { domain: "movies", title: "La La Land", tags: ["musical", "romantic", "artistic"], description: "An aspiring actress and a jazz musician fall in love in Los Angeles.", popularity: 870, traitNovelty: 0.5, traitIntensity: 0.3, traitCozy: 0.7, traitStrategy: 0.2, traitSocial: 0.6, traitCreativity: 0.9, traitNostalgia: 0.7, traitAdventure: 0.4 },
  { domain: "movies", title: "Avengers: Endgame", tags: ["superhero", "action", "epic"], description: "The Avengers assemble for one final battle against Thanos.", popularity: 1400, traitNovelty: 0.4, traitIntensity: 0.85, traitCozy: 0.3, traitStrategy: 0.6, traitSocial: 0.7, traitCreativity: 0.5, traitNostalgia: 0.6, traitAdventure: 0.85 },
  { domain: "movies", title: "Blade Runner 2049", tags: ["sci-fi", "noir", "philosophical"], description: "A new blade runner uncovers a secret that could plunge society into chaos.", popularity: 750, traitNovelty: 0.9, traitIntensity: 0.6, traitCozy: 0.2, traitStrategy: 0.7, traitSocial: 0.2, traitCreativity: 0.85, traitNostalgia: 0.5, traitAdventure: 0.6 },
  { domain: "movies", title: "Everything Everywhere All at Once", tags: ["sci-fi", "comedy", "emotional"], description: "A Chinese-American woman discovers she can access the skills of alternate selves.", popularity: 1000, traitNovelty: 0.95, traitIntensity: 0.7, traitCozy: 0.4, traitStrategy: 0.5, traitSocial: 0.6, traitCreativity: 0.95, traitNostalgia: 0.4, traitAdventure: 0.7 },
  { domain: "movies", title: "The Shawshank Redemption", tags: ["drama", "emotional", "classic"], description: "Two imprisoned men bond over a number of years, finding solace through acts of decency.", popularity: 1350, traitNovelty: 0.4, traitIntensity: 0.5, traitCozy: 0.5, traitStrategy: 0.6, traitSocial: 0.6, traitCreativity: 0.5, traitNostalgia: 0.8, traitAdventure: 0.3 },

  // === MUSIC (16 items) ===
  { domain: "music", title: "Indie / Alternative", tags: ["indie", "creative", "mellow"], description: "Independent music with creative expression and distinctive sounds.", popularity: 800, traitNovelty: 0.8, traitIntensity: 0.3, traitCozy: 0.5, traitStrategy: 0.3, traitSocial: 0.4, traitCreativity: 0.9, traitNostalgia: 0.4, traitAdventure: 0.5 },
  { domain: "music", title: "Electronic / EDM", tags: ["electronic", "energy", "beats"], description: "Electronic dance music with synthesized sounds and driving rhythms.", popularity: 950, traitNovelty: 0.7, traitIntensity: 0.8, traitCozy: 0.2, traitStrategy: 0.3, traitSocial: 0.7, traitCreativity: 0.6, traitNostalgia: 0.2, traitAdventure: 0.6 },
  { domain: "music", title: "Classical / Orchestral", tags: ["classical", "elegant", "complex"], description: "Orchestral compositions from the greatest composers in history.", popularity: 500, traitNovelty: 0.4, traitIntensity: 0.5, traitCozy: 0.6, traitStrategy: 0.7, traitSocial: 0.3, traitCreativity: 0.8, traitNostalgia: 0.8, traitAdventure: 0.3 },
  { domain: "music", title: "Jazz / Blues", tags: ["jazz", "soulful", "improvisation"], description: "Improvised melodies with deep emotional expression.", popularity: 550, traitNovelty: 0.7, traitIntensity: 0.4, traitCozy: 0.6, traitStrategy: 0.4, traitSocial: 0.6, traitCreativity: 0.9, traitNostalgia: 0.7, traitAdventure: 0.4 },
  { domain: "music", title: "Lo-fi / Ambient", tags: ["lofi", "chill", "atmospheric"], description: "Relaxing beats and ambient soundscapes for focus and calm.", popularity: 750, traitNovelty: 0.5, traitIntensity: 0.1, traitCozy: 0.9, traitStrategy: 0.3, traitSocial: 0.2, traitCreativity: 0.6, traitNostalgia: 0.5, traitAdventure: 0.2 },
  { domain: "music", title: "Hip Hop / Rap", tags: ["hip-hop", "rhythm", "lyrical"], description: "Rhythmic vocal delivery over beats with storytelling and wordplay.", popularity: 1100, traitNovelty: 0.5, traitIntensity: 0.6, traitCozy: 0.3, traitStrategy: 0.4, traitSocial: 0.7, traitCreativity: 0.7, traitNostalgia: 0.3, traitAdventure: 0.5 },
  { domain: "music", title: "Rock / Metal", tags: ["rock", "intense", "guitar"], description: "Guitar-driven music ranging from classic rock to heavy metal.", popularity: 900, traitNovelty: 0.4, traitIntensity: 0.85, traitCozy: 0.2, traitStrategy: 0.3, traitSocial: 0.5, traitCreativity: 0.5, traitNostalgia: 0.6, traitAdventure: 0.5 },
  { domain: "music", title: "Pop / Top 40", tags: ["pop", "catchy", "mainstream"], description: "Popular music with catchy hooks and wide appeal.", popularity: 1200, traitNovelty: 0.3, traitIntensity: 0.4, traitCozy: 0.5, traitStrategy: 0.2, traitSocial: 0.8, traitCreativity: 0.4, traitNostalgia: 0.4, traitAdventure: 0.3 },
  { domain: "music", title: "R&B / Soul", tags: ["rnb", "smooth", "emotional"], description: "Smooth rhythms with emotional vocal performances and groove.", popularity: 850, traitNovelty: 0.4, traitIntensity: 0.4, traitCozy: 0.6, traitStrategy: 0.3, traitSocial: 0.6, traitCreativity: 0.6, traitNostalgia: 0.5, traitAdventure: 0.3 },
  { domain: "music", title: "K-Pop", tags: ["kpop", "energetic", "visual"], description: "High-energy Korean pop with synchronized choreography and stunning visuals.", popularity: 1050, traitNovelty: 0.6, traitIntensity: 0.6, traitCozy: 0.3, traitStrategy: 0.3, traitSocial: 0.9, traitCreativity: 0.7, traitNostalgia: 0.2, traitAdventure: 0.5 },
  { domain: "music", title: "Country / Folk", tags: ["country", "storytelling", "acoustic"], description: "Storytelling through acoustic instrumentation and heartfelt lyrics.", popularity: 700, traitNovelty: 0.3, traitIntensity: 0.3, traitCozy: 0.7, traitStrategy: 0.2, traitSocial: 0.5, traitCreativity: 0.5, traitNostalgia: 0.8, traitAdventure: 0.4 },
  { domain: "music", title: "Reggae / Dancehall", tags: ["reggae", "chill", "groove"], description: "Laid-back Caribbean rhythms with a positive and social vibe.", popularity: 600, traitNovelty: 0.4, traitIntensity: 0.3, traitCozy: 0.7, traitStrategy: 0.2, traitSocial: 0.7, traitCreativity: 0.5, traitNostalgia: 0.5, traitAdventure: 0.4 },
  { domain: "music", title: "Synthwave / Retrowave", tags: ["electronic", "nostalgic", "cinematic"], description: "Retro-futuristic electronic music inspired by 80s sounds and aesthetics.", popularity: 650, traitNovelty: 0.6, traitIntensity: 0.5, traitCozy: 0.4, traitStrategy: 0.3, traitSocial: 0.3, traitCreativity: 0.7, traitNostalgia: 0.9, traitAdventure: 0.5 },
  { domain: "music", title: "Latin / Reggaeton", tags: ["latin", "energetic", "social"], description: "High-energy Latin beats perfect for dancing and celebration.", popularity: 1000, traitNovelty: 0.4, traitIntensity: 0.7, traitCozy: 0.3, traitStrategy: 0.2, traitSocial: 0.9, traitCreativity: 0.5, traitNostalgia: 0.3, traitAdventure: 0.6 },
  { domain: "music", title: "Film Scores / Soundtracks", tags: ["cinematic", "orchestral", "emotional"], description: "Orchestral and electronic compositions from films and TV that evoke powerful emotions.", popularity: 680, traitNovelty: 0.5, traitIntensity: 0.6, traitCozy: 0.5, traitStrategy: 0.4, traitSocial: 0.2, traitCreativity: 0.8, traitNostalgia: 0.7, traitAdventure: 0.6 },
  { domain: "music", title: "Punk / Ska", tags: ["punk", "rebellious", "energetic"], description: "Fast, raw, and rebellious music with a DIY ethos and anti-establishment attitude.", popularity: 550, traitNovelty: 0.6, traitIntensity: 0.8, traitCozy: 0.1, traitStrategy: 0.2, traitSocial: 0.6, traitCreativity: 0.6, traitNostalgia: 0.5, traitAdventure: 0.6 },

  // === GAMES (14 items) ===
  { domain: "games", title: "Open World RPGs", tags: ["rpg", "exploration", "story"], description: "Vast open worlds with deep storytelling and character progression.", popularity: 1050, traitNovelty: 0.7, traitIntensity: 0.5, traitCozy: 0.4, traitStrategy: 0.7, traitSocial: 0.3, traitCreativity: 0.6, traitNostalgia: 0.5, traitAdventure: 0.9 },
  { domain: "games", title: "Competitive FPS", tags: ["fps", "competitive", "reaction"], description: "Fast-paced first-person shooters with ranked play.", popularity: 1100, traitNovelty: 0.3, traitIntensity: 0.95, traitCozy: 0.1, traitStrategy: 0.6, traitSocial: 0.7, traitCreativity: 0.2, traitNostalgia: 0.2, traitAdventure: 0.4 },
  { domain: "games", title: "Strategy / 4X", tags: ["strategy", "planning", "complex"], description: "Complex strategy games requiring careful planning and execution.", popularity: 650, traitNovelty: 0.5, traitIntensity: 0.4, traitCozy: 0.4, traitStrategy: 0.95, traitSocial: 0.3, traitCreativity: 0.5, traitNostalgia: 0.4, traitAdventure: 0.3 },
  { domain: "games", title: "Cozy Sims", tags: ["simulation", "cozy", "relaxing"], description: "Relaxing simulation games for winding down.", popularity: 800, traitNovelty: 0.3, traitIntensity: 0.1, traitCozy: 0.95, traitStrategy: 0.3, traitSocial: 0.4, traitCreativity: 0.6, traitNostalgia: 0.6, traitAdventure: 0.2 },
  { domain: "games", title: "Indie / Puzzle", tags: ["indie", "creative", "puzzle"], description: "Creative indie titles with unique mechanics and art styles.", popularity: 600, traitNovelty: 0.8, traitIntensity: 0.3, traitCozy: 0.5, traitStrategy: 0.7, traitSocial: 0.2, traitCreativity: 0.9, traitNostalgia: 0.3, traitAdventure: 0.4 },
  { domain: "games", title: "Survival / Crafting", tags: ["survival", "crafting", "intense"], description: "Survive harsh environments while crafting tools and shelter.", popularity: 750, traitNovelty: 0.6, traitIntensity: 0.7, traitCozy: 0.2, traitStrategy: 0.6, traitSocial: 0.4, traitCreativity: 0.6, traitNostalgia: 0.2, traitAdventure: 0.8 },
  { domain: "games", title: "Battle Royale", tags: ["competitive", "action", "multiplayer"], description: "Last-player-standing games with shrinking maps and intense firefights.", popularity: 1000, traitNovelty: 0.4, traitIntensity: 0.9, traitCozy: 0.05, traitStrategy: 0.5, traitSocial: 0.8, traitCreativity: 0.3, traitNostalgia: 0.2, traitAdventure: 0.7 },
  { domain: "games", title: "Story-Driven / Narrative", tags: ["narrative", "emotional", "cinematic"], description: "Games where story and characters take center stage over gameplay mechanics.", popularity: 700, traitNovelty: 0.6, traitIntensity: 0.4, traitCozy: 0.5, traitStrategy: 0.3, traitSocial: 0.3, traitCreativity: 0.8, traitNostalgia: 0.6, traitAdventure: 0.5 },
  { domain: "games", title: "Racing / Sports", tags: ["racing", "sports", "fast"], description: "High-speed racing or competitive sports simulation games.", popularity: 850, traitNovelty: 0.3, traitIntensity: 0.7, traitCozy: 0.2, traitStrategy: 0.4, traitSocial: 0.6, traitCreativity: 0.2, traitNostalgia: 0.4, traitAdventure: 0.5 },
  { domain: "games", title: "Retro / Classic Arcade", tags: ["retro", "nostalgic", "arcade"], description: "Classic arcade-style games that bring back the golden age of gaming.", popularity: 500, traitNovelty: 0.2, traitIntensity: 0.4, traitCozy: 0.5, traitStrategy: 0.3, traitSocial: 0.4, traitCreativity: 0.3, traitNostalgia: 0.95, traitAdventure: 0.3 },
  { domain: "games", title: "MMO / Social RPG", tags: ["mmo", "social", "multiplayer"], description: "Massive online worlds where you team up with others for raids and quests.", popularity: 900, traitNovelty: 0.5, traitIntensity: 0.5, traitCozy: 0.3, traitStrategy: 0.5, traitSocial: 0.95, traitCreativity: 0.4, traitNostalgia: 0.4, traitAdventure: 0.7 },
  { domain: "games", title: "Sandbox / Creative", tags: ["sandbox", "creative", "building"], description: "Build, create, and express yourself in open-ended sandbox environments.", popularity: 950, traitNovelty: 0.6, traitIntensity: 0.2, traitCozy: 0.6, traitStrategy: 0.4, traitSocial: 0.5, traitCreativity: 0.95, traitNostalgia: 0.3, traitAdventure: 0.5 },
  { domain: "games", title: "Horror / Thriller", tags: ["horror", "suspense", "atmospheric"], description: "Spine-chilling games designed to test your nerves and keep you on edge.", popularity: 680, traitNovelty: 0.6, traitIntensity: 0.85, traitCozy: 0.05, traitStrategy: 0.4, traitSocial: 0.2, traitCreativity: 0.5, traitNostalgia: 0.3, traitAdventure: 0.6 },
  { domain: "games", title: "Party / Co-op", tags: ["party", "social", "fun"], description: "Fun games designed for groups, perfect for game nights and gatherings.", popularity: 800, traitNovelty: 0.3, traitIntensity: 0.3, traitCozy: 0.7, traitStrategy: 0.3, traitSocial: 0.95, traitCreativity: 0.4, traitNostalgia: 0.5, traitAdventure: 0.3 },

  // === FOOD (14 items) ===
  { domain: "food", title: "Japanese Cuisine", tags: ["japanese", "umami", "precise"], description: "Precise preparations emphasizing pure flavors and beautiful presentation.", popularity: 900, traitNovelty: 0.7, traitIntensity: 0.4, traitCozy: 0.5, traitStrategy: 0.6, traitSocial: 0.4, traitCreativity: 0.7, traitNostalgia: 0.4, traitAdventure: 0.5 },
  { domain: "food", title: "Italian Comfort", tags: ["italian", "comfort", "classic"], description: "Hearty pasta, pizza, and recipes passed down through generations.", popularity: 1100, traitNovelty: 0.3, traitIntensity: 0.3, traitCozy: 0.9, traitStrategy: 0.3, traitSocial: 0.7, traitCreativity: 0.4, traitNostalgia: 0.8, traitAdventure: 0.3 },
  { domain: "food", title: "Spicy Thai / Indian", tags: ["spicy", "bold", "aromatic"], description: "Bold, aromatic dishes with complex spice combinations.", popularity: 850, traitNovelty: 0.6, traitIntensity: 0.85, traitCozy: 0.3, traitStrategy: 0.3, traitSocial: 0.5, traitCreativity: 0.5, traitNostalgia: 0.3, traitAdventure: 0.7 },
  { domain: "food", title: "Street Food Culture", tags: ["street-food", "casual", "diverse"], description: "Diverse street food from around the world, eaten on the go.", popularity: 780, traitNovelty: 0.7, traitIntensity: 0.5, traitCozy: 0.4, traitStrategy: 0.2, traitSocial: 0.7, traitCreativity: 0.5, traitNostalgia: 0.4, traitAdventure: 0.8 },
  { domain: "food", title: "Plant-Based / Vegan", tags: ["vegan", "health", "creative"], description: "Creative plant-based dishes that are good for you and the planet.", popularity: 550, traitNovelty: 0.6, traitIntensity: 0.3, traitCozy: 0.4, traitStrategy: 0.4, traitSocial: 0.4, traitCreativity: 0.7, traitNostalgia: 0.2, traitAdventure: 0.5 },
  { domain: "food", title: "BBQ & Grilling", tags: ["bbq", "smoky", "hearty"], description: "Slow-smoked meats and grilled favorites with bold flavors.", popularity: 900, traitNovelty: 0.3, traitIntensity: 0.6, traitCozy: 0.6, traitStrategy: 0.4, traitSocial: 0.8, traitCreativity: 0.3, traitNostalgia: 0.6, traitAdventure: 0.3 },
  { domain: "food", title: "Korean Food", tags: ["korean", "fermented", "bold"], description: "Fermented flavors, banchan, and bold Korean culinary traditions.", popularity: 700, traitNovelty: 0.7, traitIntensity: 0.6, traitCozy: 0.4, traitStrategy: 0.3, traitSocial: 0.6, traitCreativity: 0.5, traitNostalgia: 0.4, traitAdventure: 0.6 },
  { domain: "food", title: "Bakery & Pastry", tags: ["baking", "sweet", "artisan"], description: "Artisan breads, pastries, and sweet treats made with precision.", popularity: 650, traitNovelty: 0.4, traitIntensity: 0.2, traitCozy: 0.9, traitStrategy: 0.5, traitSocial: 0.4, traitCreativity: 0.7, traitNostalgia: 0.7, traitAdventure: 0.2 },
  { domain: "food", title: "French Fine Dining", tags: ["french", "elegant", "refined"], description: "Elegant French cuisine with refined techniques and exquisite presentation.", popularity: 600, traitNovelty: 0.5, traitIntensity: 0.4, traitCozy: 0.5, traitStrategy: 0.6, traitSocial: 0.5, traitCreativity: 0.8, traitNostalgia: 0.6, traitAdventure: 0.4 },
  { domain: "food", title: "Mexican / Tex-Mex", tags: ["mexican", "vibrant", "spicy"], description: "Bold and vibrant flavors with fresh ingredients and festive traditions.", popularity: 950, traitNovelty: 0.5, traitIntensity: 0.6, traitCozy: 0.5, traitStrategy: 0.2, traitSocial: 0.8, traitCreativity: 0.5, traitNostalgia: 0.5, traitAdventure: 0.5 },
  { domain: "food", title: "Mediterranean", tags: ["mediterranean", "fresh", "healthy"], description: "Fresh, healthy ingredients with olive oil, herbs, and sun-ripened produce.", popularity: 750, traitNovelty: 0.4, traitIntensity: 0.3, traitCozy: 0.6, traitStrategy: 0.3, traitSocial: 0.5, traitCreativity: 0.5, traitNostalgia: 0.5, traitAdventure: 0.4 },
  { domain: "food", title: "Sushi & Sashimi", tags: ["japanese", "raw", "artistic"], description: "Fresh raw fish artfully prepared, showcasing the purity of ingredients.", popularity: 820, traitNovelty: 0.7, traitIntensity: 0.3, traitCozy: 0.4, traitStrategy: 0.5, traitSocial: 0.5, traitCreativity: 0.8, traitNostalgia: 0.3, traitAdventure: 0.6 },
  { domain: "food", title: "Chinese Cuisine", tags: ["chinese", "diverse", "traditional"], description: "Diverse regional cuisines from Cantonese dim sum to Sichuan spice.", popularity: 1000, traitNovelty: 0.6, traitIntensity: 0.5, traitCozy: 0.5, traitStrategy: 0.4, traitSocial: 0.7, traitCreativity: 0.5, traitNostalgia: 0.5, traitAdventure: 0.5 },
  { domain: "food", title: "Brunch & Breakfast", tags: ["brunch", "comfort", "social"], description: "Leisurely morning meals with friends, from eggs benedict to avocado toast.", popularity: 880, traitNovelty: 0.3, traitIntensity: 0.2, traitCozy: 0.85, traitStrategy: 0.2, traitSocial: 0.8, traitCreativity: 0.4, traitNostalgia: 0.7, traitAdventure: 0.2 },
];

const SEED_HOBBIES: InsertHobby[] = [
  { title: "Go-Karting", tags: ["racing", "adrenaline", "competitive", "outdoor"], description: "Race around tracks at high speed in lightweight karts. Pure adrenaline, sharp turns, and the thrill of overtaking your rivals.", starterLinks: [], traitNovelty: 0.5, traitIntensity: 0.9, traitCozy: 0.05, traitStrategy: 0.6, traitSocial: 0.7, traitCreativity: 0.2, traitNostalgia: 0.3, traitAdventure: 0.85 },
  { title: "Surfing", tags: ["ocean", "adventure", "fitness", "nature"], description: "Ride ocean waves on a surfboard. A blend of athleticism, patience, and reading the sea that connects you deeply with nature.", starterLinks: [], traitNovelty: 0.6, traitIntensity: 0.75, traitCozy: 0.15, traitStrategy: 0.4, traitSocial: 0.5, traitCreativity: 0.4, traitNostalgia: 0.2, traitAdventure: 0.95 },
  { title: "Rock Climbing", tags: ["fitness", "adventure", "outdoor", "challenging"], description: "Scale natural and artificial rock faces using strength, strategy, and problem-solving. Both indoor bouldering and outdoor routes.", starterLinks: [], traitNovelty: 0.6, traitIntensity: 0.85, traitCozy: 0.1, traitStrategy: 0.7, traitSocial: 0.5, traitCreativity: 0.3, traitNostalgia: 0.1, traitAdventure: 0.95 },
  { title: "Skateboarding", tags: ["street", "creative", "fitness", "culture"], description: "Express yourself on four wheels with tricks, street skating, and park sessions. Part sport, part art form, entirely a lifestyle.", starterLinks: [], traitNovelty: 0.6, traitIntensity: 0.7, traitCozy: 0.1, traitStrategy: 0.4, traitSocial: 0.6, traitCreativity: 0.8, traitNostalgia: 0.4, traitAdventure: 0.8 },
  { title: "Drone Photography", tags: ["tech", "photography", "aerial", "creative"], description: "Capture stunning aerial perspectives with a drone. Combines tech skills with artistic vision for breathtaking shots.", starterLinks: [], traitNovelty: 0.8, traitIntensity: 0.4, traitCozy: 0.2, traitStrategy: 0.5, traitSocial: 0.3, traitCreativity: 0.8, traitNostalgia: 0.2, traitAdventure: 0.7 },
  { title: "Scuba Diving", tags: ["underwater", "adventure", "nature", "exploration"], description: "Explore underwater worlds, coral reefs, and marine life. A mesmerizing way to see a side of Earth most never experience.", starterLinks: [], traitNovelty: 0.8, traitIntensity: 0.6, traitCozy: 0.15, traitStrategy: 0.5, traitSocial: 0.4, traitCreativity: 0.5, traitNostalgia: 0.2, traitAdventure: 0.95 },
  { title: "Cooking Competitions", tags: ["cooking", "competitive", "creative", "social"], description: "Challenge yourself with timed cook-offs, mystery basket challenges, and recipe battles. Turn the kitchen into a competitive arena.", starterLinks: [], traitNovelty: 0.65, traitIntensity: 0.7, traitCozy: 0.4, traitStrategy: 0.6, traitSocial: 0.8, traitCreativity: 0.85, traitNostalgia: 0.3, traitAdventure: 0.5 },
  { title: "Trail Running", tags: ["fitness", "nature", "outdoor", "endurance"], description: "Run through natural trails, forests, and mountains. More adventurous than road running with ever-changing terrain.", starterLinks: [], traitNovelty: 0.5, traitIntensity: 0.8, traitCozy: 0.1, traitStrategy: 0.3, traitSocial: 0.3, traitCreativity: 0.2, traitNostalgia: 0.2, traitAdventure: 0.9 },
  { title: "Board Game Nights", tags: ["strategy", "social", "indoor", "fun"], description: "Gather friends for Catan, Codenames, or Ticket to Ride. Strategy, bluffing, and laughter packed into every session.", starterLinks: [], traitNovelty: 0.4, traitIntensity: 0.3, traitCozy: 0.7, traitStrategy: 0.8, traitSocial: 0.9, traitCreativity: 0.5, traitNostalgia: 0.6, traitAdventure: 0.2 },
  { title: "Mountain Biking", tags: ["cycling", "adventure", "outdoor", "adrenaline"], description: "Tear down mountain trails on a bike built for rough terrain. Combines fitness, risk, and the beauty of nature at speed.", starterLinks: [], traitNovelty: 0.5, traitIntensity: 0.85, traitCozy: 0.05, traitStrategy: 0.5, traitSocial: 0.4, traitCreativity: 0.2, traitNostalgia: 0.15, traitAdventure: 0.95 },
  { title: "Photography Walks", tags: ["photography", "outdoor", "creative", "chill"], description: "Wander through cities, parks, or landscapes with your camera, finding beauty in everyday moments and hidden details.", starterLinks: [], traitNovelty: 0.6, traitIntensity: 0.2, traitCozy: 0.6, traitStrategy: 0.3, traitSocial: 0.3, traitCreativity: 0.9, traitNostalgia: 0.5, traitAdventure: 0.5 },
  { title: "Podcasting", tags: ["creative", "social", "storytelling", "tech"], description: "Share your voice and stories with the world. Interview experts, tell narratives, or discuss ideas that matter to you.", starterLinks: [], traitNovelty: 0.6, traitIntensity: 0.3, traitCozy: 0.4, traitStrategy: 0.4, traitSocial: 0.9, traitCreativity: 0.8, traitNostalgia: 0.3, traitAdventure: 0.4 },
  { title: "Snowboarding", tags: ["winter", "adventure", "adrenaline", "sport"], description: "Carve through powder on mountain slopes. A perfect mix of speed, style, and stunning alpine scenery.", starterLinks: [], traitNovelty: 0.5, traitIntensity: 0.85, traitCozy: 0.05, traitStrategy: 0.4, traitSocial: 0.5, traitCreativity: 0.4, traitNostalgia: 0.2, traitAdventure: 0.9 },
  { title: "Pottery & Ceramics", tags: ["art", "craft", "cozy", "tactile"], description: "Shape clay into functional art on a wheel or by hand. Deeply meditative and satisfying to create something tangible.", starterLinks: [], traitNovelty: 0.5, traitIntensity: 0.2, traitCozy: 0.8, traitStrategy: 0.3, traitSocial: 0.3, traitCreativity: 0.9, traitNostalgia: 0.6, traitAdventure: 0.2 },
  { title: "Escape Rooms", tags: ["puzzle", "social", "teamwork", "adventure"], description: "Solve puzzles under pressure with friends to 'escape' themed rooms. Tests logic, communication, and creative thinking.", starterLinks: [], traitNovelty: 0.7, traitIntensity: 0.6, traitCozy: 0.3, traitStrategy: 0.85, traitSocial: 0.85, traitCreativity: 0.7, traitNostalgia: 0.2, traitAdventure: 0.7 },
  { title: "Camping & Backpacking", tags: ["outdoor", "nature", "adventure", "survival"], description: "Disconnect from the world and reconnect with nature. Camp under the stars, cook over a fire, and explore the wilderness.", starterLinks: [], traitNovelty: 0.5, traitIntensity: 0.5, traitCozy: 0.4, traitStrategy: 0.4, traitSocial: 0.5, traitCreativity: 0.3, traitNostalgia: 0.5, traitAdventure: 0.9 },
];

const SEED_EVENTS: InsertEvent[] = [
  {
    title: "Lakers vs Celtics",
    description: "NBA regular season showdown at Crypto.com Arena. Two legendary franchises battle it out under the bright lights.",
    category: "organized",
    location: "Crypto.com Arena, Los Angeles",
    dateTime: new Date("2026-03-15T19:30:00"),
    imageUrl: "/event-basketball",
    tags: ["basketball", "nba", "sports", "competitive"],
    creatorName: "NBA",
    contactInfo: "tickets@nba.com",
    attendeeCount: 18500,
    locationLat: 34.0430, locationLng: -118.2673,
    traitNovelty: 0.4, traitIntensity: 0.9, traitCozy: 0.2, traitStrategy: 0.6, traitSocial: 0.85, traitCreativity: 0.2, traitNostalgia: 0.5, traitAdventure: 0.6,
  },
  {
    title: "Kendrick Lamar Live",
    description: "Kendrick Lamar brings his latest tour to the city. Expect deep lyrics, electrifying energy, and an unforgettable night.",
    category: "organized",
    location: "Madison Square Garden, NYC",
    dateTime: new Date("2026-04-02T20:00:00"),
    imageUrl: "/event-concert",
    tags: ["concert", "hip-hop", "music", "live"],
    creatorName: "Live Nation",
    contactInfo: "info@livenation.com",
    attendeeCount: 20000,
    locationLat: 40.7505, locationLng: -73.9934,
    traitNovelty: 0.6, traitIntensity: 0.85, traitCozy: 0.15, traitStrategy: 0.2, traitSocial: 0.9, traitCreativity: 0.7, traitNostalgia: 0.4, traitAdventure: 0.6,
  },
  {
    title: "CS Club Weekly Meetup",
    description: "Computer Science club meets to discuss projects, host lightning talks, and work on open source contributions together.",
    category: "organized",
    location: "Engineering Building Room 204",
    dateTime: new Date("2026-02-20T18:00:00"),
    imageUrl: "/event-club",
    tags: ["tech", "coding", "college", "networking"],
    creatorName: "CS Club",
    contactInfo: "cs.club@university.edu",
    attendeeCount: 45,
    locationLat: 37.4275, locationLng: -122.1697,
    traitNovelty: 0.7, traitIntensity: 0.3, traitCozy: 0.4, traitStrategy: 0.8, traitSocial: 0.7, traitCreativity: 0.8, traitNostalgia: 0.2, traitAdventure: 0.4,
  },
  {
    title: "Spring Music Festival",
    description: "Three-day outdoor music festival featuring indie, electronic, and alternative artists. Food trucks, art installations, and good vibes.",
    category: "organized",
    location: "Zilker Park, Austin TX",
    dateTime: new Date("2026-05-10T12:00:00"),
    imageUrl: "/event-festival",
    tags: ["festival", "music", "outdoor", "indie"],
    creatorName: "Austin Events Co",
    contactInfo: "hello@springfest.com",
    attendeeCount: 35000,
    locationLat: 30.2672, locationLng: -97.7431,
    traitNovelty: 0.7, traitIntensity: 0.7, traitCozy: 0.3, traitStrategy: 0.2, traitSocial: 0.95, traitCreativity: 0.7, traitNostalgia: 0.3, traitAdventure: 0.8,
  },
  {
    title: "Spring Hackathon 2026",
    description: "48-hour hackathon open to all skill levels. Build something amazing, win prizes, and meet fellow builders.",
    category: "organized",
    location: "Innovation Hub, Campus Center",
    dateTime: new Date("2026-03-22T09:00:00"),
    imageUrl: "/event-hackathon",
    tags: ["hackathon", "tech", "coding", "competition"],
    creatorName: "HackClub",
    contactInfo: "organizers@hackevent.io",
    attendeeCount: 200,
    locationLat: 37.4275, locationLng: -122.1697,
    traitNovelty: 0.85, traitIntensity: 0.7, traitCozy: 0.2, traitStrategy: 0.8, traitSocial: 0.7, traitCreativity: 0.9, traitNostalgia: 0.1, traitAdventure: 0.7,
  },
  {
    title: "Movie & Pizza Night",
    description: "Watching Dune Part 2 on the projector with pizza and drinks. Bring snacks to share! Apartment 4B, buzzer code is 1234.",
    category: "custom",
    location: "Jake's Apartment, 412 Oak St",
    dateTime: new Date("2026-02-14T19:00:00"),
    imageUrl: "/event-movienight",
    tags: ["movie", "social", "cozy", "food"],
    creatorId: "seed-colin",
    creatorName: "Colin Weis",
    contactInfo: "colin.weis@personagraph.io",
    attendeeCount: 8,
    locationLat: 37.7749, locationLng: -122.4194,
    traitNovelty: 0.3, traitIntensity: 0.3, traitCozy: 0.9, traitStrategy: 0.2, traitSocial: 0.8, traitCreativity: 0.3, traitNostalgia: 0.6, traitAdventure: 0.2,
  },
  {
    title: "Pickleball at the Rec",
    description: "Casual pickleball session at the campus recreation center. All skill levels welcome. I'll bring extra paddles!",
    category: "custom",
    location: "Campus Rec Center, Courts 3-4",
    dateTime: new Date("2026-02-16T14:00:00"),
    imageUrl: "/event-pickleball",
    tags: ["sports", "fitness", "social", "outdoor"],
    creatorId: "seed-andy",
    creatorName: "Andy Chen",
    contactInfo: "andy.chen@personagraph.io",
    attendeeCount: 6,
    locationLat: 37.4275, locationLng: -122.1697,
    traitNovelty: 0.4, traitIntensity: 0.6, traitCozy: 0.3, traitStrategy: 0.5, traitSocial: 0.85, traitCreativity: 0.2, traitNostalgia: 0.3, traitAdventure: 0.5,
  },
  {
    title: "Board Game Marathon",
    description: "All-day board game session! Bringing Catan, Codenames, Ticket to Ride, and more. BYOB and snacks welcome.",
    category: "custom",
    location: "Devon's Place, 88 Elm Ave",
    dateTime: new Date("2026-02-22T12:00:00"),
    imageUrl: "/event-gamenight",
    tags: ["games", "strategy", "social", "cozy"],
    creatorId: "seed-devon",
    creatorName: "Devon Leerssen",
    contactInfo: "devon.leerssen@personagraph.io",
    attendeeCount: 10,
    locationLat: 37.7749, locationLng: -122.4194,
    traitNovelty: 0.4, traitIntensity: 0.3, traitCozy: 0.7, traitStrategy: 0.85, traitSocial: 0.9, traitCreativity: 0.5, traitNostalgia: 0.6, traitAdventure: 0.2,
  },
];

async function seedEmbeddings() {
  if (!process.env.OPENAI_API_KEY) {
    console.log("Skipping embeddings: OPENAI_API_KEY not set");
    return;
  }

  const missingItemEmbeddings = await pool.query(
    "SELECT id, title, tags, description FROM items WHERE embedding IS NULL"
  );
  if (missingItemEmbeddings.rows.length > 0) {
    console.log(`Generating embeddings for ${missingItemEmbeddings.rows.length} items...`);
    const texts = missingItemEmbeddings.rows.map(row => buildEmbeddingText({
      title: row.title,
      tags: row.tags,
      description: row.description,
    }));
    const embeddings = await generateBatchEmbeddings(texts);
    for (let i = 0; i < missingItemEmbeddings.rows.length; i++) {
      await storeEmbedding("items", missingItemEmbeddings.rows[i].id, embeddings[i]);
    }
    console.log("Item embeddings complete.");
  }

  const missingHobbyEmbeddings = await pool.query(
    "SELECT id, title, tags, description FROM hobbies WHERE embedding IS NULL"
  );
  if (missingHobbyEmbeddings.rows.length > 0) {
    console.log(`Generating embeddings for ${missingHobbyEmbeddings.rows.length} hobbies...`);
    const texts = missingHobbyEmbeddings.rows.map(row => buildEmbeddingText({
      title: row.title,
      tags: row.tags,
      description: row.description,
    }));
    const embeddings = await generateBatchEmbeddings(texts);
    for (let i = 0; i < missingHobbyEmbeddings.rows.length; i++) {
      await storeEmbedding("hobbies", missingHobbyEmbeddings.rows[i].id, embeddings[i]);
    }
    console.log("Hobby embeddings complete.");
  }

  const missingEventEmbeddings = await pool.query(
    "SELECT id, title, tags, description FROM events WHERE embedding IS NULL"
  );
  if (missingEventEmbeddings.rows.length > 0) {
    console.log(`Generating embeddings for ${missingEventEmbeddings.rows.length} events...`);
    const texts = missingEventEmbeddings.rows.map(row => buildEmbeddingText({
      title: row.title,
      tags: row.tags,
      description: row.description,
    }));
    const embeddings = await generateBatchEmbeddings(texts);
    for (let i = 0; i < missingEventEmbeddings.rows.length; i++) {
      await storeEmbedding("events", missingEventEmbeddings.rows[i].id, embeddings[i]);
    }
    console.log("Event embeddings complete.");
  }

  const missingProfileEmbeddings = await pool.query(
    `SELECT tp.id, tp.user_id, u.first_name, u.last_name
     FROM taste_profiles tp
     JOIN users u ON tp.user_id = u.id
     WHERE tp.embedding IS NULL AND tp.onboarding_complete = true`
  );
  if (missingProfileEmbeddings.rows.length > 0) {
    console.log(`Generating embeddings for ${missingProfileEmbeddings.rows.length} seed user profiles...`);
    for (const row of missingProfileEmbeddings.rows) {
      const profileItems = await pool.query(
        `SELECT embedding FROM items WHERE embedding IS NOT NULL ORDER BY random() LIMIT 10`
      );
      if (profileItems.rows.length > 0) {
        const itemEmbeddings = profileItems.rows.map(r => {
          if (typeof r.embedding === "string") {
            return r.embedding.replace(/[\[\]]/g, "").split(",").map(Number);
          }
          return r.embedding;
        });
        const weights = itemEmbeddings.map(() => 1.0);
        const profileEmbedding = computeWeightedAverageEmbedding(itemEmbeddings, weights);
        await storeEmbedding("taste_profiles", row.id, profileEmbedding);
        console.log(`  Embedding for ${row.first_name} ${row.last_name}`);
      }
    }
    console.log("Profile embeddings complete.");
  }
}

export async function seedDatabase() {
  const [itemCountResult] = await db.select({ count: sql<number>`count(*)` }).from(items);
  const itemCount = Number(itemCountResult.count);

  if (itemCount < SEED_ITEMS.length) {
    if (itemCount > 0) {
      await db.delete(items);
      console.log("Cleared old items for re-seed...");
    }
    console.log("Seeding database with items...");
    for (const item of SEED_ITEMS) {
      await storage.createItem(item);
    }
    console.log(`Seeded ${SEED_ITEMS.length} items.`);
  }

  const [hobbyCountResult] = await db.select({ count: sql<number>`count(*)` }).from(hobbies);
  const hobbyCount = Number(hobbyCountResult.count);

  if (hobbyCount < SEED_HOBBIES.length) {
    if (hobbyCount > 0) {
      await db.delete(hobbies);
      console.log("Cleared old hobbies for re-seed...");
    }
    console.log("Seeding hobbies...");
    for (const hobby of SEED_HOBBIES) {
      await storage.createHobby(hobby);
    }
    console.log(`Seeded ${SEED_HOBBIES.length} hobbies.`);
  }

  const [seedUserCheck] = await db.select().from(users).where(eq(users.id, "seed-colin"));
  if (!seedUserCheck) {
    console.log("Seeding hackathon team profiles...");
    for (const { user, profile } of SEED_USERS) {
      await db.insert(users).values(user);
      await storage.upsertTasteProfile(profile);
      console.log(`  Created user: ${user.firstName} ${user.lastName}`);
    }
    console.log("Seed users complete.");
  }

  const eventCount = await storage.getEventCount();
  if (eventCount < SEED_EVENTS.length) {
    if (eventCount > 0) {
      await db.delete(events);
      console.log("Cleared old events for re-seed...");
    }
    console.log("Seeding events...");
    for (const event of SEED_EVENTS) {
      await storage.createEvent(event);
    }
    console.log(`Seeded ${SEED_EVENTS.length} events.`);
  }

  try {
    await seedEmbeddings();
  } catch (error) {
    console.error("Error generating embeddings (non-fatal):", error);
  }
}
