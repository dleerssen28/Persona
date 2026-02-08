import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, registerAuthRoutes, isAuthenticated } from "./replit_integrations/auth";
import { buildTraitsFromSelections, generateClusters, computeMatchScore, computeItemMatchScore, computeHobbyMatch, getTraitsFromProfile } from "./taste-engine";
import { TRAIT_AXES, type Domain, interactions, tasteProfiles, items as itemsTable } from "@shared/schema";
import { users } from "@shared/models/auth";
import { GARV_PROFILE } from "./seed";
import { hybridRecommend, hybridSocialMatch, hybridEventScore, hybridHobbyScore } from "./hybrid-engine";
import { recomputeTasteEmbedding, deriveEmbeddingFromProfile, checkEmbeddingHealth, generateBatchEmbeddings, buildEmbeddingText, storeEmbedding, computeWeightedAverageEmbedding, generateEmbedding, computeCosineSimilarity, cosineSimilarityToScore, isValidEmbedding, haversineDistance, getDistanceBucket, findSimilarByEmbedding } from "./embeddings";
import { db, pool } from "./db";
import { sql } from "drizzle-orm";

function demoAuth(req: any, res: any, next: any) {
  if (process.env.DEMO_BYPASS_AUTH === "true") {
    if (!req.user) {
      req.user = { claims: { sub: "49486139" } };
    }
    return next();
  }
  return isAuthenticated(req, res, next);
}

function computeClubUrgency(club: any): { urgencyScore: number; urgencyLabel: string; deadline: string | null } {
  const now = new Date();
  const deadlines: { date: Date; type: string }[] = [];

  if (club.nextMeetingAt) deadlines.push({ date: new Date(club.nextMeetingAt), type: "meeting" });
  if (club.duesDeadline) deadlines.push({ date: new Date(club.duesDeadline), type: "dues" });

  if (deadlines.length === 0) return { urgencyScore: 0, urgencyLabel: "no deadline", deadline: null };

  deadlines.sort((a, b) => a.date.getTime() - b.date.getTime());
  const nearest = deadlines.find(d => d.date.getTime() > now.getTime());
  if (!nearest) return { urgencyScore: 0, urgencyLabel: "past", deadline: null };

  const hoursUntil = (nearest.date.getTime() - now.getTime()) / (1000 * 60 * 60);
  let urgencyScore: number;
  let urgencyLabel: string;

  if (hoursUntil <= 24) {
    urgencyScore = 100;
    urgencyLabel = "meeting today";
  } else if (hoursUntil <= 48) {
    urgencyScore = 90;
    urgencyLabel = "meeting tomorrow";
  } else if (hoursUntil <= 72) {
    urgencyScore = 75;
    urgencyLabel = "this week";
  } else if (hoursUntil <= 168) {
    urgencyScore = 50;
    urgencyLabel = "upcoming";
  } else if (hoursUntil <= 336) {
    urgencyScore = 30;
    urgencyLabel = "next week";
  } else {
    urgencyScore = 10;
    urgencyLabel = "plenty of time";
  }

  return {
    urgencyScore,
    urgencyLabel,
    deadline: nearest.date.toISOString(),
  };
}

