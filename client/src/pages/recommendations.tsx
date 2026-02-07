import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MatchPill } from "@/components/match-pill";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { type Item, type Hobby } from "@shared/schema";
import {
  Film, Music, Gamepad2, UtensilsCrossed, Compass,
  Bookmark, SkipForward, ThumbsUp, Sparkles
} from "lucide-react";
import { useState } from "react";

import domainMovies from "@/assets/images/domain-movies.jpg";
import domainMusic from "@/assets/images/domain-music.jpg";
import domainGames from "@/assets/images/domain-games.jpg";
import domainFood from "@/assets/images/domain-food.jpg";
import domainHobbies from "@/assets/images/domain-hobbies.jpg";
import { getHobbyImage } from "@/lib/hobby-images";

type ContentDomain = "movies" | "music" | "games" | "food" | "hobbies";

const DOMAINS: { key: ContentDomain; label: string; icon: typeof Film; image: string }[] = [
  { key: "movies", label: "Movies", icon: Film, image: domainMovies },
  { key: "music", label: "Music", icon: Music, image: domainMusic },
  { key: "games", label: "Games", icon: Gamepad2, image: domainGames },
  { key: "food", label: "Food", icon: UtensilsCrossed, image: domainFood },
  { key: "hobbies", label: "Hobbies", icon: Compass, image: domainHobbies },
];

const DOMAIN_IMAGES: Record<string, string> = {
  movies: domainMovies,
  music: domainMusic,
  games: domainGames,
  food: domainFood,
  hobbies: domainHobbies,
};

interface RecommendedItem extends Item {
  matchScore: number;
  explanation: string;
}

interface HobbyWithMatch extends Hobby {
  matchScore: number;
  whyItFits: string;
  usersDoingIt: number;
}

function getScoreColor(score: number) {
  if (score >= 75) return "green" as const;
  if (score >= 50) return "yellow" as const;
  return "grey" as const;
}

const TAG_COLORS = [
  "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  "bg-sky-500/20 text-sky-300 border-sky-500/30",
  "bg-violet-500/20 text-violet-300 border-violet-500/30",
  "bg-amber-500/20 text-amber-300 border-amber-500/30",
  "bg-pink-500/20 text-pink-300 border-pink-500/30",
  "bg-teal-500/20 text-teal-300 border-teal-500/30",
  "bg-orange-500/20 text-orange-300 border-orange-500/30",
  "bg-indigo-500/20 text-indigo-300 border-indigo-500/30",
];

function getTagColor(tag: string): string {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    hash = tag.charCodeAt(i) + ((hash << 5) - hash);
  }
  return TAG_COLORS[Math.abs(hash) % TAG_COLORS.length];
}

export default function RecommendationsPage() {
  const [activeDomain, setActiveDomain] = useState<ContentDomain>("movies");

  return (
    <div className="space-y-5 pb-4">
      <div className="px-4 sm:px-6 pt-4">
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-recommendations-title">
          For You
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Content matched to your Taste DNA
        </p>
      </div>

      <div className="flex gap-2 overflow-x-auto px-4 sm:px-6 pb-1 no-scrollbar">
        {DOMAINS.map((domain) => {
          const Icon = domain.icon;
          const isActive = activeDomain === domain.key;
          return (
            <button
              key={domain.key}
              onClick={() => setActiveDomain(domain.key)}
              className={cn(
                "flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium whitespace-nowrap transition-colors border shrink-0",
                isActive
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-muted/50 text-muted-foreground border-border/50 hover-elevate"
              )}
              data-testid={`tab-domain-${domain.key}`}
            >
              <Icon className="h-3.5 w-3.5" />
              {domain.label}
            </button>
          );
        })}
      </div>

      {activeDomain === "hobbies" ? (
        <HobbiesSection />
      ) : (
        <DomainRecommendations domain={activeDomain} />
      )}
    </div>
  );
}

