import { sql } from "drizzle-orm";
import { index, integer, jsonb, pgTable, timestamp, varchar, doublePrecision, real } from "drizzle-orm/pg-core";

// Session storage table.
// (IMPORTANT) This table is mandatory for Replit Auth, don't drop it.
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)]
);

// User storage table.
// (IMPORTANT) This table is mandatory for Replit Auth, don't drop it.
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  locationLat: doublePrecision("location_lat"),
  locationLng: doublePrecision("location_lng"),
  privacyRadiusKm: real("privacy_radius_km").default(25),
  gradYear: integer("grad_year"),
  classStanding: varchar("class_standing"),
  mainClubItemId: varchar("main_club_item_id"),
  instagramUrl: varchar("instagram_url"),
  phoneNumber: varchar("phone_number"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;
