import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, integer, real, jsonb, timestamp, boolean, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export * from "./models/auth";

export const tasteProfiles = pgTable("taste_profiles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().unique(),
  traitNovelty: real("trait_novelty").default(0.5),
  traitIntensity: real("trait_intensity").default(0.5),
  traitCozy: real("trait_cozy").default(0.5),
  traitStrategy: real("trait_strategy").default(0.5),
  traitSocial: real("trait_social").default(0.5),
  traitCreativity: real("trait_creativity").default(0.5),
  traitNostalgia: real("trait_nostalgia").default(0.5),
  traitAdventure: real("trait_adventure").default(0.5),
  topClusters: text("top_clusters").array(),
  onboardingComplete: boolean("onboarding_complete").default(false),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const items = pgTable("items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  domain: text("domain").notNull(),
  title: text("title").notNull(),
  imageUrl: text("image_url"),
  tags: text("tags").array(),
  description: text("description"),
  popularity: integer("popularity").default(0),
  traitNovelty: real("trait_novelty").default(0.5),
  traitIntensity: real("trait_intensity").default(0.5),
  traitCozy: real("trait_cozy").default(0.5),
  traitStrategy: real("trait_strategy").default(0.5),
  traitSocial: real("trait_social").default(0.5),
  traitCreativity: real("trait_creativity").default(0.5),
  traitNostalgia: real("trait_nostalgia").default(0.5),
  traitAdventure: real("trait_adventure").default(0.5),
}, (table) => [
  index("items_domain_idx").on(table.domain),
]);

export const interactions = pgTable("interactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  itemId: varchar("item_id").notNull(),
  domain: text("domain").notNull(),
  action: text("action").notNull(),
  weight: real("weight").default(1.0),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("interactions_user_idx").on(table.userId),
]);

export const matches = pgTable("matches", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userAId: varchar("user_a_id").notNull(),
  userBId: varchar("user_b_id").notNull(),
  score: integer("score").notNull(),
  color: text("color").notNull(),
  explanations: text("explanations").array(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const hobbies = pgTable("hobbies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  description: text("description"),
  imageUrl: text("image_url"),
  tags: text("tags").array(),
  starterLinks: text("starter_links").array(),
  traitNovelty: real("trait_novelty").default(0.5),
  traitIntensity: real("trait_intensity").default(0.5),
  traitCozy: real("trait_cozy").default(0.5),
  traitStrategy: real("trait_strategy").default(0.5),
  traitSocial: real("trait_social").default(0.5),
  traitCreativity: real("trait_creativity").default(0.5),
  traitNostalgia: real("trait_nostalgia").default(0.5),
  traitAdventure: real("trait_adventure").default(0.5),
});

export const events = pgTable("events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  description: text("description"),
  category: text("category").notNull(),
  location: text("location"),
  dateTime: timestamp("date_time"),
  imageUrl: text("image_url"),
  tags: text("tags").array(),
  creatorId: varchar("creator_id"),
  creatorName: text("creator_name"),
  contactInfo: text("contact_info"),
  attendeeCount: integer("attendee_count").default(0),
  traitNovelty: real("trait_novelty").default(0.5),
  traitIntensity: real("trait_intensity").default(0.5),
  traitCozy: real("trait_cozy").default(0.5),
  traitStrategy: real("trait_strategy").default(0.5),
  traitSocial: real("trait_social").default(0.5),
  traitCreativity: real("trait_creativity").default(0.5),
  traitNostalgia: real("trait_nostalgia").default(0.5),
  traitAdventure: real("trait_adventure").default(0.5),
}, (table) => [
  index("events_category_idx").on(table.category),
]);

export const eventRsvps = pgTable("event_rsvps", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventId: varchar("event_id").notNull(),
  userId: varchar("user_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("event_rsvps_event_idx").on(table.eventId),
  index("event_rsvps_user_idx").on(table.userId),
]);

export const insertTasteProfileSchema = createInsertSchema(tasteProfiles).omit({ id: true, updatedAt: true });
export const insertItemSchema = createInsertSchema(items).omit({ id: true });
export const insertInteractionSchema = createInsertSchema(interactions).omit({ id: true, createdAt: true });
export const insertHobbySchema = createInsertSchema(hobbies).omit({ id: true });
export const insertEventSchema = createInsertSchema(events).omit({ id: true });
export const insertEventRsvpSchema = createInsertSchema(eventRsvps).omit({ id: true, createdAt: true });

export type TasteProfile = typeof tasteProfiles.$inferSelect;
export type InsertTasteProfile = z.infer<typeof insertTasteProfileSchema>;
export type Item = typeof items.$inferSelect;
export type InsertItem = z.infer<typeof insertItemSchema>;
export type Interaction = typeof interactions.$inferSelect;
export type InsertInteraction = z.infer<typeof insertInteractionSchema>;
export type Match = typeof matches.$inferSelect;
export type Hobby = typeof hobbies.$inferSelect;
export type InsertHobby = z.infer<typeof insertHobbySchema>;
export type Event = typeof events.$inferSelect;
export type InsertEvent = z.infer<typeof insertEventSchema>;
export type EventRsvp = typeof eventRsvps.$inferSelect;
export type InsertEventRsvp = z.infer<typeof insertEventRsvpSchema>;

export const DOMAINS = ["movies", "music", "games", "food", "hobbies"] as const;
export type Domain = typeof DOMAINS[number];

export const TRAIT_AXES = [
  "novelty", "intensity", "cozy", "strategy",
  "social", "creativity", "nostalgia", "adventure"
] as const;
export type TraitAxis = typeof TRAIT_AXES[number];

export function getMatchColor(score: number): "green" | "yellow" | "grey" {
  if (score >= 75) return "green";
  if (score >= 50) return "yellow";
  return "grey";
}
