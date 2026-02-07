import { storage } from "./storage";
import { db } from "./db";
import { users } from "@shared/models/auth";
import { tasteProfiles } from "@shared/schema";
import type { InsertItem, InsertHobby, InsertTasteProfile } from "@shared/schema";
import type { UpsertUser } from "@shared/models/auth";
import { eq } from "drizzle-orm";

const SEED_USERS: { user: UpsertUser; profile: InsertTasteProfile }[] = [
  {
    user: { id: "seed-user-1", email: "alex.chen@example.com", firstName: "Alex", lastName: "Chen", profileImageUrl: null },
    profile: { userId: "seed-user-1", traitNovelty: 0.85, traitIntensity: 0.7, traitCozy: 0.25, traitStrategy: 0.8, traitSocial: 0.5, traitCreativity: 0.9, traitNostalgia: 0.3, traitAdventure: 0.85, topClusters: ["Innovator", "Creative Thinker", "Adventurer"], onboardingComplete: true },
  },
  {
    user: { id: "seed-user-2", email: "maya.patel@example.com", firstName: "Maya", lastName: "Patel", profileImageUrl: null },
    profile: { userId: "seed-user-2", traitNovelty: 0.6, traitIntensity: 0.3, traitCozy: 0.85, traitStrategy: 0.4, traitSocial: 0.7, traitCreativity: 0.75, traitNostalgia: 0.8, traitAdventure: 0.35, topClusters: ["Comfort Connoisseur", "Nostalgia Lover", "Social Butterfly"], onboardingComplete: true },
  },
  {
    user: { id: "seed-user-3", email: "jordan.lee@example.com", firstName: "Jordan", lastName: "Lee", profileImageUrl: null },
    profile: { userId: "seed-user-3", traitNovelty: 0.5, traitIntensity: 0.9, traitCozy: 0.15, traitStrategy: 0.85, traitSocial: 0.65, traitCreativity: 0.35, traitNostalgia: 0.2, traitAdventure: 0.7, topClusters: ["Thrill Seeker", "Strategic Mind", "Tactical Gamer"], onboardingComplete: true },
  },
  {
    user: { id: "seed-user-4", email: "sam.rivera@example.com", firstName: "Sam", lastName: "Rivera", profileImageUrl: null },
    profile: { userId: "seed-user-4", traitNovelty: 0.75, traitIntensity: 0.45, traitCozy: 0.6, traitStrategy: 0.55, traitSocial: 0.85, traitCreativity: 0.8, traitNostalgia: 0.5, traitAdventure: 0.65, topClusters: ["Social Butterfly", "Creative Thinker", "Explorer"], onboardingComplete: true },
  },
  {
    user: { id: "seed-user-5", email: "taylor.kim@example.com", firstName: "Taylor", lastName: "Kim", profileImageUrl: null },
    profile: { userId: "seed-user-5", traitNovelty: 0.4, traitIntensity: 0.2, traitCozy: 0.9, traitStrategy: 0.6, traitSocial: 0.3, traitCreativity: 0.65, traitNostalgia: 0.85, traitAdventure: 0.2, topClusters: ["Comfort Classic", "Nostalgia Lover", "Creative Thinker"], onboardingComplete: true },
  },
];

