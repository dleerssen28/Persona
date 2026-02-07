import {
  type TasteProfile, type InsertTasteProfile,
  type Item, type InsertItem,
  type Interaction, type InsertInteraction,
  type Hobby, type InsertHobby,
  type Match,
  tasteProfiles, items, interactions, matches, hobbies,
} from "@shared/schema";
import { users, type User, type UpsertUser } from "@shared/models/auth";
import { db } from "./db";
import { eq, and, inArray, ne, desc, sql } from "drizzle-orm";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getAllUsers(): Promise<User[]>;

  getTasteProfile(userId: string): Promise<TasteProfile | undefined>;
  upsertTasteProfile(profile: InsertTasteProfile): Promise<TasteProfile>;

  getItemsByDomain(domain: string): Promise<Item[]>;
  getItemById(id: string): Promise<Item | undefined>;
  getItemsByIds(ids: string[]): Promise<Item[]>;
  createItem(item: InsertItem): Promise<Item>;
  getItemCount(): Promise<number>;

  createInteraction(interaction: InsertInteraction): Promise<Interaction>;
  getUserInteractions(userId: string, domain?: string): Promise<Interaction[]>;

  getAllTasteProfiles(): Promise<TasteProfile[]>;
  getUsersWithProfiles(excludeUserId: string): Promise<{ user: User; profile: TasteProfile }[]>;

  getHobbies(): Promise<Hobby[]>;
  createHobby(hobby: InsertHobby): Promise<Hobby>;
  getHobbyCount(): Promise<number>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getAllUsers(): Promise<User[]> {
    return db.select().from(users);
  }

  async getTasteProfile(userId: string): Promise<TasteProfile | undefined> {
    const [profile] = await db.select().from(tasteProfiles).where(eq(tasteProfiles.userId, userId));
    return profile;
  }

  async upsertTasteProfile(profile: InsertTasteProfile): Promise<TasteProfile> {
    const [result] = await db
      .insert(tasteProfiles)
      .values(profile)
      .onConflictDoUpdate({
        target: tasteProfiles.userId,
        set: {
          ...profile,
          updatedAt: new Date(),
        },
      })
      .returning();
    return result;
  }

  async getItemsByDomain(domain: string): Promise<Item[]> {
    return db.select().from(items).where(eq(items.domain, domain));
  }

  async getItemById(id: string): Promise<Item | undefined> {
    const [item] = await db.select().from(items).where(eq(items.id, id));
    return item;
  }

  async getItemsByIds(ids: string[]): Promise<Item[]> {
    if (ids.length === 0) return [];
    return db.select().from(items).where(inArray(items.id, ids));
  }

  async createItem(item: InsertItem): Promise<Item> {
    const [result] = await db.insert(items).values(item).returning();
    return result;
  }

  async getItemCount(): Promise<number> {
    const [result] = await db.select({ count: sql<number>`count(*)` }).from(items);
    return Number(result.count);
  }

  async createInteraction(interaction: InsertInteraction): Promise<Interaction> {
    const [result] = await db.insert(interactions).values(interaction).returning();
    return result;
  }

  async getUserInteractions(userId: string, domain?: string): Promise<Interaction[]> {
    if (domain) {
      return db.select().from(interactions)
        .where(and(eq(interactions.userId, userId), eq(interactions.domain, domain)));
    }
    return db.select().from(interactions).where(eq(interactions.userId, userId));
  }

  async getAllTasteProfiles(): Promise<TasteProfile[]> {
    return db.select().from(tasteProfiles);
  }

  async getUsersWithProfiles(excludeUserId: string): Promise<{ user: User; profile: TasteProfile }[]> {
    const results = await db
      .select({ user: users, profile: tasteProfiles })
      .from(users)
      .innerJoin(tasteProfiles, eq(users.id, tasteProfiles.userId))
      .where(and(
        ne(users.id, excludeUserId),
        eq(tasteProfiles.onboardingComplete, true)
      ));
    return results;
  }

  async getHobbies(): Promise<Hobby[]> {
    return db.select().from(hobbies);
  }

  async createHobby(hobby: InsertHobby): Promise<Hobby> {
    const [result] = await db.insert(hobbies).values(hobby).returning();
    return result;
  }

  async getHobbyCount(): Promise<number> {
    const [result] = await db.select({ count: sql<number>`count(*)` }).from(hobbies);
    return Number(result.count);
  }
}

export const storage = new DatabaseStorage();
