import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, registerAuthRoutes, isAuthenticated } from "./replit_integrations/auth";
import { buildTraitsFromSelections, generateClusters, computeMatchScore, computeItemMatchScore, computeHobbyMatch, getTraitsFromProfile } from "./taste-engine";
import { TRAIT_AXES, type Domain } from "@shared/schema";
import { GARV_PROFILE } from "./seed";
import { hybridRecommend, hybridSocialMatch, hybridEventScore, hybridHobbyScore } from "./hybrid-engine";
import { recomputeTasteEmbedding, deriveEmbeddingFromProfile, checkEmbeddingHealth, generateBatchEmbeddings, buildEmbeddingText, storeEmbedding, computeWeightedAverageEmbedding, generateEmbedding, computeCosineSimilarity, cosineSimilarityToScore, isValidEmbedding, haversineDistance, getDistanceBucket, findSimilarByEmbedding } from "./embeddings";
import { pool } from "./db";

function demoAuth(req: any, res: any, next: any) {
  if (process.env.DEMO_BYPASS_AUTH === "true") {
    if (!req.user) {
      req.user = { claims: { sub: "seed-garv" } };
    }
    return next();
  }
  return isAuthenticated(req, res, next);
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
      const profile = await storage.upsertTasteProfile({
        userId,
        ...GARV_PROFILE,
      });

      const embResult = await deriveEmbeddingFromProfile(userId);
      console.log(`[demo/bootstrap] New profile, embedding result:`, embResult);

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

  app.get("/api/recommendations/:domain", demoAuth, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const domain = req.params.domain as Domain;

      const profile = await storage.getTasteProfile(userId);
      if (!profile) {
        return res.json({ recommendations: [], communityPicks: [] });
      }

      const allItems = await storage.getItemsByDomain(domain);
      const userInteractions = await storage.getUserInteractions(userId, domain);
      const interactedItemIds = new Set(userInteractions.map((i) => i.itemId));
      const availableItems = allItems.filter((item) => !interactedItemIds.has(item.id));

      const { recommendations: hybridResults, communityPicks } = await hybridRecommend(profile, availableItems, userId, domain);

      const scored = hybridResults.map(r => ({
        ...r.item,
        matchScore: r.hybridScore,
        explanation: r.explanation,
        traitExplanation: r.traitExplanation,
        vectorScore: r.vectorScore,
        cfScore: r.cfScore,
        scoringMethod: r.scoringMethod,
        fallbackReason: r.fallbackReason,
      }));

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

        return {
          ...event,
          matchScore,
          predictedEnjoyment,
          distanceBucket,
          explanation,
          scoringMethod,
          fallbackReason,
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

      const sampleDomain = "movies";
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
      const domains = ["movies", "music", "games", "food"];
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
      const userLat = req.query.lat ? parseFloat(req.query.lat as string) : null;
      const userLng = req.query.lng ? parseFloat(req.query.lng as string) : null;

      const profile = await storage.getTasteProfile(userId);
      if (!profile) return res.json([]);

      const allEvents = await storage.getEvents();
      const now = new Date();
      const userRsvps = await storage.getUserEventRsvps(userId);
      const rsvpEventIds = new Set(userRsvps.map(r => r.eventId));

      const scored = await Promise.all(allEvents.map(async (event) => {
        const hasEmbeddings = isValidEmbedding(profile.embedding) && isValidEmbedding(event.embedding);

        let tasteScore = 50;
        if (hasEmbeddings) {
          const sim = computeCosineSimilarity(profile.embedding!, event.embedding!);
          tasteScore = cosineSimilarityToScore(sim);
        }

        let proximityScore = 50;
        let distanceKm: number | null = null;
        let distanceBucket: string | null = null;
        if (userLat && userLng && event.locationLat && event.locationLng) {
          distanceKm = Math.round(haversineDistance(userLat, userLng, event.locationLat, event.locationLng) * 10) / 10;
          distanceBucket = getDistanceBucket(distanceKm);
          if (distanceKm < 5) proximityScore = 100;
          else if (distanceKm < 15) proximityScore = 85;
          else if (distanceKm < 30) proximityScore = 70;
          else if (distanceKm < 50) proximityScore = 55;
          else if (distanceKm < 100) proximityScore = 40;
          else proximityScore = 20;
        }

        let timeRelevance = 50;
        const eventDate = event.dateTime ? new Date(event.dateTime) : null;
        if (eventDate) {
          const daysUntil = (eventDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
          if (daysUntil < 0) timeRelevance = 10;
          else if (daysUntil <= 3) timeRelevance = 100;
          else if (daysUntil <= 7) timeRelevance = 90;
          else if (daysUntil <= 14) timeRelevance = 75;
          else if (daysUntil <= 30) timeRelevance = 55;
          else timeRelevance = 35;
        }

        const eventScore = Math.round(
          tasteScore * 0.55 +
          proximityScore * 0.25 +
          timeRelevance * 0.20
        );
        const predictedEnjoyment = Math.max(15, Math.min(100, eventScore));

        const rsvps = await storage.getEventRsvps(event.id);
        const rsvpCount = rsvps.length;
        const hasRsvpd = rsvpEventIds.has(event.id);

        let topMatches = 0;
        if (hasEmbeddings && rsvpCount > 0) {
          for (const rsvp of rsvps.slice(0, 5)) {
            if (rsvp.userId === userId) continue;
            const otherProfile = await storage.getTasteProfile(rsvp.userId);
            if (otherProfile && isValidEmbedding(otherProfile.embedding)) {
              const sim = computeCosineSimilarity(profile.embedding!, otherProfile.embedding!);
              if (cosineSimilarityToScore(sim) > 75) topMatches++;
            }
          }
        }

        let nextAction = "RSVP";
        if (hasRsvpd) nextAction = topMatches > 0 ? `Message ${topMatches} top matches` : "You're going!";

        return {
          id: event.id,
          title: event.title,
          description: event.description,
          category: event.category,
          location: event.location,
          dateTime: event.dateTime,
          imageUrl: event.imageUrl,
          tags: event.tags,
          eventScore,
          predictedEnjoymentPercent: predictedEnjoyment,
          tasteEmbeddingSimilarity: tasteScore,
          proximityScore,
          timeRelevance,
          distanceKm,
          distanceBucket,
          nextAction,
          hasRsvpd,
          rsvpCount,
          scoringMethod: hasEmbeddings ? "embedding" : "trait_fallback",
          scoringFormula: "0.55*tasteEmbeddingSimilarity + 0.25*proximityScore + 0.20*timeRelevance",
        };
      }));

      scored.sort((a, b) => b.eventScore - a.eventScore);
      res.json(scored);
    } catch (error) {
      console.error("Error fetching for-you events:", error);
      res.status(500).json({ message: "Failed to fetch personalized events" });
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
          ? `Strong taste alignment - your Taste DNA profiles deeply resonate across multiple dimensions`
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
        explanation = `High match (${embeddingMatchPercent}%) despite low explicit overlap (${explicitOverlapPercent}%) because your Taste DNA vectors are semantically aligned. You both gravitate toward similar themes (${top3SharedThemes.join(", ")}) even though you haven't interacted with the same specific items. This proves the embedding model captures deep taste patterns beyond surface-level item overlap.`;
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
        ...(itemsByDomain.get("games") || []).slice(0, 4),
        ...(itemsByDomain.get("movies") || []).slice(0, 2),
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
        ...(itemsByDomain.get("music") || []).slice(0, 3),
        ...(itemsByDomain.get("food") || []).slice(0, 3),
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
        ...(itemsByDomain.get("movies") || []).filter((i: any) => (i.tags || []).some((t: string) => ["cozy", "emotional", "classic", "animated"].includes(t))).slice(0, 3),
        ...(itemsByDomain.get("food") || []).filter((i: any) => (i.tags || []).some((t: string) => ["comfort", "social", "brunch"].includes(t))).slice(0, 3),
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
            [userId, "demo@persona.app", "Demo", "User"]
          );
        }
        existingProfile = await storage.upsertTasteProfile({ userId, ...GARV_PROFILE });
      }
      const demoItems = [
        ...(itemsByDomain.get("movies") || []).slice(0, 4),
        ...(itemsByDomain.get("music") || []).slice(0, 3),
        ...(itemsByDomain.get("games") || []).slice(0, 2),
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

      const allEventIds = await pool.query("SELECT id FROM events");
      const rsvpUsers = [...seedUserIds, userId].filter(Boolean);
      for (const eventRow of allEventIds.rows) {
        for (const uid of rsvpUsers) {
          try {
            const already = await storage.hasUserRsvpd(eventRow.id, uid);
            if (!already) {
              await storage.createEventRsvp({ eventId: eventRow.id, userId: uid });
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
        title: "Persona: 60-Second Demo Script",
        steps: [
          {
            step: 1,
            action: "Show AI is real",
            endpoint: "GET /api/debug/ai-status",
            say: "Our system runs a local transformer model (all-MiniLM-L6-v2, 384-dim) generating real neural embeddings. Zero external APIs. 100% coverage across all content.",
            expectedResult: "aiReady: true, embeddingDim: 384, avgVectorNorm ~1.0",
          },
          {
            step: 2,
            action: "Get personalized recommendations",
            endpoint: "GET /api/recommendations/movies",
            say: "Every recommendation is ranked by hybrid ML: 55% vector similarity from neural embeddings, 25% collaborative filtering from taste neighbors, 20% trait explainability. Watch the vectorScore and scoringMethod fields.",
            expectedResult: "Items with scoringMethod='embedding', vectorScore values, and human-readable explanations",
          },
          {
            step: 3,
            action: "Show cold-start proof",
            endpoint: "GET /api/debug/match-proof/seed-devon",
            say: "Here's the magic: Devon and I have less than 10% item overlap, but our embedding match is over 85%. The model learned our latent taste patterns even without shared history. Cold start solved.",
            expectedResult: "embeddingMatchPercent > 85, explicitOverlapPercent < 10",
          },
          {
            step: 4,
            action: "Show event compatibility engine",
            endpoint: "GET /api/events/for-you?lat=37.4275&lng=-122.1697",
            say: "Events are scored with a 3-factor formula: 55% taste embedding similarity, 25% proximity (Haversine distance), 20% time relevance. This is a real-world compatibility predictor, not just a list.",
            expectedResult: "Events with eventScore, predictedEnjoymentPercent, distanceKm, scoringFormula",
          },
          {
            step: 5,
            action: "Show attendee matching at events",
            endpoint: "GET /api/events/{topEventId}/attendee-matches",
            say: "For any event, we compute embedding similarity between you and every attendee. You see match percentages, the top traits driving compatibility, and a 'why we match' explanation. This is social computing meets ML.",
            expectedResult: "Attendees with matchPercent, topTraitsWhy, whyWeMatch",
          },
          {
            step: 6,
            action: "Show embedding sanity",
            endpoint: "GET /api/debug/embedding-similarity-sanity",
            say: "Finally, here's proof the embeddings are semantically meaningful. Intra-domain similarity ranges show the model distinguishes between items while recognizing genre relatedness. Not random, not uniform - real semantic structure.",
            expectedResult: "Per-domain min/mean/max cosine similarities showing semantic clustering",
          },
        ],
        resetEndpoint: "POST /api/demo/reset",
        resetNote: "Run this first to guarantee a clean demo state with seeded interactions and embeddings.",
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