function DomainRecommendations({ domain }: { domain: ContentDomain }) {
  const { toast } = useToast();

  const { data: items, isLoading } = useQuery<RecommendedItem[]>({
    queryKey: ["/api/recommendations", domain],
  });

  const interactMutation = useMutation({
    mutationFn: async ({ itemId, action }: { itemId: string; action: string }) => {
      await apiRequest("POST", "/api/interactions", {
        itemId,
        domain,
        action,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recommendations", domain] });
    },
    onError: (err) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="flex gap-4 overflow-x-auto px-4 sm:px-6 pb-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-72 w-64 shrink-0 rounded-md" />
        ))}
      </div>
    );
  }

  if (!items || items.length === 0) {
    return (
      <div className="px-4 sm:px-6">
        <Card className="p-8 text-center">
          <div className="text-muted-foreground space-y-2">
            <Film className="h-10 w-10 mx-auto opacity-30" />
            <p className="text-sm">No recommendations yet. Complete your onboarding to get started.</p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex gap-4 overflow-x-auto px-4 sm:px-6 pb-4 no-scrollbar snap-x snap-mandatory">
      {items.map((item) => {
        const color = getScoreColor(item.matchScore);
        return (
          <div
            key={item.id}
            className="relative shrink-0 w-72 h-[340px] rounded-md overflow-hidden snap-start group"
            data-testid={`card-item-${item.id}`}
          >
            <img
              src={DOMAIN_IMAGES[domain]}
              alt={item.title}
              className="absolute inset-0 w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-black/20" />

            <div className="relative h-full flex flex-col justify-end p-4 space-y-2.5">
              <div className="flex items-start justify-between gap-2">
                <h3
                  className="font-bold text-white text-lg leading-tight drop-shadow-sm"
                  data-testid={`text-item-title-${item.id}`}
                >
                  {item.title}
                </h3>
                <MatchPill score={item.matchScore} size="sm" showLabel={false} />
              </div>

              {item.tags && (
                <div className="flex flex-wrap gap-1">
                  {item.tags.slice(0, 3).map((tag) => (
                    <span
                      key={tag}
                      className={cn(
                        "text-[10px] px-1.5 py-0.5 rounded border font-medium",
                        getTagColor(tag)
                      )}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              {item.description && (
                <p className="text-xs text-white/70 leading-relaxed line-clamp-2">
                  {item.description}
                </p>
              )}

              <div className="flex items-start gap-1.5 text-xs">
                <Sparkles className={cn("h-3 w-3 mt-0.5 shrink-0",
                  color === "green" ? "text-emerald-400" : color === "yellow" ? "text-amber-400" : "text-zinc-400"
                )} />
                <span className="text-white/60">{item.explanation}</span>
              </div>

              <div className="flex items-center gap-1 pt-1">
                <Button
                  size="icon"
                  variant="ghost"
                  className="text-white/70 hover:text-white"
                  onClick={() => interactMutation.mutate({ itemId: item.id, action: "skip" })}
                  disabled={interactMutation.isPending}
                  data-testid={`button-skip-${item.id}`}
                >
                  <SkipForward className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="text-white/70 hover:text-white"
                  onClick={() => interactMutation.mutate({ itemId: item.id, action: "like" })}
                  disabled={interactMutation.isPending}
                  data-testid={`button-like-${item.id}`}
                >
                  <ThumbsUp className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="text-white/70 hover:text-white"
                  onClick={() => interactMutation.mutate({ itemId: item.id, action: "save" })}
                  disabled={interactMutation.isPending}
                  data-testid={`button-save-${item.id}`}
                >
                  <Bookmark className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function HobbiesSection() {
  const { data: hobbies, isLoading } = useQuery<HobbyWithMatch[]>({
    queryKey: ["/api/explore/hobbies"],
  });

  if (isLoading) {
    return (
      <div className="flex gap-4 overflow-x-auto px-4 sm:px-6 pb-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-72 w-64 shrink-0 rounded-md" />
        ))}
      </div>
    );
  }

  if (!hobbies || hobbies.length === 0) {
    return (
      <div className="px-4 sm:px-6">
        <Card className="p-8 text-center">
          <div className="text-muted-foreground space-y-2">
            <Compass className="h-10 w-10 mx-auto opacity-30" />
            <p className="text-sm">Complete your onboarding to get hobby recommendations.</p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex gap-4 overflow-x-auto px-4 sm:px-6 pb-4 no-scrollbar snap-x snap-mandatory">
      {hobbies.map((hobby) => {
        const color = getScoreColor(hobby.matchScore);
        const image = getHobbyImage(hobby.title);
        return (
          <div
            key={hobby.id}
            className="relative shrink-0 w-72 h-[340px] rounded-md overflow-hidden snap-start"
            data-testid={`card-hobby-${hobby.id}`}
          >
            <img
              src={image || DOMAIN_IMAGES.hobbies}
              alt={hobby.title}
              className="absolute inset-0 w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-black/20" />

            <div className="relative h-full flex flex-col justify-end p-4 space-y-2.5">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-bold text-white text-lg leading-tight drop-shadow-sm">
                  {hobby.title}
                </h3>
                <MatchPill score={hobby.matchScore} size="sm" showLabel={false} />
              </div>

              {hobby.tags && (
                <div className="flex flex-wrap gap-1">
                  {hobby.tags.slice(0, 4).map((tag) => (
                    <span
                      key={tag}
                      className={cn(
                        "text-[10px] px-1.5 py-0.5 rounded border font-medium",
                        getTagColor(tag)
                      )}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              {hobby.description && (
                <p className="text-xs text-white/70 leading-relaxed line-clamp-2">
                  {hobby.description}
                </p>
              )}

              <div className="flex items-start gap-1.5 text-xs">
                <Sparkles className={cn("h-3 w-3 mt-0.5 shrink-0",
                  color === "green" ? "text-emerald-400" : color === "yellow" ? "text-amber-400" : "text-zinc-400"
                )} />
                <span className="text-white/60">{hobby.whyItFits}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