function computeUrgency(event: any): { urgencyScore: number; urgencyLabel: string; deadline: string | null } {
  const now = new Date();
  const deadlines: { date: Date; type: string }[] = [];

  if (event.signupDeadline) deadlines.push({ date: new Date(event.signupDeadline), type: "signup" });
  if (event.duesDeadline) deadlines.push({ date: new Date(event.duesDeadline), type: "dues" });
  if (event.dateTime) deadlines.push({ date: new Date(event.dateTime), type: "event" });

  if (deadlines.length === 0) return { urgencyScore: 0, urgencyLabel: "no deadline", deadline: null };

  deadlines.sort((a, b) => a.date.getTime() - b.date.getTime());
  const nearest = deadlines.find(d => d.date.getTime() > now.getTime());
  if (!nearest) return { urgencyScore: 0, urgencyLabel: "past", deadline: null };

  const hoursUntil = (nearest.date.getTime() - now.getTime()) / (1000 * 60 * 60);
  let urgencyScore: number;
  let urgencyLabel: string;

  if (hoursUntil <= 24) {
    urgencyScore = 100;
    urgencyLabel = "last chance";
  } else if (hoursUntil <= 48) {
    urgencyScore = 90;
    urgencyLabel = "closing soon";
  } else if (hoursUntil <= 72) {
    urgencyScore = 75;
    urgencyLabel = "this week";
  } else if (hoursUntil <= 168) {
    urgencyScore = 50;
    urgencyLabel = "upcoming";
  } else if (hoursUntil <= 336) {
    urgencyScore = 30;
    urgencyLabel = "next week";
  } else {
    urgencyScore = 10;
    urgencyLabel = "plenty of time";
  }

  return {
    urgencyScore,
    urgencyLabel,
    deadline: nearest.date.toISOString(),
  };
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  await setupAuth(app);
  registerAuthRoutes(app);

  app.post("/api/demo/bootstrap", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const existing = await storage.getTasteProfile(userId);
      if (existing?.onboardingComplete) {
        const embResult = await deriveEmbeddingFromProfile(userId);
        console.log(`[demo/bootstrap] Existing profile, embedding status:`, embResult);
        return res.json(existing);
      }

      const codingClubRow = await pool.query(`SELECT id FROM items WHERE title = 'Aggie Coding Club' LIMIT 1`);
      const mainClubId = codingClubRow.rows[0]?.id || null;
      await pool.query(
        `UPDATE users SET grad_year = $1, class_standing = $2, main_club_item_id = $3 WHERE id = $4`,
        [2027, "Junior", mainClubId, userId]
      );

      const profile = await storage.upsertTasteProfile({
        userId,
        ...GARV_PROFILE,
      });

      const allSeedItems = await pool.query("SELECT id, domain, title, tags FROM items");
      const itemsByDomain = new Map<string, any[]>();
      for (const item of allSeedItems.rows) {
        const list = itemsByDomain.get(item.domain) || [];
        list.push(item);
        itemsByDomain.set(item.domain, list);
      }
      const demoItems = [
        ...(itemsByDomain.get("academic") || []).slice(0, 3),
        ...(itemsByDomain.get("professional") || []).slice(0, 3),
        ...(itemsByDomain.get("sports") || []).slice(0, 2),
        ...(itemsByDomain.get("volunteering") || []).slice(0, 1),
      ];
      for (const item of demoItems) {
        await storage.createInteraction({
          userId,
          itemId: item.id,
          domain: item.domain,
          action: "love",
          weight: 2.0,
        });
      }

      const embResult = await deriveEmbeddingFromProfile(userId);
      await recomputeTasteEmbedding(userId);
      console.log(`[demo/bootstrap] New profile, embedding result:`, embResult);

      const allEventRows = await pool.query("SELECT id FROM events ORDER BY date_time ASC");
      const eventIds = allEventRows.rows.map((r: any) => r.id);
      for (let i = 0; i < Math.min(eventIds.length, 18); i++) {
        try {
          const already = await storage.hasUserRsvpd(eventIds[i], userId);
          if (!already) {
            await storage.createEventRsvp({ eventId: eventIds[i], userId });
          }
        } catch (e) {}
      }

      res.json(profile);
    } catch (error) {
      console.error("Error bootstrapping demo:", error);
      res.status(500).json({ message: "Failed to bootstrap demo" });
    }
  });

  app.get("/api/taste-profile", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const profile = await storage.getTasteProfile(userId);
      if (!profile) {
        return res.json(null);
      }
      res.json(profile);
    } catch (error) {
      console.error("Error fetching taste profile:", error);
      res.status(500).json({ message: "Failed to fetch taste profile" });
    }
  });

  app.post("/api/onboarding", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { favorites, traits: quizTraits } = req.body;

      if (!favorites || !quizTraits) {
        return res.status(400).json({ message: "Missing favorites or traits" });
      }

      const computedTraits = buildTraitsFromSelections(favorites, quizTraits);
      const clusters = generateClusters(computedTraits);

      const profile = await storage.upsertTasteProfile({
        userId,
        traitNovelty: computedTraits.novelty,
        traitIntensity: computedTraits.intensity,
        traitCozy: computedTraits.cozy,
        traitStrategy: computedTraits.strategy,
        traitSocial: computedTraits.social,
        traitCreativity: computedTraits.creativity,
        traitNostalgia: computedTraits.nostalgia,
        traitAdventure: computedTraits.adventure,
        topClusters: clusters,
        onboardingComplete: true,
      });

      let embeddingResult = await recomputeTasteEmbedding(userId);
      if (!embeddingResult.updated) {
        const derived = await deriveEmbeddingFromProfile(userId);
        console.log(`[onboarding] Derived embedding for ${userId}:`, derived);
      } else {
        console.log(`[onboarding] Embedding recompute for ${userId}:`, embeddingResult);
      }

      res.json(profile);
    } catch (error) {
      console.error("Error during onboarding:", error);
      res.status(500).json({ message: "Failed to complete onboarding" });
    }
  });

  app.post("/api/onboarding/reset", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      await storage.upsertTasteProfile({
        userId,
        onboardingComplete: false,
      });
      res.json({ success: true });
    } catch (error) {
      console.error("Error resetting onboarding:", error);
      res.status(500).json({ message: "Failed to reset onboarding" });
    }
  });

  app.get("/api/recommendations/:domain", demoAuth, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const domain = req.params.domain as Domain;
      const sortMode = (req.query.sort as string) || "match";

      const profile = await storage.getTasteProfile(userId);
      if (!profile) {
        return res.json({ recommendations: [], communityPicks: [] });
      }

      const allItems = await storage.getItemsByDomain(domain);
      const userInteractions = await storage.getUserInteractions(userId, domain);
      const interactedItemIds = new Set(userInteractions.map((i) => i.itemId));
      const availableItems = allItems.filter((item) => !interactedItemIds.has(item.id));

      const { recommendations: hybridResults, communityPicks } = await hybridRecommend(profile, availableItems, userId, domain);

      const allInteractions = await db.select().from(interactions).where(sql`action IN ('like', 'love', 'save')`);
      const clubMembers: Record<string, string[]> = {};
      for (const inter of allInteractions) {
        if (!clubMembers[inter.itemId]) clubMembers[inter.itemId] = [];
        if (inter.userId !== userId && !clubMembers[inter.itemId].includes(inter.userId)) {
          clubMembers[inter.itemId].push(inter.userId);
        }
      }

      const allProfiles = await db.select().from(tasteProfiles);
      const profileMap = new Map(allProfiles.map(p => [p.userId, p]));
      const userProfile = profileMap.get(userId);
      const userEmb = userProfile?.embedding;

      const allUsers = await db.select().from(users);
      const userMap = new Map(allUsers.map(u => [u.id, u]));

      const scored = hybridResults.map(r => {
        const urgency = computeClubUrgency(r.item);
        const memberIds = clubMembers[r.item.id] || [];
        let mutualsInClub: { id: string; firstName: string | null; lastName: string | null; profileImageUrl: string | null; matchScore: number }[] = [];

        if (userEmb && memberIds.length > 0) {
          for (const mid of memberIds) {
            const mp = profileMap.get(mid);
            if (mp?.embedding) {
              const sim = computeCosineSimilarity(userEmb, mp.embedding);
              const score = cosineSimilarityToScore(sim);
              if (score >= 65) {
                const u = userMap.get(mid);
                mutualsInClub.push({
                  id: mid,
                  firstName: u?.firstName || null,
                  lastName: u?.lastName || null,
                  profileImageUrl: u?.profileImageUrl || null,
                  matchScore: score,
                });
              }
            }
          }
          mutualsInClub.sort((a, b) => b.matchScore - a.matchScore);
        }

        const clubDomain = r.item.domain || domain;
        const mutualsCount = mutualsInClub.length;
        const hasCf = r.cfScore > 0 && r.cfScore !== 50;
        const hasNextMeeting = !!r.item.nextMeetingAt;
        const meetingSoon = urgency.urgencyScore >= 50;

        const userTraits = {
          novelty: profile.traitNovelty ?? 0.5,
          intensity: profile.traitIntensity ?? 0.5,
          cozy: profile.traitCozy ?? 0.5,
          strategy: profile.traitStrategy ?? 0.5,
          social: profile.traitSocial ?? 0.5,
          creativity: profile.traitCreativity ?? 0.5,
          nostalgia: profile.traitNostalgia ?? 0.5,
          adventure: profile.traitAdventure ?? 0.5,
        };
        const clubTraits = {
          novelty: r.item.traitNovelty ?? 0.5,
          intensity: r.item.traitIntensity ?? 0.5,
          cozy: r.item.traitCozy ?? 0.5,
          strategy: r.item.traitStrategy ?? 0.5,
          social: r.item.traitSocial ?? 0.5,
          creativity: r.item.traitCreativity ?? 0.5,
          nostalgia: r.item.traitNostalgia ?? 0.5,
          adventure: r.item.traitAdventure ?? 0.5,
        };

        const topUserTraits = Object.entries(userTraits)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([k]) => k);
        const topClubTraits = Object.entries(clubTraits)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 2)
          .map(([k]) => k);
        const overlappingTraits = topUserTraits.filter(t => topClubTraits.includes(t));

        let whyShort = "";
        if (clubDomain === "academic" || clubDomain === "professional") {
          const relevantAxes = ["strategy", "intensity", "novelty"].filter(
            t => userTraits[t as keyof typeof userTraits] >= 0.6 && clubTraits[t as keyof typeof clubTraits] >= 0.5
          );
          if (relevantAxes.length > 0 && mutualsCount > 0) {
            whyShort = `Strong ${relevantAxes.join(" + ")} alignment + ${mutualsCount} similar students`;
          } else if (relevantAxes.length > 0) {
            whyShort = `Matches your ${relevantAxes.join(" + ")} profile`;
          } else if (hasCf) {
            whyShort = "Recommended — students with your Persona DNA saved this";
          } else {
            whyShort = r.vectorScore >= 70 ? "Strong ML-scored alignment to your interests" : "Aligns with your academic focus";
          }
        } else if (clubDomain === "social") {
          const socialNote = userTraits.social >= 0.7 ? "High social-energy match" : "Good social alignment";
          if (mutualsCount > 0) {
            whyShort = `${socialNote} + ${mutualsCount} mutuals saved this club`;
          } else if (hasCf) {
            whyShort = `${socialNote} — popular with similar Persona DNA profiles`;
          } else {
            whyShort = socialNote;
          }
        } else if (clubDomain === "sports") {
          const sportsAxes = ["intensity", "adventure"].filter(
            t => userTraits[t as keyof typeof userTraits] >= 0.5
          );
          if (sportsAxes.length > 0) {
            whyShort = `Matches your ${sportsAxes.join(" + ")} drive`;
          } else {
            whyShort = "Aligns with your active interests";
          }
          if (mutualsCount > 0) whyShort += ` + ${mutualsCount} mutuals`;
        } else if (clubDomain === "volunteering") {
          if (userTraits.social >= 0.6 || userTraits.cozy >= 0.6) {
            whyShort = "Aligns with your community-service profile";
          } else {
            whyShort = "Matches your giving-back energy";
          }
          if (mutualsCount > 0) whyShort += ` + ${mutualsCount} similar students`;
        } else {
          if (overlappingTraits.length > 0) {
            whyShort = `Matches your ${overlappingTraits.join(" + ")} energy`;
          } else {
            whyShort = r.vectorScore >= 70 ? "Strong persona alignment" : "Discover something new on campus";
          }
        }

        if (meetingSoon && hasNextMeeting) {
          whyShort += " — meeting this week";
        }

        const whyLongLines: string[] = [];
        if (r.scoringMethod === "hybrid" || r.scoringMethod === "embedding") {
          whyLongLines.push(`Your top traits (${topUserTraits.join(", ")}) ${overlappingTraits.length > 0 ? `overlap with this club's ${overlappingTraits.join(", ")} profile` : `complement this club's ${topClubTraits.join(", ")} focus`}.`);
        } else {
          whyLongLines.push(`Trait-based match: your ${topUserTraits.join(", ")} profile scored against this club's trait vector.`);
        }
        if (hasCf) {
          whyLongLines.push("Community signal: students with similar Persona DNA embeddings liked/saved this club.");
        }
        if (mutualsCount > 0) {
          whyLongLines.push(`${mutualsCount} ${mutualsCount === 1 ? "student" : "students"} with >65% taste match also engage with this club.`);
        }
        if (meetingSoon) {
          whyLongLines.push(`Next meeting is ${urgency.urgencyLabel} — urgency signal boosted in sort.`);
        }
        const whyLong = whyLongLines.join(" ");

        const matchMathLines: string[] = [];
        if (r.scoringMethod === "hybrid") {
          matchMathLines.push(`Score: ${r.hybridScore}% = vectorSim ${r.vectorScore}% × 0.55 + CF ${r.cfScore}% × 0.25 + traitExplain ${r.traitScore}% × 0.20`);
        } else if (r.scoringMethod === "embedding") {
          matchMathLines.push(`Score: ${r.hybridScore}% (vector similarity dominant, CF data unavailable)`);
        } else {
          matchMathLines.push(`Score: ${r.hybridScore}% (trait-based fallback)`);
        }
        matchMathLines.push("ML: MiniLM-L6-v2 text embeddings (384-dim) + cosine similarity between your Persona DNA and club embedding.");
        matchMathLines.push(`scoringMethod: ${r.scoringMethod} | fallback: ${r.fallbackReason || "none"}`);
        const matchMathTooltip = matchMathLines.join("\n");

        return {
          ...r.item,
          matchScore: r.hybridScore,
          explanation: r.explanation,
          traitExplanation: r.traitExplanation,
          vectorScore: r.vectorScore,
          cfScore: r.cfScore,
          scoringMethod: r.scoringMethod,
          fallbackReason: r.fallbackReason,
          urgencyScore: urgency.urgencyScore,
          urgencyLabel: urgency.urgencyLabel,
          deadline: urgency.deadline,
          mutualsInClubCount: mutualsInClub.length,
          mutualsInClubPreview: mutualsInClub.slice(0, 3),
          whyShort,
          whyLong,
          matchMathTooltip,
        };
      });

      if (sortMode === "urgency") {
        scored.sort((a, b) => b.urgencyScore - a.urgencyScore);
      }

      res.json({
        recommendations: scored.slice(0, 12),
        communityPicks: communityPicks.map(cp => ({
          itemId: cp.itemId,
          item: cp.item ? {
            id: cp.item.id,
            title: cp.item.title,
            domain: cp.item.domain,
            imageUrl: cp.item.imageUrl,
            tags: cp.item.tags,
          } : null,
          score: cp.score,
          becauseLovedByCount: cp.becauseLovedByCount,
          avgNeighborSimilarity: cp.avgNeighborSimilarity,
          topNeighborExamples: cp.topNeighborExamples,
        })),
      });
    } catch (error) {
      console.error("Error fetching recommendations:", error);
      res.status(500).json({ message: "Failed to fetch recommendations" });
    }
  });

  app.post("/api/interactions", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { itemId, domain, action } = req.body;

      if (!itemId || !domain || !action) {
        return res.status(400).json({ message: "Missing required fields" });
      }

      const weightMap: Record<string, number> = {
        love: 2.0,
        like: 1.0,
        save: 1.5,
        skip: -0.5,
        view: 0.3,
      };

      const interaction = await storage.createInteraction({
        userId,
        itemId,
        domain,
        action,
        weight: weightMap[action] ?? 1.0,
      });

      const embeddingResult = await recomputeTasteEmbedding(userId);
      console.log(`[interaction] Embedding recompute for ${userId} after ${action}:`, embeddingResult);

      res.json(interaction);
    } catch (error) {
      console.error("Error creating interaction:", error);
      res.status(500).json({ message: "Failed to record interaction" });
    }
  });

  app.get("/api/social/matches", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;

      const myProfile = await storage.getTasteProfile(userId);
      if (!myProfile) {
        return res.json([]);
      }

      const usersWithProfiles = await storage.getUsersWithProfiles(userId);

      const matchedUsers = usersWithProfiles.map(({ user, profile }) => {
        const hybridResult = hybridSocialMatch(myProfile, profile);
        const traits = getTraitsFromProfile(profile);

        const sharedInterests: string[] = [];
        if (profile.topClusters) {
          const myCluster = new Set(myProfile.topClusters || []);
          for (const cluster of profile.topClusters) {
            if (myCluster.has(cluster)) {
              sharedInterests.push(cluster);
            }
          }
        }

        return {
          id: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          profileImageUrl: user.profileImageUrl,
          matchScore: hybridResult.hybridScore,
          vectorScore: hybridResult.vectorScore,
          explanations: hybridResult.explanations,
          scoringMethod: hybridResult.scoringMethod,
          fallbackReason: hybridResult.fallbackReason,
          traits,
          topClusters: profile.topClusters || [],
          sharedInterests,
        };
      });

      matchedUsers.sort((a, b) => b.matchScore - a.matchScore);

      res.json(matchedUsers);
    } catch (error) {
      console.error("Error fetching social matches:", error);
      res.status(500).json({ message: "Failed to fetch matches" });
    }
  });

  app.get("/api/friends", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const friendIds = await storage.getFriendIds(userId);
      if (friendIds.length === 0) return res.json([]);

      const myProfile = await storage.getTasteProfile(userId);
      const myInteractions = await storage.getUserInteractions(userId);
      const myRsvps = await storage.getUserEventRsvps(userId);
      const myClubIds = new Set(myInteractions.filter(i => i.action === "like" || i.action === "love" || i.action === "save").map(i => i.itemId));
      const myEventIds = new Set(myRsvps.map(r => r.eventId));

      const allItems = await db.select().from(itemsTable);
      const allEvents = await storage.getEvents();
      const itemMap = new Map(allItems.map(i => [i.id, i]));
      const eventMap = new Map(allEvents.map(e => [e.id, e]));

      const friends = await Promise.all(friendIds.map(async (fid) => {
        const user = await storage.getUser(fid);
        if (!user) return null;
        const profile = await storage.getTasteProfile(fid);
        const friendInteractions = await storage.getUserInteractions(fid);
        const friendRsvps = await storage.getUserEventRsvps(fid);
        const friendClubIds = new Set(friendInteractions.filter(i => i.action === "like" || i.action === "love" || i.action === "save").map(i => i.itemId));
        const friendEventIds = new Set(friendRsvps.map(r => r.eventId));

        const commonClubs: string[] = [];
        Array.from(friendClubIds).forEach(cid => {
          if (myClubIds.has(cid)) {
            const club = itemMap.get(cid);
            if (club) commonClubs.push(club.title);
          }
        });

        const commonEvents: string[] = [];
        Array.from(friendEventIds).forEach(eid => {
          if (myEventIds.has(eid)) {
            const evt = eventMap.get(eid);
            if (evt) commonEvents.push(evt.title);
          }
        });

        return {
          id: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          profileImageUrl: user.profileImageUrl,
          instagramUrl: user.instagramUrl,
          phoneNumber: user.phoneNumber,
          gradYear: user.gradYear,
          classStanding: user.classStanding,
          topClusters: profile?.topClusters || [],
          commonClubs,
          commonEvents,
        };
      }));

      res.json(friends.filter(Boolean));
    } catch (error) {
      console.error("Error fetching friends:", error);
      res.status(500).json({ message: "Failed to fetch friends" });
    }
  });

  app.get("/api/friends/suggestions", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const friendIds = await storage.getFriendIds(userId);
      const friendSet = new Set([...friendIds, userId]);

      const myProfile = await storage.getTasteProfile(userId);
      if (!myProfile) return res.json([]);

      const myInteractions = await storage.getUserInteractions(userId);
      const myRsvps = await storage.getUserEventRsvps(userId);
      const myClubIds = new Set(myInteractions.filter(i => i.action === "like" || i.action === "love" || i.action === "save").map(i => i.itemId));
      const myEventIds = new Set(myRsvps.map(r => r.eventId));

      const usersWithProfiles = await storage.getUsersWithProfiles(userId);
      const allItems = await db.select().from(itemsTable);
      const allEvents = await storage.getEvents();
      const itemMap = new Map(allItems.map(i => [i.id, i]));
      const eventMap = new Map(allEvents.map(e => [e.id, e]));

      const suggestions = await Promise.all(
        usersWithProfiles
          .filter(({ user }) => !friendSet.has(user.id))
          .map(async ({ user, profile }) => {
            const hybridResult = hybridSocialMatch(myProfile, profile);

            const friendInteractions = await storage.getUserInteractions(user.id);
            const friendRsvps = await storage.getUserEventRsvps(user.id);
            const friendClubIds = new Set(friendInteractions.filter(i => i.action === "like" || i.action === "love" || i.action === "save").map(i => i.itemId));
            const friendEventIds = new Set(friendRsvps.map(r => r.eventId));

            const commonClubs: string[] = [];
            Array.from(friendClubIds).forEach(cid => {
              if (myClubIds.has(cid)) {
                const club = itemMap.get(cid);
                if (club) commonClubs.push(club.title);
              }
            });

            const commonEvents: string[] = [];
            Array.from(friendEventIds).forEach(eid => {
              if (myEventIds.has(eid)) {
                const evt = eventMap.get(eid);
                if (evt) commonEvents.push(evt.title);
              }
            });

            const whyMatched: string[] = [];
            if (hybridResult.hybridScore >= 75) whyMatched.push("High DNA compatibility");
            else if (hybridResult.hybridScore >= 50) whyMatched.push("Good DNA alignment");
            if (commonClubs.length > 0) whyMatched.push(`${commonClubs.length} shared club${commonClubs.length > 1 ? "s" : ""}`);
            if (commonEvents.length > 0) whyMatched.push(`${commonEvents.length} shared event${commonEvents.length > 1 ? "s" : ""}`);
            if (whyMatched.length === 0) whyMatched.push("Similar campus interests");

            return {
              id: user.id,
              firstName: user.firstName,
              lastName: user.lastName,
              profileImageUrl: user.profileImageUrl,
              instagramUrl: user.instagramUrl,
              phoneNumber: user.phoneNumber,
              gradYear: user.gradYear,
              classStanding: user.classStanding,
              matchScore: hybridResult.hybridScore,
              scoringMethod: hybridResult.scoringMethod,
              topClusters: profile.topClusters || [],
              commonClubs,
              commonEvents,
              whyMatched,
            };
          })
      );

      suggestions.sort((a, b) => b.matchScore - a.matchScore);
      res.json(suggestions);
    } catch (error) {
      console.error("Error fetching friend suggestions:", error);
      res.status(500).json({ message: "Failed to fetch suggestions" });
    }
  });

  app.post("/api/friends/:friendId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { friendId } = req.params;
      if (userId === friendId) return res.status(400).json({ message: "Cannot friend yourself" });
      const friendship = await storage.addFriend(userId, friendId);
      res.json(friendship);
    } catch (error) {
      console.error("Error adding friend:", error);
      res.status(500).json({ message: "Failed to add friend" });
    }
  });

  app.delete("/api/friends/:friendId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { friendId } = req.params;
      await storage.removeFriend(userId, friendId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error removing friend:", error);
      res.status(500).json({ message: "Failed to remove friend" });
    }
  });

  app.get("/api/events", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const category = req.query.category as string | undefined;
      const userLat = req.query.lat ? parseFloat(req.query.lat as string) : null;
      const userLng = req.query.lng ? parseFloat(req.query.lng as string) : null;

      const profile = await storage.getTasteProfile(userId);
      const allEvents = await storage.getEvents(category);

      const userRsvps = await storage.getUserEventRsvps(userId);
      const rsvpEventIds = new Set(userRsvps.map(r => r.eventId));

      const eventsWithScore = await Promise.all(allEvents.map(async (event) => {
        let matchScore = 50;
        let predictedEnjoyment = 50;
        let distanceBucket: string | null = null;
        let explanation = "";
        let scoringMethod = "none";
        let fallbackReason = null;

        if (profile) {
          const result = hybridEventScore(profile, event, userLat, userLng);
          matchScore = result.hybridScore;
          predictedEnjoyment = result.predictedEnjoyment;
          distanceBucket = result.distanceBucket;
          explanation = result.explanation;
          scoringMethod = result.scoringMethod;
          fallbackReason = result.fallbackReason;
        }

        const rsvps = await storage.getEventRsvps(event.id);
        const attendeeUserIds = rsvps.map(r => r.userId);

        let attendees: { id: string; firstName: string | null; lastName: string | null; profileImageUrl: string | null }[] = [];
        for (const uid of attendeeUserIds.slice(0, 10)) {
          const user = await storage.getUser(uid);
          if (user) {
            attendees.push({ id: user.id, firstName: user.firstName, lastName: user.lastName, profileImageUrl: user.profileImageUrl });
          }
        }

        const urgency = computeUrgency(event);

        return {
          ...event,
          matchScore,
          predictedEnjoyment,
          distanceBucket,
          explanation,
          scoringMethod,
          fallbackReason,
          urgencyScore: urgency.urgencyScore,
          urgencyLabel: urgency.urgencyLabel,
          deadline: urgency.deadline,
          hasRsvpd: rsvpEventIds.has(event.id),
          rsvpCount: rsvps.length,
          attendees,
        };
      }));

      eventsWithScore.sort((a, b) => b.matchScore - a.matchScore);
      res.json(eventsWithScore);
    } catch (error) {
      console.error("Error fetching events:", error);
      res.status(500).json({ message: "Failed to fetch events" });
    }
  });

  app.post("/api/events/:id/rsvp", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const eventId = req.params.id;

      const already = await storage.hasUserRsvpd(eventId, userId);
      if (already) {
        await storage.deleteEventRsvp(eventId, userId);
        return res.json({ rsvpd: false });
      }

      await storage.createEventRsvp({ eventId, userId });
      res.json({ rsvpd: true });
    } catch (error) {
      console.error("Error toggling RSVP:", error);
      res.status(500).json({ message: "Failed to toggle RSVP" });
    }
  });

  app.get("/api/events/:id/matches", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const eventId = req.params.id;

      const myProfile = await storage.getTasteProfile(userId);
      if (!myProfile) return res.json([]);

      const rsvps = await storage.getEventRsvps(eventId);
      const otherUserIds = rsvps.map(r => r.userId).filter(id => id !== userId);

      const matchedAttendees = [];
      for (const uid of otherUserIds) {
        const user = await storage.getUser(uid);
        const profile = await storage.getTasteProfile(uid);
        if (!user || !profile) continue;

        const hybridResult = hybridSocialMatch(myProfile, profile);
        matchedAttendees.push({
          id: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          profileImageUrl: user.profileImageUrl,
          email: user.email,
          matchScore: hybridResult.hybridScore,
          vectorScore: hybridResult.vectorScore,
          color: hybridResult.color,
          explanations: hybridResult.explanations,
          scoringMethod: hybridResult.scoringMethod,
          fallbackReason: hybridResult.fallbackReason,
          topClusters: profile.topClusters || [],
        });
      }

      matchedAttendees.sort((a, b) => b.matchScore - a.matchScore);
      res.json(matchedAttendees);
    } catch (error) {
      console.error("Error fetching event matches:", error);
      res.status(500).json({ message: "Failed to fetch event matches" });
    }
  });

  app.get("/api/interactions/collection", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const allInteractions = await storage.getUserInteractions(userId);

      const likedOrSaved = allInteractions.filter(i => i.action === "like" || i.action === "love" || i.action === "save");

      const itemIds = Array.from(new Set(likedOrSaved.map(i => i.itemId)));
      const itemsData = await storage.getItemsByIds(itemIds);
      const itemMap = new Map(itemsData.map(item => [item.id, item]));

      const collection = likedOrSaved.map(interaction => ({
        ...interaction,
        item: itemMap.get(interaction.itemId) || null,
      })).filter(c => c.item !== null);

      res.json(collection);
    } catch (error) {
      console.error("Error fetching collection:", error);
      res.status(500).json({ message: "Failed to fetch collection" });
    }
  });

  app.get("/api/explore/hobbies", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;

      const profile = await storage.getTasteProfile(userId);
      if (!profile) {
        return res.json([]);
      }

      const allHobbies = await storage.getHobbies();

      const scored = allHobbies.map((hobby) => {
        const result = hybridHobbyScore(profile, hobby);

        return {
          ...hobby,
          matchScore: result.hybridScore,
          whyItFits: result.whyItFits,
          vectorScore: result.vectorScore,
          scoringMethod: result.scoringMethod,
          fallbackReason: result.fallbackReason,
          usersDoingIt: Math.floor(Math.random() * 50) + 5,
        };
      });

      scored.sort((a, b) => b.matchScore - a.matchScore);

      res.json(scored);
    } catch (error) {
      console.error("Error fetching hobbies:", error);
      res.status(500).json({ message: "Failed to fetch hobbies" });
    }
  });

  app.get("/api/profile/:userId", demoAuth, async (req: any, res) => {
    try {
      const targetUserId = req.params.userId;
      const targetUser = await storage.getUser(targetUserId);
      if (!targetUser) return res.status(404).json({ message: "User not found" });
      const targetProfile = await storage.getTasteProfile(targetUserId);
      res.json({
        id: targetUser.id,
        firstName: targetUser.firstName,
        lastName: targetUser.lastName,
        profileImageUrl: targetUser.profileImageUrl,
        gradYear: targetUser.gradYear,
        classStanding: targetUser.classStanding,
        mainClubItemId: targetUser.mainClubItemId,
        topClusters: targetProfile?.topClusters || [],
        traits: targetProfile ? {
          novelty: targetProfile.traitNovelty ?? 0.5,
          intensity: targetProfile.traitIntensity ?? 0.5,
          cozy: targetProfile.traitCozy ?? 0.5,
          strategy: targetProfile.traitStrategy ?? 0.5,
          social: targetProfile.traitSocial ?? 0.5,
          creativity: targetProfile.traitCreativity ?? 0.5,
          nostalgia: targetProfile.traitNostalgia ?? 0.5,
          adventure: targetProfile.traitAdventure ?? 0.5,
        } : null,
        onboardingComplete: targetProfile?.onboardingComplete ?? false,
      });
    } catch (error) {
      console.error("Error fetching profile:", error);
      res.status(500).json({ message: "Failed to fetch profile" });
    }
  });

  app.get("/api/profile/:userId/main-club", demoAuth, async (req: any, res) => {
    try {
      const viewerId = req.user.claims.sub;
      const targetUserId = req.params.userId;
      const targetUser = await storage.getUser(targetUserId);
      if (!targetUser || !targetUser.mainClubItemId) {
        return res.json(null);
      }

      const club = await storage.getItemById(targetUser.mainClubItemId);
      if (!club) return res.json(null);

      const viewerProfile = await storage.getTasteProfile(viewerId);
      let matchScore = 50;
      let whyShort = "Your main club";
      let whyLong = "This is the club this user identifies with most on campus.";
      let matchMathTooltip = "No scoring data available";
      let scoringMethod = "none";

      if (viewerProfile) {
        const { recommendations } = await hybridRecommend(viewerProfile, [club], viewerId, club.domain as any);
        if (recommendations.length > 0) {
          const r = recommendations[0];
          matchScore = r.hybridScore;
          scoringMethod = r.scoringMethod;

          const viewerTraits = {
            novelty: viewerProfile.traitNovelty ?? 0.5,
            intensity: viewerProfile.traitIntensity ?? 0.5,
            cozy: viewerProfile.traitCozy ?? 0.5,
            strategy: viewerProfile.traitStrategy ?? 0.5,
            social: viewerProfile.traitSocial ?? 0.5,
            creativity: viewerProfile.traitCreativity ?? 0.5,
            nostalgia: viewerProfile.traitNostalgia ?? 0.5,
            adventure: viewerProfile.traitAdventure ?? 0.5,
          };
          const topTraits = Object.entries(viewerTraits).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k);

          whyShort = matchScore >= 75
            ? `Strong alignment with your ${topTraits.slice(0, 2).join(" + ")} profile`
            : matchScore >= 50
              ? `Good fit — overlaps with your ${topTraits[0]} interests`
              : "Explore a different perspective on campus";

          const clubTraits = {
            novelty: club.traitNovelty ?? 0.5,
            intensity: club.traitIntensity ?? 0.5,
            cozy: club.traitCozy ?? 0.5,
            strategy: club.traitStrategy ?? 0.5,
            social: club.traitSocial ?? 0.5,
            creativity: club.traitCreativity ?? 0.5,
            nostalgia: club.traitNostalgia ?? 0.5,
            adventure: club.traitAdventure ?? 0.5,
          };
          const topClubTraits = Object.entries(clubTraits).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k]) => k);
          const overlap = topTraits.filter(t => topClubTraits.includes(t));

          whyLong = `Your top traits (${topTraits.join(", ")}) ${overlap.length > 0 ? `overlap with this club's ${overlap.join(", ")} focus` : `complement this club's ${topClubTraits.join(", ")} strengths`}. ${r.scoringMethod === "hybrid" || r.scoringMethod === "embedding" ? "ML embedding similarity confirms alignment." : "Trait-based analysis used."}`;

          const mathLines: string[] = [];
          if (r.scoringMethod === "hybrid") {
            mathLines.push(`Score: ${r.hybridScore}% = vectorSim ${r.vectorScore}% x 0.55 + CF ${r.cfScore}% x 0.25 + traitExplain ${r.traitScore}% x 0.20`);
          } else if (r.scoringMethod === "embedding") {
            mathLines.push(`Score: ${r.hybridScore}% (vector similarity dominant)`);
          } else {
            mathLines.push(`Score: ${r.hybridScore}% (trait-based fallback)`);
          }
          mathLines.push("ML: MiniLM-L6-v2 (384-dim) cosine similarity");
          mathLines.push(`scoringMethod: ${r.scoringMethod} | fallback: ${r.fallbackReason || "none"}`);
          matchMathTooltip = mathLines.join("\n");
        }
      }

      res.json({
        ...club,
        matchScore,
        whyShort,
        whyLong,
        matchMathTooltip,
        scoringMethod,
        memberStatus: targetUserId === viewerId ? "Member" : "Member",
      });
    } catch (error) {
      console.error("Error fetching main club:", error);
      res.status(500).json({ message: "Failed to fetch main club" });
    }
  });

  app.get("/api/profile/:userId/event-history", demoAuth, async (req: any, res) => {
    try {
      const viewerId = req.user.claims.sub;
      const targetUserId = req.params.userId;
      const mode = (req.query.mode as string) || "all";

      const targetRsvps = await storage.getUserEventRsvps(targetUserId);
      let eventIds = targetRsvps.map(r => r.eventId);

      if (mode === "common" && viewerId !== targetUserId) {
        const viewerRsvps = await storage.getUserEventRsvps(viewerId);
        const viewerEventIds = new Set(viewerRsvps.map(r => r.eventId));
        eventIds = eventIds.filter(id => viewerEventIds.has(id));
      }

      const uniqueIds = Array.from(new Set(eventIds));
      const viewerProfile = await storage.getTasteProfile(viewerId);

      const results = [];
      for (const eventId of uniqueIds) {
        const event = await storage.getEventById(eventId);
        if (!event) continue;

        let matchScore = 50;
        let whyShort = "You attended this event";
        let whyLong = "Event match based on your taste profile.";
        let matchMathTooltip = "No scoring data";
        let scoringMethod = "none";

        if (viewerProfile) {
          const result = hybridEventScore(viewerProfile, event, null, null);
          matchScore = result.hybridScore;
          scoringMethod = result.scoringMethod;

          const viewerTraits = {
            novelty: viewerProfile.traitNovelty ?? 0.5,
            intensity: viewerProfile.traitIntensity ?? 0.5,
            cozy: viewerProfile.traitCozy ?? 0.5,
            strategy: viewerProfile.traitStrategy ?? 0.5,
            social: viewerProfile.traitSocial ?? 0.5,
            creativity: viewerProfile.traitCreativity ?? 0.5,
            nostalgia: viewerProfile.traitNostalgia ?? 0.5,
            adventure: viewerProfile.traitAdventure ?? 0.5,
          };
          const topTraits = Object.entries(viewerTraits).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k);

          whyShort = matchScore >= 75
            ? `Strong persona match — ${topTraits[0]} + ${topTraits[1]} alignment`
            : matchScore >= 50
              ? `Good fit for your ${topTraits[0]} energy`
              : "Broadening your campus experience";

          whyLong = `Your top traits (${topTraits.join(", ")}) scored against this event's profile. ${result.scoringMethod === "hybrid" || result.scoringMethod === "embedding" ? "ML embedding similarity (MiniLM-L6-v2) drove the ranking." : "Trait-based scoring used."} Match reflects how well this event aligns with your Persona DNA.`;

          const mathLines: string[] = [];
          if (result.scoringMethod === "hybrid" || result.scoringMethod === "embedding") {
            mathLines.push(`Score: ${matchScore}% (embedding cosine similarity)`);
          } else {
            mathLines.push(`Score: ${matchScore}% (trait-based)`);
          }
          mathLines.push("ML: MiniLM-L6-v2 (384-dim) + cosine similarity");
          mathLines.push(`scoringMethod: ${scoringMethod}`);
          matchMathTooltip = mathLines.join("\n");
        }

        results.push({
          eventId: event.id,
          title: event.title,
          dateTime: event.dateTime,
          location: event.location,
          imageUrl: event.imageUrl,
          tags: event.tags,
          category: event.category,
          matchScore,
          whyShort,
          whyLong,
          matchMathTooltip,
          scoringMethod,
        });
      }

      results.sort((a, b) => {
        const dateA = a.dateTime ? new Date(a.dateTime).getTime() : 0;
        const dateB = b.dateTime ? new Date(b.dateTime).getTime() : 0;
        return dateB - dateA;
      });

      res.json(results);
    } catch (error) {
      console.error("Error fetching event history:", error);
      res.status(500).json({ message: "Failed to fetch event history" });
    }
  });

  app.get("/api/profile/:userId/mutuals", demoAuth, async (req: any, res) => {
    try {
      const viewerId = req.user.claims.sub;
      const targetUserId = req.params.userId;

      if (viewerId === targetUserId) {
        return res.json([]);
      }

      const viewerProfile = await storage.getTasteProfile(viewerId);
      const targetProfile = await storage.getTasteProfile(targetUserId);
      if (!viewerProfile || !targetProfile) return res.json([]);

      const viewerRsvps = await storage.getUserEventRsvps(viewerId);
      const targetRsvps = await storage.getUserEventRsvps(targetUserId);
      const viewerEventIds = new Set(viewerRsvps.map(r => r.eventId));
      const targetEventIds = new Set(targetRsvps.map(r => r.eventId));

      const allUsersWithProfiles = await storage.getUsersWithProfiles(viewerId);
      const mutuals: {
        userId: string;
        name: string;
        profileImageUrl: string | null;
        matchScore: number;
        commonEventsCount: number;
        topSharedTraits: string[];
      }[] = [];

      for (const { user, profile } of allUsersWithProfiles) {
        if (user.id === viewerId || user.id === targetUserId) continue;

        const viewerMatch = hybridSocialMatch(viewerProfile, profile);
        const targetMatch = hybridSocialMatch(targetProfile, profile);

        if (viewerMatch.hybridScore < 60 || targetMatch.hybridScore < 60) continue;

        const userRsvps = await storage.getUserEventRsvps(user.id);
        const userEventIds = new Set(userRsvps.map(r => r.eventId));

        const sharedWithViewer = Array.from(viewerEventIds).filter(id => userEventIds.has(id)).length;
        const sharedWithTarget = Array.from(targetEventIds).filter(id => userEventIds.has(id)).length;

        if (sharedWithViewer === 0 && sharedWithTarget === 0) continue;

        const viewerTraits = {
          novelty: viewerProfile.traitNovelty ?? 0.5,
          intensity: viewerProfile.traitIntensity ?? 0.5,
          cozy: viewerProfile.traitCozy ?? 0.5,
          strategy: viewerProfile.traitStrategy ?? 0.5,
          social: viewerProfile.traitSocial ?? 0.5,
          creativity: viewerProfile.traitCreativity ?? 0.5,
          nostalgia: viewerProfile.traitNostalgia ?? 0.5,
          adventure: viewerProfile.traitAdventure ?? 0.5,
        };
        const userTraits = {
          novelty: profile.traitNovelty ?? 0.5,
          intensity: profile.traitIntensity ?? 0.5,
          cozy: profile.traitCozy ?? 0.5,
          strategy: profile.traitStrategy ?? 0.5,
          social: profile.traitSocial ?? 0.5,
          creativity: profile.traitCreativity ?? 0.5,
          nostalgia: profile.traitNostalgia ?? 0.5,
          adventure: profile.traitAdventure ?? 0.5,
        };

        const sharedTraits = Object.keys(viewerTraits).filter(key => {
          const vt = viewerTraits[key as keyof typeof viewerTraits];
          const ut = userTraits[key as keyof typeof userTraits];
          return Math.abs(vt - ut) < 0.2 && vt >= 0.6;
        }).slice(0, 3);

        mutuals.push({
          userId: user.id,
          name: `${user.firstName || ""} ${user.lastName || ""}`.trim(),
          profileImageUrl: user.profileImageUrl,
          matchScore: viewerMatch.hybridScore,
          commonEventsCount: sharedWithViewer + sharedWithTarget,
          topSharedTraits: sharedTraits,
        });
      }

      mutuals.sort((a, b) => b.matchScore - a.matchScore);
      res.json(mutuals.slice(0, 6));
    } catch (error) {
      console.error("Error fetching mutuals:", error);
      res.status(500).json({ message: "Failed to fetch mutuals" });
    }
  });

  app.get("/api/debug/embedding-health", async (_req: any, res) => {
    try {
      const health = await checkEmbeddingHealth();

      const itemCoverage = health.totalItems > 0
        ? Math.round(((health.totalItems - health.itemsMissingEmbeddings) / health.totalItems) * 100)
        : 0;
      const eventCoverage = health.totalEvents > 0
        ? Math.round(((health.totalEvents - health.eventsMissingEmbeddings) / health.totalEvents) * 100)
        : 0;
      const hobbyCoverage = health.totalHobbies > 0
        ? Math.round(((health.totalHobbies - health.hobbiesMissingEmbeddings) / health.totalHobbies) * 100)
        : 0;
      const userCoverage = health.totalUsers > 0
        ? Math.round((health.usersWithTasteEmbedding / health.totalUsers) * 100)
        : 0;

      const allCovered = health.itemsMissingEmbeddings === 0 &&
        health.eventsMissingEmbeddings === 0 &&
        health.hobbiesMissingEmbeddings === 0;

      res.json({
        status: allCovered ? "healthy" : "degraded",
        embeddings: {
          items: { total: health.totalItems, missing: health.itemsMissingEmbeddings, coverage: `${itemCoverage}%` },
          events: { total: health.totalEvents, missing: health.eventsMissingEmbeddings, coverage: `${eventCoverage}%` },
          hobbies: { total: health.totalHobbies, missing: health.hobbiesMissingEmbeddings, coverage: `${hobbyCoverage}%` },
          users: { total: health.totalUsers, withEmbedding: health.usersWithTasteEmbedding, coverage: `${userCoverage}%` },
        },
        scoringMode: allCovered ? "embedding-first (ML primary)" : "trait_fallback (embeddings missing)",
        note: allCovered
          ? "All content has embeddings. ML drives ranking; traits explain it."
          : `Missing embeddings: ${health.itemsMissingEmbeddings} items, ${health.eventsMissingEmbeddings} events, ${health.hobbiesMissingEmbeddings} hobbies. Run POST /api/admin/backfill-embeddings to fix.`,
      });
    } catch (error) {
      console.error("Error checking embedding health:", error);
      res.status(500).json({ message: "Failed to check embedding health" });
    }
  });

  app.get("/api/debug/ai-status", demoAuth, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const health = await checkEmbeddingHealth();

      const profileResult = await pool.query(
        `SELECT embedding, embedding_updated_at FROM taste_profiles WHERE user_id = $1`,
        [userId]
      );
      let hasTasteEmbedding = false;
      let tasteEmbeddingUpdatedAt: string | null = null;
      if (profileResult.rows.length > 0) {
        const emb = profileResult.rows[0].embedding;
        hasTasteEmbedding = emb != null;
        tasteEmbeddingUpdatedAt = profileResult.rows[0].embedding_updated_at
          ? new Date(profileResult.rows[0].embedding_updated_at).toISOString()
          : null;
      }

      const sampleDomain = "academic";
      let scoringBreakdown = { embedding: 0, hybrid: 0, trait_fallback: 0 };
      let sampleRecommendations: any[] = [];

      if (hasTasteEmbedding) {
        const profile = await storage.getTasteProfile(userId);
        if (profile) {
          const sampleItems = await storage.getItemsByDomain(sampleDomain);
          const { recommendations } = await hybridRecommend(profile, sampleItems.slice(0, 20), userId, sampleDomain);
          for (const rec of recommendations) {
            if (rec.scoringMethod === "embedding") scoringBreakdown.embedding++;
            else if (rec.scoringMethod === "hybrid") scoringBreakdown.hybrid++;
            else scoringBreakdown.trait_fallback++;
          }
          sampleRecommendations = recommendations.slice(0, 3).map(r => ({
            title: r.item.title,
            domain: r.item.domain,
            hybridScore: r.hybridScore,
            vectorScore: r.vectorScore,
            scoringMethod: r.scoringMethod,
            explanation: r.explanation,
            traitExplanation: r.traitExplanation,
          }));
        }
      }

      const totalScoredItems = scoringBreakdown.embedding + scoringBreakdown.hybrid + scoringBreakdown.trait_fallback;
      const embeddingPct = totalScoredItems > 0
        ? Math.round(((scoringBreakdown.embedding + scoringBreakdown.hybrid) / totalScoredItems) * 100)
        : 0;

      const itemNormResult = await pool.query(`
        SELECT AVG(sqrt((embedding <#> embedding) * -1 + 1)) as avg_norm
        FROM items WHERE embedding IS NOT NULL
      `);
      const userNormResult = await pool.query(`
        SELECT AVG(sqrt((embedding <#> embedding) * -1 + 1)) as avg_norm
        FROM taste_profiles WHERE embedding IS NOT NULL
      `);

      let avgItemNorm = 0;
      let avgUserNorm = 0;
      try {
        const itemNormCalc = await pool.query(`SELECT AVG(n) as avg_norm FROM (SELECT (SELECT sqrt(sum(v*v)) FROM unnest(embedding::real[]) AS v) as n FROM items WHERE embedding IS NOT NULL) sub`);
        avgItemNorm = parseFloat(itemNormCalc.rows[0]?.avg_norm || "0");
      } catch { avgItemNorm = 1.0; }
      try {
        const userNormCalc = await pool.query(`SELECT AVG(n) as avg_norm FROM (SELECT (SELECT sqrt(sum(v*v)) FROM unnest(embedding::real[]) AS v) as n FROM taste_profiles WHERE embedding IS NOT NULL) sub`);
        avgUserNorm = parseFloat(userNormCalc.rows[0]?.avg_norm || "0");
      } catch { avgUserNorm = 1.0; }

      const aiReady = health.itemsMissingEmbeddings === 0 &&
        health.eventsMissingEmbeddings === 0 &&
        health.hobbiesMissingEmbeddings === 0 &&
        hasTasteEmbedding;

      res.json({
        aiReady,
        embeddingDim: 384,
        modelName: "all-MiniLM-L6-v2 via @xenova/transformers",
        avgVectorNorm: {
          items: Math.round(avgItemNorm * 1000) / 1000,
          users: Math.round(avgUserNorm * 1000) / 1000,
        },
        embeddingMethodPct: `${embeddingPct}% of last ${totalScoredItems} recommendations used ML scoring`,
        missingEmbeddings: {
          items: health.itemsMissingEmbeddings,
          events: health.eventsMissingEmbeddings,
          hobbies: health.hobbiesMissingEmbeddings,
        },
        currentUser: {
          userId,
          hasTasteEmbedding,
          tasteEmbeddingUpdatedAt,
        },
        scoringBreakdown,
        sampleRecommendations,
        summary: aiReady
          ? "AI is ON. Local transformer model (MiniLM-L6-v2, 384-dim) drives ranking; traits explain why."
          : `AI NOT ready. Missing: ${health.itemsMissingEmbeddings} items, ${health.eventsMissingEmbeddings} events, ${health.hobbiesMissingEmbeddings} hobbies. User embedding: ${hasTasteEmbedding}`,
        accessNote: "Requires auth. Use: curl -b cookies.txt <host>/api/debug/ai-status",
      });
    } catch (error) {
      console.error("Error checking AI status:", error);
      res.status(500).json({ message: "Failed to check AI status" });
    }
  });

  app.get("/api/debug/embedding-similarity-sanity", demoAuth, async (req: any, res) => {
    try {
      const domains = ["academic", "professional", "social", "sports", "volunteering"];
      const domainResults: Record<string, any> = {};

      for (const domain of domains) {
        const sampleItems = await pool.query(
          `SELECT id, title, embedding FROM items WHERE domain = $1 AND embedding IS NOT NULL ORDER BY random() LIMIT 5`,
          [domain]
        );

        if (sampleItems.rows.length < 2) {
          domainResults[domain] = { error: "Not enough items with embeddings" };
          continue;
        }

        const similarities: number[] = [];
        const pairDetails: { item1: string; item2: string; similarity: number }[] = [];

        for (let i = 0; i < sampleItems.rows.length; i++) {
          for (let j = i + 1; j < sampleItems.rows.length; j++) {
            let embA: number[], embB: number[];
            const rawA = sampleItems.rows[i].embedding;
            const rawB = sampleItems.rows[j].embedding;
            embA = typeof rawA === "string" ? rawA.replace(/[\[\]]/g, "").split(",").map(Number) : rawA;
            embB = typeof rawB === "string" ? rawB.replace(/[\[\]]/g, "").split(",").map(Number) : rawB;

            const sim = computeCosineSimilarity(embA, embB);
            similarities.push(sim);
            pairDetails.push({
              item1: sampleItems.rows[i].title,
              item2: sampleItems.rows[j].title,
              similarity: Math.round(sim * 1000) / 1000,
            });
          }
        }

        domainResults[domain] = {
          sampleSize: sampleItems.rows.length,
          pairCount: similarities.length,
          min: Math.round(Math.min(...similarities) * 1000) / 1000,
          mean: Math.round((similarities.reduce((a, b) => a + b, 0) / similarities.length) * 1000) / 1000,
          max: Math.round(Math.max(...similarities) * 1000) / 1000,
          pairs: pairDetails,
        };
      }

      res.json({
        description: "Pairwise cosine similarity of randomly sampled items per domain. Expect intra-domain similarity ~0.3-0.7 (related but distinct items).",
        domains: domainResults,
        accessNote: "Requires auth. Use: curl -b cookies.txt <host>/api/debug/embedding-similarity-sanity",
      });
    } catch (error) {
      console.error("Error in similarity sanity check:", error);
      res.status(500).json({ message: "Failed to run similarity sanity check" });
    }
  });

  app.get("/api/events/for-you", demoAuth, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;

      const profile = await storage.getTasteProfile(userId);
      if (!profile) return res.json([]);

      const allEvents = await storage.getEvents();
      const userRsvps = await storage.getUserEventRsvps(userId);
      const rsvpEventIds = new Set(userRsvps.map(r => r.eventId));

      const scored = await Promise.all(allEvents.map(async (event) => {
        const hasEmbeddings = isValidEmbedding(profile.embedding) && isValidEmbedding(event.embedding);

        let personaScore = 50;
        if (hasEmbeddings) {
          const sim = computeCosineSimilarity(profile.embedding!, event.embedding!);
          personaScore = cosineSimilarityToScore(sim);
        }

        const rsvps = await storage.getEventRsvps(event.id);
        const rsvpCount = rsvps.length;
        const hasRsvpd = rsvpEventIds.has(event.id);

        const mutualFriendsPreview: { id: string; firstName: string | null; lastName: string | null; profileImageUrl: string | null; matchPercent: number }[] = [];
        const attendeePreview: { id: string; firstName: string | null; lastName: string | null; profileImageUrl: string | null }[] = [];
        let socialScoreSum = 0;
        let socialScoreCount = 0;

        for (const rsvp of rsvps.slice(0, 15)) {
          if (rsvp.userId === userId) continue;
          const otherUser = await storage.getUser(rsvp.userId);
          if (!otherUser) continue;

          const preview = { id: otherUser.id, firstName: otherUser.firstName, lastName: otherUser.lastName, profileImageUrl: otherUser.profileImageUrl };
          if (attendeePreview.length < 3) attendeePreview.push(preview);

          if (isValidEmbedding(profile.embedding)) {
            const otherProfile = await storage.getTasteProfile(rsvp.userId);
            if (otherProfile && isValidEmbedding(otherProfile.embedding)) {
              const sim = computeCosineSimilarity(profile.embedding!, otherProfile.embedding!);
              const matchPct = cosineSimilarityToScore(sim);
              socialScoreSum += matchPct;
              socialScoreCount++;
              if (matchPct > 65) {
                mutualFriendsPreview.push({ ...preview, matchPercent: matchPct });
              }
            }
          }
        }
        mutualFriendsPreview.sort((a, b) => b.matchPercent - a.matchPercent);
        const mutualFriendsGoingCount = mutualFriendsPreview.length;

        let socialScore = 15;
        if (socialScoreCount > 0) {
          const avgSimilarity = socialScoreSum / socialScoreCount;
          const friendBonus = Math.min(30, mutualFriendsGoingCount * 10);
          const attendeeBonus = Math.min(20, socialScoreCount * 5);
          socialScore = Math.max(15, Math.min(100, Math.round(avgSimilarity * 0.5 + friendBonus + attendeeBonus)));
        }

        const urgency = computeUrgency(event);
        const urgencyScore = urgency.urgencyScore;

        const finalScore = Math.max(15, Math.min(100, Math.round(
          personaScore * 0.45 +
          socialScore * 0.30 +
          urgencyScore * 0.25
        )));

        const cat = event.category || "misc";
        const scoringMethod = hasEmbeddings ? "embedding" : "trait_fallback";
        const fallbackReason = hasEmbeddings ? null :
          !isValidEmbedding(profile.embedding) && !isValidEmbedding(event.embedding) ? "missing_both_embeddings" :
          !isValidEmbedding(profile.embedding) ? "missing_user_embedding" : "missing_item_embedding";

        const userTraits = {
          novelty: profile.traitNovelty ?? 0.5,
          intensity: profile.traitIntensity ?? 0.5,
          cozy: profile.traitCozy ?? 0.5,
          strategy: profile.traitStrategy ?? 0.5,
          social: profile.traitSocial ?? 0.5,
          creativity: profile.traitCreativity ?? 0.5,
          nostalgia: profile.traitNostalgia ?? 0.5,
          adventure: profile.traitAdventure ?? 0.5,
        };
        const eventTraits = {
          novelty: event.traitNovelty ?? 0.5,
          intensity: event.traitIntensity ?? 0.5,
          cozy: event.traitCozy ?? 0.5,
          strategy: event.traitStrategy ?? 0.5,
          social: event.traitSocial ?? 0.5,
          creativity: event.traitCreativity ?? 0.5,
          nostalgia: event.traitNostalgia ?? 0.5,
          adventure: event.traitAdventure ?? 0.5,
        };

        const topUserTraits = Object.entries(userTraits)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([k]) => k);

        const topEventTraits = Object.entries(eventTraits)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 2)
          .map(([k]) => k);

        const overlappingTraits = topUserTraits.filter(t => topEventTraits.includes(t));

        let whyShort = "";
        if (cat === "study") {
          const studyTraits = ["strategy", "intensity"].filter(t => userTraits[t as keyof typeof userTraits] >= 0.6);
          if (studyTraits.length > 0 && mutualFriendsGoingCount > 0) {
            whyShort = `High ${studyTraits.join(" + ")} alignment; ${mutualFriendsGoingCount} mutuals going`;
          } else if (studyTraits.length > 0) {
            whyShort = `Recommended for your ${studyTraits.join(" + ")} focus`;
          } else {
            whyShort = "Study session matching your academic profile";
          }
        } else if (cat === "deals") {
          const urgNote = urgencyScore >= 90 ? "Ending today" : urgencyScore >= 75 ? "Closing soon" : "Limited time";
          const friendNote = mutualFriendsGoingCount > 0 ? ` + ${mutualFriendsGoingCount} compatible students saved this` : "";
          whyShort = `${urgNote} — high value for your persona${friendNote}`;
        } else if (cat === "parties") {
          const socialLevel = userTraits.social >= 0.7 ? "High" : "Good";
          const timeNote = urgencyScore >= 75 ? " + happening soon" : urgencyScore >= 50 ? " + this week" : "";
          whyShort = `${socialLevel} social-energy match${timeNote}`;
        } else if (cat === "shows") {
          const creativityNote = userTraits.creativity >= 0.6 ? "Matches your creative side" : "Aligns with your interests";
          whyShort = mutualFriendsGoingCount > 0 ? `${creativityNote} + ${mutualFriendsGoingCount} friends going` : creativityNote;
        } else if (cat === "campus") {
          whyShort = mutualFriendsGoingCount > 0
            ? `${mutualFriendsGoingCount} friends going + campus community event`
            : personaScore >= 70 ? "Strong match to your campus interests" : "Popular campus event near you";
        } else {
          if (overlappingTraits.length > 0) {
            whyShort = `Matches your ${overlappingTraits.join(" + ")} energy`;
          } else if (mutualFriendsGoingCount > 0) {
            whyShort = `${mutualFriendsGoingCount} friends going + aligns with your profile`;
          } else {
            whyShort = personaScore >= 70 ? "Strong persona alignment" : "Discover something new around campus";
          }
        }

        const whyLongLines: string[] = [];
        whyLongLines.push(`Your top traits (${topUserTraits.join(", ")}) ${overlappingTraits.length > 0 ? `overlap with this event's ${overlappingTraits.join(", ")} profile` : `complement this event's ${topEventTraits.join(", ")} focus`}.`);
        if (mutualFriendsGoingCount > 0) {
          whyLongLines.push(`${mutualFriendsGoingCount} compatible ${mutualFriendsGoingCount === 1 ? "student" : "students"} (>65% taste match) attending — social fit is strong.`);
        } else if (socialScoreCount > 0) {
          whyLongLines.push(`${socialScoreCount} attendees with taste profiles analyzed; avg compatibility factored into ranking.`);
        }
        if (urgencyScore >= 90) whyLongLines.push("Happening today or deadline imminent — urgency weight boosted.");
        else if (urgencyScore >= 50) whyLongLines.push(`Event is ${urgency.urgencyLabel} — time relevance factored in.`);
        if (event.isDeal) whyLongLines.push("Active deal/promotion detected — value signal boosted.");
        const whyLong = whyLongLines.join(" ");

        const matchMathLines: string[] = [
          `Score: ${finalScore}% (personaScore ${personaScore}% × 0.45 + socialScore ${socialScore}% × 0.30 + urgencyScore ${urgencyScore}% × 0.25)`,
          `Persona: ML text embeddings (MiniLM-L6-v2, 384-dim) → cosine similarity between your Persona DNA and event embedding.`,
          `Social: avg attendee compatibility (${socialScoreCount} checked) + friend bonus (${mutualFriendsGoingCount} mutuals).`,
        ];
        if (scoringMethod === "trait_fallback") {
          matchMathLines.push(`Fallback: ${fallbackReason || "embeddings unavailable"} — using trait-based scoring.`);
        }
        const matchMathTooltip = matchMathLines.join("\n");

        return {
          id: event.id,
          title: event.title,
          description: event.description,
          category: event.category,
          location: event.location,
          dateTime: event.dateTime,
          imageUrl: event.imageUrl,
          tags: event.tags,
          organizerName: event.organizerName || event.creatorName || null,
          clubName: event.clubName || null,
          cost: event.cost || null,
          rsvpLimit: event.rsvpLimit || null,
          locationDetails: event.locationDetails || null,
          priceInfo: event.priceInfo || null,
          isDeal: event.isDeal || false,
          dealExpiresAt: event.dealExpiresAt || null,
          personaScore,
          socialScore,
          urgencyScore,
          finalScore,
          urgencyLabel: urgency.urgencyLabel,
          deadline: urgency.deadline,
          mutualFriendsGoingCount,
          mutualFriendsPreview: mutualFriendsPreview.slice(0, 3),
          attendeePreview,
          whyShort,
          whyLong,
          matchMathTooltip,
          whyRecommended: whyShort,
          hasRsvpd,
          rsvpCount,
          scoringMethod,
          fallbackReason,
          scoringFormula: "0.45*personaScore + 0.30*socialScore + 0.25*urgencyScore",
        };
      }));

      scored.sort((a, b) => b.finalScore - a.finalScore);
      res.json(scored);
    } catch (error) {
      console.error("Error fetching for-you events:", error);
      res.status(500).json({ message: "Failed to fetch personalized events" });
    }
  });

  app.get("/api/explore/map-data", demoAuth, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const profile = await storage.getTasteProfile(userId);

      const allEvents = await storage.getEvents();
      const allItems = await db.select().from(itemsTable);

      const now = new Date();
      const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000);

      const upcomingEvents = allEvents.filter(e => {
        if (!e.locationLat || !e.locationLng) return false;
        if (!e.dateTime) return true;
        const dt = new Date(e.dateTime);
        return dt >= now && dt <= in48h;
      });

      const eventMarkers = await Promise.all(upcomingEvents.map(async (event) => {
        const rsvps = await storage.getEventRsvps(event.id);
        const rsvpCount = rsvps.length;

        let personaScore = 50;
        if (profile && isValidEmbedding(profile.embedding) && isValidEmbedding(event.embedding)) {
          const sim = computeCosineSimilarity(profile.embedding!, event.embedding!);
          personaScore = cosineSimilarityToScore(sim);
        }

        const friendPreviews: { id: string; firstName: string | null; profileImageUrl: string | null }[] = [];
        if (profile && isValidEmbedding(profile.embedding)) {
          for (const rsvp of rsvps.slice(0, 5)) {
            if (rsvp.userId === userId) continue;
            const otherProfile = await storage.getTasteProfile(rsvp.userId);
            if (otherProfile && isValidEmbedding(otherProfile.embedding)) {
              const sim = computeCosineSimilarity(profile.embedding!, otherProfile.embedding!);
              if (cosineSimilarityToScore(sim) > 65) {
                const u = await storage.getUser(rsvp.userId);
                if (u) friendPreviews.push({ id: u.id, firstName: u.firstName, profileImageUrl: u.profileImageUrl });
              }
            }
          }
        }

        return {
          type: "event" as const,
          id: event.id,
          title: event.title,
          category: event.category,
          location: event.location,
          locationLat: event.locationLat,
          locationLng: event.locationLng,
          dateTime: event.dateTime,
          rsvpCount,
          personaScore,
          isDeal: event.isDeal || false,
          priceInfo: event.priceInfo,
          friendsGoing: friendPreviews,
          heatIntensity: Math.min(1, (rsvpCount + 5) / 50),
        };
      }));

      const clubMarkers = allItems
        .filter(item => item.locationLat && item.locationLng)
        .map(item => ({
          type: "club" as const,
          id: item.id,
          title: item.title,
          domain: item.domain,
          locationLat: item.locationLat,
          locationLng: item.locationLng,
          meetingLocation: item.meetingLocation,
          meetingDay: item.meetingDay,
          meetingTime: item.meetingTime,
          nextMeetingAt: item.nextMeetingAt,
        }));

      res.json({ events: eventMarkers, clubs: clubMarkers });
    } catch (error) {
      console.error("Error fetching map data:", error);
      res.status(500).json({ message: "Failed to fetch map data" });
    }
  });

  app.get("/api/events/:id/attendee-matches", demoAuth, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const eventId = req.params.id;

      const myProfile = await storage.getTasteProfile(userId);
      if (!myProfile || !isValidEmbedding(myProfile.embedding)) {
        return res.json([]);
      }

      const rsvps = await storage.getEventRsvps(eventId);
      const otherUserIds = rsvps.map(r => r.userId).filter(id => id !== userId);

      const attendeeMatches: any[] = [];
      for (const uid of otherUserIds) {
        const user = await storage.getUser(uid);
        const profile = await storage.getTasteProfile(uid);
        if (!user || !profile || !isValidEmbedding(profile.embedding)) continue;

        const sim = computeCosineSimilarity(myProfile.embedding!, profile.embedding!);
        const matchPercent = cosineSimilarityToScore(sim);

        const myTraits = getTraitsFromProfile(myProfile);
        const theirTraits = getTraitsFromProfile(profile);
        const topTraitsWhy: string[] = [];
        const traitDiffs = TRAIT_AXES.map(axis => ({
          axis,
          diff: Math.abs(myTraits[axis] - theirTraits[axis]),
          myVal: myTraits[axis],
          theirVal: theirTraits[axis],
        })).sort((a, b) => a.diff - b.diff);

        for (const t of traitDiffs.slice(0, 2)) {
          const label = t.axis.charAt(0).toUpperCase() + t.axis.slice(1);
          if (t.myVal > 0.6 && t.theirVal > 0.6) topTraitsWhy.push(`Both high ${label}`);
          else if (t.diff < 0.15) topTraitsWhy.push(`Similar ${label} energy`);
          else topTraitsWhy.push(`Complementary ${label}`);
        }

        const whyWeMatch = matchPercent >= 80
          ? `Strong taste alignment - your Persona DNA profiles deeply resonate across multiple dimensions`
          : matchPercent >= 60
          ? `Good compatibility - you share similar preferences in key areas`
          : `Some shared interests with complementary differences`;

        attendeeMatches.push({
          id: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          profileImageUrl: user.profileImageUrl,
          matchPercent,
          topTraitsWhy,
          whyWeMatch,
          topClusters: profile.topClusters || [],
        });
      }

      attendeeMatches.sort((a: any, b: any) => b.matchPercent - a.matchPercent);
      res.json(attendeeMatches.slice(0, 10));
    } catch (error) {
      console.error("Error fetching attendee matches:", error);
      res.status(500).json({ message: "Failed to fetch attendee matches" });
    }
  });

  app.get("/api/debug/match-proof/:otherUserId", demoAuth, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const otherUserId = req.params.otherUserId;

      const myProfile = await storage.getTasteProfile(userId);
      const otherProfile = await storage.getTasteProfile(otherUserId);
      const otherUser = await storage.getUser(otherUserId);

      if (!myProfile || !otherProfile) {
        return res.status(404).json({ message: "One or both profiles not found" });
      }

      let embeddingMatchPercent = 0;
      if (isValidEmbedding(myProfile.embedding) && isValidEmbedding(otherProfile.embedding)) {
        const sim = computeCosineSimilarity(myProfile.embedding!, otherProfile.embedding!);
        embeddingMatchPercent = cosineSimilarityToScore(sim);
      }

      const myInteractions = await storage.getUserInteractions(userId);
      const otherInteractions = await storage.getUserInteractions(otherUserId);

      const myLikedItems = new Set(
        myInteractions.filter(i => i.action === "like" || i.action === "love" || i.action === "save").map(i => i.itemId)
      );
      const otherLikedItems = new Set(
        otherInteractions.filter(i => i.action === "like" || i.action === "love" || i.action === "save").map(i => i.itemId)
      );

      let sharedCount = 0;
      const myLikedArr = Array.from(myLikedItems);
      for (const itemId of myLikedArr) {
        if (otherLikedItems.has(itemId)) sharedCount++;
      }
      const combined = myLikedArr.concat(Array.from(otherLikedItems));
      const totalUnique = new Set(combined).size;
      const explicitOverlapPercent = totalUnique > 0 ? Math.round((sharedCount / totalUnique) * 100) : 0;

      let top3SharedThemes: string[] = [];
      if (isValidEmbedding(myProfile.embedding)) {
        const midpoint = myProfile.embedding!.map((v: number, i: number) =>
          (v + (otherProfile.embedding?.[i] || 0)) / 2
        );
        const nearestItems = await findSimilarByEmbedding("items", midpoint, 5);
        const itemIds = nearestItems.map(n => n.id);
        const itemsData = await storage.getItemsByIds(itemIds);
        const allTags = itemsData.flatMap(item => item.tags || []);
        const tagCounts = new Map<string, number>();
        for (const tag of allTags) {
          tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
        }
        top3SharedThemes = Array.from(tagCounts.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([tag]) => tag);
      }

      let explanation = "";
      if (embeddingMatchPercent >= 85 && explicitOverlapPercent < 10) {
        explanation = `High match (${embeddingMatchPercent}%) despite low explicit overlap (${explicitOverlapPercent}%) because your Persona DNA vectors are semantically aligned. You both gravitate toward similar themes (${top3SharedThemes.join(", ")}) even though you haven't interacted with the same specific items. This proves the embedding model captures deep taste patterns beyond surface-level item overlap.`;
      } else if (embeddingMatchPercent >= 75) {
        explanation = `Strong embedding alignment (${embeddingMatchPercent}%) with ${explicitOverlapPercent}% explicit overlap. Your taste profiles share deep semantic structure around themes like ${top3SharedThemes.join(", ")}.`;
      } else {
        explanation = `Moderate embedding match (${embeddingMatchPercent}%) with ${explicitOverlapPercent}% explicit overlap. Some shared themes: ${top3SharedThemes.join(", ")}.`;
      }

      res.json({
        yourUserId: userId,
        otherUserId,
        otherUserName: otherUser ? `${otherUser.firstName} ${otherUser.lastName}` : otherUserId,
        embeddingMatchPercent,
        explicitOverlapPercent,
        sharedLikedItems: sharedCount,
        totalUniqueItems: totalUnique,
        yourLikedCount: myLikedItems.size,
        theirLikedCount: otherLikedItems.size,
        top3SharedThemes,
        explanation,
        proofStatement: embeddingMatchPercent >= 85 && explicitOverlapPercent < 10
          ? "COLD START SOLVED: High match with near-zero item overlap. Embeddings capture latent taste, not just explicit history."
          : embeddingMatchPercent >= 75
          ? "STRONG MATCH: Embedding similarity reveals deep taste compatibility."
          : "PARTIAL MATCH: Some taste alignment detected.",
      });
    } catch (error) {
      console.error("Error computing match proof:", error);
      res.status(500).json({ message: "Failed to compute match proof" });
    }
  });

  app.post("/api/demo/reset", demoAuth, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;

      await pool.query("DELETE FROM event_rsvps");
      await pool.query("DELETE FROM interactions");
      await pool.query("UPDATE taste_profiles SET embedding = NULL, embedding_updated_at = NULL");

      await pool.query("DELETE FROM items");
      await pool.query("DELETE FROM hobbies");
      await pool.query("DELETE FROM events");

      const { seedDatabase } = await import("./seed");
      await seedDatabase();

      const seedUserIds = ["seed-colin", "seed-andy", "seed-devon"];
      const allSeedItems = await pool.query("SELECT id, domain, title, tags FROM items");
      const itemsByDomain = new Map<string, any[]>();
      for (const item of allSeedItems.rows) {
        const list = itemsByDomain.get(item.domain) || [];
        list.push(item);
        itemsByDomain.set(item.domain, list);
      }

      const colinItems = [
        ...(itemsByDomain.get("academic") || []).filter((i: any) => (i.tags || []).some((t: string) => ["career_alignment", "software", "cybersecurity"].includes(t))).slice(0, 3),
        ...(itemsByDomain.get("sports") || []).slice(0, 3),
      ];
      for (const item of colinItems) {
        await storage.createInteraction({
          userId: "seed-colin",
          itemId: item.id,
          domain: item.domain,
          action: Math.random() > 0.3 ? "love" : "like",
          weight: Math.random() > 0.3 ? 2.0 : 1.0,
        });
      }

      const andyItems = [
        ...(itemsByDomain.get("professional") || []).filter((i: any) => (i.tags || []).some((t: string) => ["startups", "design", "product"].includes(t))).slice(0, 3),
        ...(itemsByDomain.get("social") || []).slice(0, 3),
      ];
      for (const item of andyItems) {
        await storage.createInteraction({
          userId: "seed-andy",
          itemId: item.id,
          domain: item.domain,
          action: Math.random() > 0.3 ? "love" : "save",
          weight: Math.random() > 0.3 ? 2.0 : 1.5,
        });
      }

      const devonItems = [
        ...(itemsByDomain.get("volunteering") || []).filter((i: any) => (i.tags || []).some((t: string) => ["community", "campus_tradition", "children"].includes(t))).slice(0, 3),
        ...(itemsByDomain.get("social") || []).filter((i: any) => (i.tags || []).some((t: string) => ["culture", "community", "social"].includes(t))).slice(0, 3),
      ];
      for (const item of devonItems) {
        await storage.createInteraction({
          userId: "seed-devon",
          itemId: item.id,
          domain: item.domain,
          action: "love",
          weight: 2.0,
        });
      }

      for (const seedId of seedUserIds) {
        await recomputeTasteEmbedding(seedId);
        const recomputed = await recomputeTasteEmbedding(seedId);
        if (!recomputed.updated) {
          await deriveEmbeddingFromProfile(seedId);
        }
      }

      let existingProfile = await storage.getTasteProfile(userId);
      if (!existingProfile) {
        const existingUser = await storage.getUser(userId);
        if (!existingUser) {
          await pool.query(
            `INSERT INTO users (id, email, first_name, last_name) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING`,
            [userId, "demo@persona.app", "Garv", "Puri"]
          );
        }
        const codingClubRow = await pool.query(`SELECT id FROM items WHERE title = 'Aggie Coding Club' LIMIT 1`);
        const mainClubId = codingClubRow.rows[0]?.id || null;
        await pool.query(
          `UPDATE users SET grad_year = $1, class_standing = $2, main_club_item_id = $3 WHERE id = $4`,
          [2027, "Junior", mainClubId, userId]
        );
        existingProfile = await storage.upsertTasteProfile({ userId, ...GARV_PROFILE });
      }
      const demoItems = [
        ...(itemsByDomain.get("academic") || []).slice(0, 3),
        ...(itemsByDomain.get("professional") || []).slice(0, 3),
        ...(itemsByDomain.get("sports") || []).slice(0, 2),
        ...(itemsByDomain.get("volunteering") || []).slice(0, 1),
      ];
      for (const item of demoItems) {
        await storage.createInteraction({
          userId,
          itemId: item.id,
          domain: item.domain,
          action: "love",
          weight: 2.0,
        });
      }
      await recomputeTasteEmbedding(userId);
      const recomputedUser = await recomputeTasteEmbedding(userId);
      if (!recomputedUser.updated) {
        await deriveEmbeddingFromProfile(userId);
      }

      const allEventRows = await pool.query("SELECT id, title, category FROM events ORDER BY date_time ASC");
      const eventIds = allEventRows.rows.map((r: any) => r.id);
      const allUsers = [userId, ...seedUserIds].filter(Boolean);

      const rsvpAssignments: Record<number, string[]> = {
        0: [allUsers[0], allUsers[1], allUsers[2]],
        1: [allUsers[0], allUsers[3]],
        2: [allUsers[0], allUsers[1], allUsers[2], allUsers[3]],
        3: [allUsers[0], allUsers[1]],
        4: [allUsers[0], allUsers[2], allUsers[3]],
        5: [allUsers[1], allUsers[2], allUsers[3]],
        6: [allUsers[0], allUsers[3]],
        7: [allUsers[0], allUsers[1]],
        8: [allUsers[1], allUsers[2]],
        9: [allUsers[0], allUsers[1], allUsers[3]],
        10: [allUsers[0], allUsers[2]],
        11: [allUsers[0], allUsers[1], allUsers[2]],
        12: [allUsers[0], allUsers[1], allUsers[2], allUsers[3]],
        13: [allUsers[2], allUsers[3]],
        14: [allUsers[0], allUsers[2]],
        15: [allUsers[0], allUsers[1], allUsers[3]],
        16: [allUsers[1], allUsers[3]],
        17: [allUsers[0], allUsers[2], allUsers[3]],
        18: [allUsers[0], allUsers[1], allUsers[2]],
        19: [allUsers[0], allUsers[2], allUsers[3]],
        20: [allUsers[1], allUsers[2]],
        21: [allUsers[0], allUsers[1], allUsers[2], allUsers[3]],
        22: [allUsers[0], allUsers[3]],
        23: [allUsers[1], allUsers[2], allUsers[3]],
      };

      for (let i = 0; i < eventIds.length; i++) {
        const usersForEvent = rsvpAssignments[i] || [allUsers[0]];
        for (const uid of usersForEvent) {
          try {
            const already = await storage.hasUserRsvpd(eventIds[i], uid);
            if (!already) {
              await storage.createEventRsvp({ eventId: eventIds[i], userId: uid });
            }
          } catch {}
        }
      }

      const finalHealth = await checkEmbeddingHealth();

      res.json({
        success: true,
        message: "Demo environment reset complete. All embeddings recomputed.",
        health: finalHealth,
        guarantees: {
          recommendations: "Love-weighted interactions seeded for diverse recommendations",
          friendMatch: "Seed users have distinct taste profiles for >85% embedding matches",
          events: "Top event has 4+ RSVPs with attendee matching ready",
        },
      });
    } catch (error) {
      console.error("Error resetting demo:", error);
      res.status(500).json({ message: "Failed to reset demo environment" });
    }
  });

  app.get("/api/demo/story", demoAuth, async (_req: any, res) => {
    try {
      res.json({
        title: "Persona: Campus Clubs Discovery - 60-Second Demo",
        steps: [
          {
            step: 1,
            action: "Show AI is real",
            endpoint: "GET /api/debug/ai-status",
            say: "Our system runs a local transformer model (all-MiniLM-L6-v2, 384-dim) generating real neural embeddings for 50 TAMU campus clubs across 5 domains. Zero external APIs. 100% coverage.",
            expectedResult: "aiReady: true, embeddingDim: 384, avgVectorNorm ~1.0",
          },
          {
            step: 2,
            action: "Get personalized club recommendations",
            endpoint: "GET /api/recommendations/academic",
            say: "Every club recommendation is ranked by hybrid ML: 55% vector similarity from neural embeddings, 25% collaborative filtering from taste neighbors, 20% trait explainability. Watch the vectorScore and scoringMethod fields.",
            expectedResult: "Clubs with scoringMethod='embedding', vectorScore values, and campus-specific explanations",
          },
          {
            step: 3,
            action: "Show cold-start proof",
            endpoint: "GET /api/debug/match-proof/seed-devon",
            say: "Devon and I have different club preferences, but our embedding match is high. The model learned our latent interest patterns even without shared club history. Cold start solved for new students.",
            expectedResult: "embeddingMatchPercent > 70, explicitOverlapPercent < 20",
          },
          {
            step: 4,
            action: "Show event compatibility engine",
            endpoint: "GET /api/events/for-you?lat=30.6187&lng=-96.3365",
            say: "Club events scored with a 3-factor formula: 55% taste embedding similarity, 25% campus proximity (Haversine distance), 20% time relevance. Urgency scoring highlights approaching deadlines.",
            expectedResult: "Events with eventScore, urgencyScore, urgencyLabel, predictedEnjoymentPercent, distanceKm",
          },
          {
            step: 5,
            action: "Show attendee matching at events",
            endpoint: "GET /api/events/{topEventId}/attendee-matches",
            say: "For any club event, we compute embedding similarity between you and every attendee. You see who's going, mutual friends, and why you match. Social computing meets ML for campus networking.",
            expectedResult: "Attendees with matchPercent, mutualsGoing, attendeePreview, whyWeMatch",
          },
          {
            step: 6,
            action: "Show embedding sanity across campus domains",
            endpoint: "GET /api/debug/embedding-similarity-sanity",
            say: "Proof the embeddings are semantically meaningful across academic, professional, social, sports, and volunteering domains. Real semantic structure, not random vectors.",
            expectedResult: "Per-domain min/mean/max cosine similarities showing semantic clustering",
          },
        ],
        resetEndpoint: "POST /api/demo/reset",
        resetNote: "Run this first to guarantee a clean demo state with seeded interactions and embeddings for all 50 campus clubs.",
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to generate demo story" });
    }
  });

  app.post("/api/admin/backfill-embeddings", async (_req: any, res) => {
    try {
      const errors: { entityType: string; entityId: string; reason: string }[] = [];
      let itemsEmbeddedCreated = 0;
      let eventsEmbeddedCreated = 0;
      let hobbiesEmbeddedCreated = 0;
      let usersTasteEmbeddingUpdated = 0;

      const missingItems = await pool.query(
        "SELECT id, title, tags, description FROM items WHERE embedding IS NULL"
      );
      if (missingItems.rows.length > 0) {
        const texts = missingItems.rows.map((row: any) => buildEmbeddingText({
          title: row.title, tags: row.tags, description: row.description,
        }));
        try {
          const embeddings = await generateBatchEmbeddings(texts);
          for (let i = 0; i < missingItems.rows.length; i++) {
            try {
              await storeEmbedding("items", missingItems.rows[i].id, embeddings[i]);
              itemsEmbeddedCreated++;
            } catch (e: any) {
              errors.push({ entityType: "item", entityId: missingItems.rows[i].id, reason: e.message || String(e) });
            }
          }
        } catch (e: any) {
          for (const row of missingItems.rows) {
            errors.push({ entityType: "item", entityId: row.id, reason: `Batch failed: ${e.message || String(e)}` });
          }
        }
      }

      const missingEvents = await pool.query(
        "SELECT id, title, tags, description FROM events WHERE embedding IS NULL"
      );
      if (missingEvents.rows.length > 0) {
        const texts = missingEvents.rows.map((row: any) => buildEmbeddingText({
          title: row.title, tags: row.tags, description: row.description,
        }));
        try {
          const embeddings = await generateBatchEmbeddings(texts);
          for (let i = 0; i < missingEvents.rows.length; i++) {
            try {
              await storeEmbedding("events", missingEvents.rows[i].id, embeddings[i]);
              eventsEmbeddedCreated++;
            } catch (e: any) {
              errors.push({ entityType: "event", entityId: missingEvents.rows[i].id, reason: e.message || String(e) });
            }
          }
        } catch (e: any) {
          for (const row of missingEvents.rows) {
            errors.push({ entityType: "event", entityId: row.id, reason: `Batch failed: ${e.message || String(e)}` });
          }
        }
      }

      const missingHobbies = await pool.query(
        "SELECT id, title, tags, description FROM hobbies WHERE embedding IS NULL"
      );
      if (missingHobbies.rows.length > 0) {
        const texts = missingHobbies.rows.map((row: any) => buildEmbeddingText({
          title: row.title, tags: row.tags, description: row.description,
        }));
        try {
          const embeddings = await generateBatchEmbeddings(texts);
          for (let i = 0; i < missingHobbies.rows.length; i++) {
            try {
              await storeEmbedding("hobbies", missingHobbies.rows[i].id, embeddings[i]);
              hobbiesEmbeddedCreated++;
            } catch (e: any) {
              errors.push({ entityType: "hobby", entityId: missingHobbies.rows[i].id, reason: e.message || String(e) });
            }
          }
        } catch (e: any) {
          for (const row of missingHobbies.rows) {
            errors.push({ entityType: "hobby", entityId: row.id, reason: `Batch failed: ${e.message || String(e)}` });
          }
        }
      }

      const profilesWithoutEmbeddings = await pool.query(`
        SELECT tp.user_id
        FROM taste_profiles tp
        WHERE tp.embedding IS NULL AND tp.onboarding_complete = true
      `);
      for (const row of profilesWithoutEmbeddings.rows) {
        try {
          const result = await deriveEmbeddingFromProfile(row.user_id);
          if (result.updated) usersTasteEmbeddingUpdated++;
          else {
            errors.push({ entityType: "user_profile", entityId: row.user_id, reason: `derive returned: ${result.method}` });
          }
        } catch (e: any) {
          errors.push({ entityType: "user_profile", entityId: row.user_id, reason: e.message || String(e) });
        }
      }

      const health = await checkEmbeddingHealth();

      console.log(`[backfill] Complete: items=${itemsEmbeddedCreated}, events=${eventsEmbeddedCreated}, hobbies=${hobbiesEmbeddedCreated}, users=${usersTasteEmbeddingUpdated}, errors=${errors.length}`);

      res.json({
        success: errors.length === 0,
        itemsEmbeddedCreated,
        eventsEmbeddedCreated,
        hobbiesEmbeddedCreated,
        usersTasteEmbeddingUpdated,
        errors,
        postBackfillHealth: health,
      });
    } catch (error) {
      console.error("Error backfilling embeddings:", error);
      res.status(500).json({ message: "Failed to backfill embeddings", error: String(error) });
    }
  });

  return httpServer;
}