const SEED_ITEMS: InsertItem[] = [
  { domain: "movies", title: "Interstellar", tags: ["sci-fi", "space", "emotional"], description: "A team of explorers travel through a wormhole in space to ensure humanity's survival.", popularity: 1240, traitNovelty: 0.85, traitIntensity: 0.7, traitCozy: 0.3, traitStrategy: 0.6, traitSocial: 0.4, traitCreativity: 0.8, traitNostalgia: 0.4, traitAdventure: 0.9 },
  { domain: "movies", title: "The Dark Knight", tags: ["action", "thriller", "dark"], description: "Batman faces the Joker in a battle for Gotham's soul.", popularity: 1180, traitNovelty: 0.6, traitIntensity: 0.9, traitCozy: 0.1, traitStrategy: 0.7, traitSocial: 0.4, traitCreativity: 0.5, traitNostalgia: 0.3, traitAdventure: 0.7 },
  { domain: "movies", title: "Spirited Away", tags: ["anime", "fantasy", "magical"], description: "A girl enters a world of spirits and must find her way home.", popularity: 980, traitNovelty: 0.8, traitIntensity: 0.4, traitCozy: 0.7, traitStrategy: 0.3, traitSocial: 0.4, traitCreativity: 0.95, traitNostalgia: 0.7, traitAdventure: 0.7 },
  { domain: "movies", title: "Inception", tags: ["sci-fi", "thriller", "mind-bending"], description: "A thief who steals secrets through dream-sharing technology.", popularity: 1100, traitNovelty: 0.9, traitIntensity: 0.8, traitCozy: 0.2, traitStrategy: 0.85, traitSocial: 0.3, traitCreativity: 0.8, traitNostalgia: 0.2, traitAdventure: 0.7 },
  { domain: "movies", title: "The Grand Budapest Hotel", tags: ["comedy", "quirky", "artistic"], description: "The adventures of a legendary concierge at a famous European hotel.", popularity: 720, traitNovelty: 0.7, traitIntensity: 0.3, traitCozy: 0.6, traitStrategy: 0.4, traitSocial: 0.6, traitCreativity: 0.95, traitNostalgia: 0.8, traitAdventure: 0.5 },
  { domain: "movies", title: "Parasite", tags: ["thriller", "social", "dark-comedy"], description: "A poor family schemes to infiltrate a wealthy household.", popularity: 950, traitNovelty: 0.8, traitIntensity: 0.7, traitCozy: 0.2, traitStrategy: 0.8, traitSocial: 0.7, traitCreativity: 0.7, traitNostalgia: 0.3, traitAdventure: 0.4 },
  { domain: "movies", title: "Lord of the Rings", tags: ["fantasy", "epic", "adventure"], description: "A hobbit embarks on a perilous quest to destroy a powerful ring.", popularity: 1300, traitNovelty: 0.5, traitIntensity: 0.8, traitCozy: 0.4, traitStrategy: 0.5, traitSocial: 0.6, traitCreativity: 0.7, traitNostalgia: 0.7, traitAdventure: 0.95 },
  { domain: "movies", title: "Pulp Fiction", tags: ["crime", "dialogue", "nonlinear"], description: "Interconnected stories of crime in Los Angeles.", popularity: 890, traitNovelty: 0.8, traitIntensity: 0.7, traitCozy: 0.2, traitStrategy: 0.5, traitSocial: 0.5, traitCreativity: 0.85, traitNostalgia: 0.5, traitAdventure: 0.4 },

  { domain: "music", title: "Indie / Alternative", tags: ["indie", "creative", "mellow"], description: "Independent music with creative expression and distinctive sounds.", popularity: 800, traitNovelty: 0.8, traitIntensity: 0.3, traitCozy: 0.5, traitStrategy: 0.3, traitSocial: 0.4, traitCreativity: 0.9, traitNostalgia: 0.4, traitAdventure: 0.5 },
  { domain: "music", title: "Electronic / EDM", tags: ["electronic", "energy", "beats"], description: "Electronic dance music with synthesized sounds and driving rhythms.", popularity: 950, traitNovelty: 0.7, traitIntensity: 0.8, traitCozy: 0.2, traitStrategy: 0.3, traitSocial: 0.7, traitCreativity: 0.6, traitNostalgia: 0.2, traitAdventure: 0.6 },
  { domain: "music", title: "Classical / Orchestral", tags: ["classical", "elegant", "complex"], description: "Orchestral compositions from the greatest composers in history.", popularity: 500, traitNovelty: 0.4, traitIntensity: 0.5, traitCozy: 0.6, traitStrategy: 0.7, traitSocial: 0.3, traitCreativity: 0.8, traitNostalgia: 0.8, traitAdventure: 0.3 },
  { domain: "music", title: "Jazz / Blues", tags: ["jazz", "soulful", "improvisation"], description: "Improvised melodies with deep emotional expression.", popularity: 550, traitNovelty: 0.7, traitIntensity: 0.4, traitCozy: 0.6, traitStrategy: 0.4, traitSocial: 0.6, traitCreativity: 0.9, traitNostalgia: 0.7, traitAdventure: 0.4 },
  { domain: "music", title: "Lo-fi / Ambient", tags: ["lofi", "chill", "atmospheric"], description: "Relaxing beats and ambient soundscapes for focus and calm.", popularity: 750, traitNovelty: 0.5, traitIntensity: 0.1, traitCozy: 0.9, traitStrategy: 0.3, traitSocial: 0.2, traitCreativity: 0.6, traitNostalgia: 0.5, traitAdventure: 0.2 },
  { domain: "music", title: "Hip Hop / Rap", tags: ["hip-hop", "rhythm", "lyrical"], description: "Rhythmic vocal delivery over beats with storytelling and wordplay.", popularity: 1100, traitNovelty: 0.5, traitIntensity: 0.6, traitCozy: 0.3, traitStrategy: 0.4, traitSocial: 0.7, traitCreativity: 0.7, traitNostalgia: 0.3, traitAdventure: 0.5 },
  { domain: "music", title: "Rock / Metal", tags: ["rock", "intense", "guitar"], description: "Guitar-driven music ranging from classic rock to heavy metal.", popularity: 900, traitNovelty: 0.4, traitIntensity: 0.85, traitCozy: 0.2, traitStrategy: 0.3, traitSocial: 0.5, traitCreativity: 0.5, traitNostalgia: 0.6, traitAdventure: 0.5 },
  { domain: "music", title: "Pop / Top 40", tags: ["pop", "catchy", "mainstream"], description: "Popular music with catchy hooks and wide appeal.", popularity: 1200, traitNovelty: 0.3, traitIntensity: 0.4, traitCozy: 0.5, traitStrategy: 0.2, traitSocial: 0.8, traitCreativity: 0.4, traitNostalgia: 0.4, traitAdventure: 0.3 },

  { domain: "games", title: "Open World RPGs", tags: ["rpg", "exploration", "story"], description: "Vast open worlds with deep storytelling and character progression.", popularity: 1050, traitNovelty: 0.7, traitIntensity: 0.5, traitCozy: 0.4, traitStrategy: 0.7, traitSocial: 0.3, traitCreativity: 0.6, traitNostalgia: 0.5, traitAdventure: 0.9 },
  { domain: "games", title: "Competitive FPS", tags: ["fps", "competitive", "reaction"], description: "Fast-paced first-person shooters with ranked play.", popularity: 1100, traitNovelty: 0.3, traitIntensity: 0.95, traitCozy: 0.1, traitStrategy: 0.6, traitSocial: 0.7, traitCreativity: 0.2, traitNostalgia: 0.2, traitAdventure: 0.4 },
  { domain: "games", title: "Strategy / 4X", tags: ["strategy", "planning", "complex"], description: "Complex strategy games requiring careful planning and execution.", popularity: 650, traitNovelty: 0.5, traitIntensity: 0.4, traitCozy: 0.4, traitStrategy: 0.95, traitSocial: 0.3, traitCreativity: 0.5, traitNostalgia: 0.4, traitAdventure: 0.3 },
  { domain: "games", title: "Cozy Sims", tags: ["simulation", "cozy", "relaxing"], description: "Relaxing simulation games for winding down.", popularity: 800, traitNovelty: 0.3, traitIntensity: 0.1, traitCozy: 0.95, traitStrategy: 0.3, traitSocial: 0.4, traitCreativity: 0.6, traitNostalgia: 0.6, traitAdventure: 0.2 },
  { domain: "games", title: "Indie / Puzzle", tags: ["indie", "creative", "puzzle"], description: "Creative indie titles with unique mechanics and art styles.", popularity: 600, traitNovelty: 0.8, traitIntensity: 0.3, traitCozy: 0.5, traitStrategy: 0.7, traitSocial: 0.2, traitCreativity: 0.9, traitNostalgia: 0.3, traitAdventure: 0.4 },
  { domain: "games", title: "Survival / Crafting", tags: ["survival", "crafting", "intense"], description: "Survive harsh environments while crafting tools and shelter.", popularity: 750, traitNovelty: 0.6, traitIntensity: 0.7, traitCozy: 0.2, traitStrategy: 0.6, traitSocial: 0.4, traitCreativity: 0.6, traitNostalgia: 0.2, traitAdventure: 0.8 },

  { domain: "food", title: "Japanese Cuisine", tags: ["japanese", "umami", "precise"], description: "Precise preparations emphasizing pure flavors and beautiful presentation.", popularity: 900, traitNovelty: 0.7, traitIntensity: 0.4, traitCozy: 0.5, traitStrategy: 0.6, traitSocial: 0.4, traitCreativity: 0.7, traitNostalgia: 0.4, traitAdventure: 0.5 },
  { domain: "food", title: "Italian Comfort", tags: ["italian", "comfort", "classic"], description: "Hearty pasta, pizza, and recipes passed down through generations.", popularity: 1100, traitNovelty: 0.3, traitIntensity: 0.3, traitCozy: 0.9, traitStrategy: 0.3, traitSocial: 0.7, traitCreativity: 0.4, traitNostalgia: 0.8, traitAdventure: 0.3 },
  { domain: "food", title: "Spicy Thai / Indian", tags: ["spicy", "bold", "aromatic"], description: "Bold, aromatic dishes with complex spice combinations.", popularity: 850, traitNovelty: 0.6, traitIntensity: 0.85, traitCozy: 0.3, traitStrategy: 0.3, traitSocial: 0.5, traitCreativity: 0.5, traitNostalgia: 0.3, traitAdventure: 0.7 },
  { domain: "food", title: "Street Food Culture", tags: ["street-food", "casual", "diverse"], description: "Diverse street food from around the world, eaten on the go.", popularity: 780, traitNovelty: 0.7, traitIntensity: 0.5, traitCozy: 0.4, traitStrategy: 0.2, traitSocial: 0.7, traitCreativity: 0.5, traitNostalgia: 0.4, traitAdventure: 0.8 },
  { domain: "food", title: "Plant-Based / Vegan", tags: ["vegan", "health", "creative"], description: "Creative plant-based dishes that are good for you and the planet.", popularity: 550, traitNovelty: 0.6, traitIntensity: 0.3, traitCozy: 0.4, traitStrategy: 0.4, traitSocial: 0.4, traitCreativity: 0.7, traitNostalgia: 0.2, traitAdventure: 0.5 },
  { domain: "food", title: "BBQ & Grilling", tags: ["bbq", "smoky", "hearty"], description: "Slow-smoked meats and grilled favorites with bold flavors.", popularity: 900, traitNovelty: 0.3, traitIntensity: 0.6, traitCozy: 0.6, traitStrategy: 0.4, traitSocial: 0.8, traitCreativity: 0.3, traitNostalgia: 0.6, traitAdventure: 0.3 },
  { domain: "food", title: "Korean Food", tags: ["korean", "fermented", "bold"], description: "Fermented flavors, banchan, and bold Korean culinary traditions.", popularity: 700, traitNovelty: 0.7, traitIntensity: 0.6, traitCozy: 0.4, traitStrategy: 0.3, traitSocial: 0.6, traitCreativity: 0.5, traitNostalgia: 0.4, traitAdventure: 0.6 },
  { domain: "food", title: "Bakery & Pastry", tags: ["baking", "sweet", "artisan"], description: "Artisan breads, pastries, and sweet treats made with precision.", popularity: 650, traitNovelty: 0.4, traitIntensity: 0.2, traitCozy: 0.9, traitStrategy: 0.5, traitSocial: 0.4, traitCreativity: 0.7, traitNostalgia: 0.7, traitAdventure: 0.2 },
];

