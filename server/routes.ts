import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, registerAuthRoutes, isAuthenticated } from "./replit_integrations/auth";
import { buildTraitsFromSelections, generateClusters, computeMatchScore, computeItemMatchScore, computeHobbyMatch, getTraitsFromProfile } from "./taste-engine";
import { TRAIT_AXES, type Domain } from "@shared/schema";
import { GARV_PROFILE } from "./seed";
import { hybridRecommend, hybridSocialMatch, hybridEventScore, hybridHobbyScore } from "./hybrid-engine";
import { updateUserTasteEmbedding } from "./embeddings";

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
        return res.json(existing);
      }
      const profile = await storage.upsertTasteProfile({
        userId,
        ...GARV_PROFILE,
      });
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

      updateUserTasteEmbedding(userId).catch(err =>
        console.error("Background embedding update failed:", err)
      );

      res.json(profile);
    } catch (error) {
      console.error("Error during onboarding:", error);
      res.status(500).json({ message: "Failed to complete onboarding" });
    }
  });

  app.get("/api/recommendations/:domain", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const domain = req.params.domain as Domain;

      const profile = await storage.getTasteProfile(userId);
      if (!profile) {
        return res.json([]);
      }

      const allItems = await storage.getItemsByDomain(domain);
      const userInteractions = await storage.getUserInteractions(userId, domain);
      const interactedItemIds = new Set(userInteractions.map((i) => i.itemId));
      const availableItems = allItems.filter((item) => !interactedItemIds.has(item.id));

      const hybridResults = await hybridRecommend(profile, availableItems, userId, domain);

      const scored = hybridResults.map(r => ({
        ...r.item,
        matchScore: r.hybridScore,
        explanation: r.explanation,
        traitExplanation: r.traitExplanation,
        vectorScore: r.vectorScore,
        cfScore: r.cfScore,
        scoringMethod: r.scoringMethod,
      }));

      res.json(scored.slice(0, 12));
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

      if (action === "like" || action === "love" || action === "save") {
        updateUserTasteEmbedding(userId).catch(err =>
          console.error("Background embedding update failed:", err)
        );
      }

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

        if (profile) {
          const result = hybridEventScore(profile, event, userLat, userLng);
          matchScore = result.hybridScore;
          predictedEnjoyment = result.predictedEnjoyment;
          distanceBucket = result.distanceBucket;
          explanation = result.explanation;
          scoringMethod = result.scoringMethod;
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

  return httpServer;
}