const SEED_HOBBIES: InsertHobby[] = [
  { title: "Astrophotography", tags: ["photography", "space", "technical", "creative"], description: "Capture the night sky, galaxies, and celestial events through long-exposure photography. Combines technical camera skills with patience and wonder.", starterLinks: [], traitNovelty: 0.85, traitIntensity: 0.4, traitCozy: 0.3, traitStrategy: 0.7, traitSocial: 0.2, traitCreativity: 0.9, traitNostalgia: 0.5, traitAdventure: 0.7 },
  { title: "Urban Sketching", tags: ["art", "travel", "outdoor", "creative"], description: "Sketch the world around you in real-time, from cityscapes to cafes. A meditative way to observe and document daily life.", starterLinks: [], traitNovelty: 0.6, traitIntensity: 0.2, traitCozy: 0.6, traitStrategy: 0.3, traitSocial: 0.4, traitCreativity: 0.95, traitNostalgia: 0.6, traitAdventure: 0.5 },
  { title: "Rock Climbing", tags: ["fitness", "adventure", "outdoor", "challenging"], description: "Scale natural and artificial rock faces using strength, strategy, and problem-solving. Both indoor bouldering and outdoor routes.", starterLinks: [], traitNovelty: 0.6, traitIntensity: 0.85, traitCozy: 0.1, traitStrategy: 0.7, traitSocial: 0.5, traitCreativity: 0.3, traitNostalgia: 0.1, traitAdventure: 0.95 },
  { title: "Fermentation & Brewing", tags: ["cooking", "science", "patience", "craft"], description: "Make your own kombucha, kimchi, sourdough, or craft beer. Part science, part art, fully rewarding.", starterLinks: [], traitNovelty: 0.7, traitIntensity: 0.3, traitCozy: 0.7, traitStrategy: 0.6, traitSocial: 0.4, traitCreativity: 0.7, traitNostalgia: 0.5, traitAdventure: 0.4 },
  { title: "Board Game Design", tags: ["strategy", "creative", "social", "design"], description: "Create your own tabletop games from concept to prototype. Combines strategic thinking with creative design.", starterLinks: [], traitNovelty: 0.7, traitIntensity: 0.3, traitCozy: 0.5, traitStrategy: 0.9, traitSocial: 0.6, traitCreativity: 0.9, traitNostalgia: 0.4, traitAdventure: 0.3 },
  { title: "Trail Running", tags: ["fitness", "nature", "outdoor", "endurance"], description: "Run through natural trails, forests, and mountains. More adventurous than road running with ever-changing terrain.", starterLinks: [], traitNovelty: 0.5, traitIntensity: 0.8, traitCozy: 0.1, traitStrategy: 0.3, traitSocial: 0.3, traitCreativity: 0.2, traitNostalgia: 0.2, traitAdventure: 0.9 },
  { title: "Pottery & Ceramics", tags: ["art", "craft", "cozy", "tactile"], description: "Shape clay into functional art on a wheel or by hand. Deeply meditative and satisfying to create something tangible.", starterLinks: [], traitNovelty: 0.5, traitIntensity: 0.2, traitCozy: 0.8, traitStrategy: 0.3, traitSocial: 0.3, traitCreativity: 0.9, traitNostalgia: 0.6, traitAdventure: 0.2 },
  { title: "Competitive Chess", tags: ["strategy", "competitive", "mental", "classic"], description: "Master the game of kings through study, practice, and tournament play. Endless depth in a simple ruleset.", starterLinks: [], traitNovelty: 0.3, traitIntensity: 0.5, traitCozy: 0.4, traitStrategy: 0.95, traitSocial: 0.5, traitCreativity: 0.4, traitNostalgia: 0.6, traitAdventure: 0.2 },
  { title: "Drone Photography", tags: ["tech", "photography", "aerial", "creative"], description: "Capture stunning aerial perspectives with a drone. Combines tech skills with artistic vision.", starterLinks: [], traitNovelty: 0.8, traitIntensity: 0.4, traitCozy: 0.2, traitStrategy: 0.5, traitSocial: 0.3, traitCreativity: 0.8, traitNostalgia: 0.2, traitAdventure: 0.7 },
  { title: "Community Gardening", tags: ["nature", "social", "cozy", "sustainable"], description: "Grow food and flowers in a shared community space. Connect with neighbors while nurturing the earth.", starterLinks: [], traitNovelty: 0.3, traitIntensity: 0.1, traitCozy: 0.9, traitStrategy: 0.3, traitSocial: 0.8, traitCreativity: 0.5, traitNostalgia: 0.7, traitAdventure: 0.2 },
  { title: "Podcasting", tags: ["creative", "social", "storytelling", "tech"], description: "Share your voice and stories with the world. Interview experts, tell narratives, or discuss ideas.", starterLinks: [], traitNovelty: 0.6, traitIntensity: 0.3, traitCozy: 0.4, traitStrategy: 0.4, traitSocial: 0.9, traitCreativity: 0.8, traitNostalgia: 0.3, traitAdventure: 0.4 },
  { title: "Speedcubing", tags: ["puzzle", "competitive", "dexterity", "logical"], description: "Solve Rubik's cubes and other twisty puzzles as fast as possible. A blend of algorithms and finger speed.", starterLinks: [], traitNovelty: 0.5, traitIntensity: 0.6, traitCozy: 0.3, traitStrategy: 0.8, traitSocial: 0.4, traitCreativity: 0.3, traitNostalgia: 0.4, traitAdventure: 0.3 },
];

export async function seedDatabase() {
  const itemCount = await storage.getItemCount();
  if (itemCount === 0) {
    console.log("Seeding database with items...");
    for (const item of SEED_ITEMS) {
      await storage.createItem(item);
    }
    console.log(`Seeded ${SEED_ITEMS.length} items.`);
  }

  const hobbyCount = await storage.getHobbyCount();
  if (hobbyCount === 0) {
    console.log("Seeding hobbies...");
    for (const hobby of SEED_HOBBIES) {
      await storage.createHobby(hobby);
    }
    console.log(`Seeded ${SEED_HOBBIES.length} hobbies.`);
  }

  const [seedUserCheck] = await db.select().from(users).where(eq(users.id, "seed-user-1"));
  if (!seedUserCheck) {
    console.log("Seeding sample users and profiles...");
    for (const { user, profile } of SEED_USERS) {
      await db.insert(users).values(user);
      await storage.upsertTasteProfile(profile);
      console.log(`  Created user: ${user.firstName} ${user.lastName}`);
    }
    console.log("Seed users complete.");
  }
}
