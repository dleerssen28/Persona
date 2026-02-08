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
  Bookmark, SkipForward, ThumbsUp, Sparkles, ChevronDown, ChevronUp
} from "lucide-react";
import { useState, useRef, useEffect, useCallback } from "react";
import { getItemImage } from "@/lib/item-images";
import { getHobbyImage } from "@/lib/hobby-images";

import domainMovies from "@/assets/images/domain-movies.jpg";
import domainMusic from "@/assets/images/domain-music.jpg";
import domainGames from "@/assets/images/domain-games.jpg";
import domainFood from "@/assets/images/domain-food.jpg";
import domainHobbies from "@/assets/images/domain-hobbies.jpg";

type ContentDomain = "movies" | "music" | "games" | "food" | "hobbies";

const DOMAINS: { key: ContentDomain; label: string; icon: typeof Film }[] = [
  { key: "movies", label: "Movies", icon: Film },
  { key: "music", label: "Music", icon: Music },
  { key: "games", label: "Games", icon: Gamepad2 },
  { key: "food", label: "Food", icon: UtensilsCrossed },
  { key: "hobbies", label: "Hobbies", icon: Compass },
];

const DOMAIN_FALLBACK: Record<string, string> = {
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
    <div className="flex flex-col" style={{ height: "calc(100dvh - 3.5rem - 3.5rem)" }}>
      <div className="flex gap-2 overflow-x-auto px-4 sm:px-6 py-2 no-scrollbar bg-background/95 backdrop-blur-sm shrink-0 border-b border-border/30">
        {DOMAINS.map((domain) => {
          const Icon = domain.icon;
          const isActive = activeDomain === domain.key;
          return (
            <button
              key={domain.key}
              onClick={() => setActiveDomain(domain.key)}
              className={cn(
                "flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-colors border shrink-0",
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

      <div className="flex-1 min-h-0">
        {activeDomain === "hobbies" ? (
          <HobbiesSection />
        ) : (
          <DomainRecommendations domain={activeDomain} />
        )}
      </div>
    </div>
  );
}

function DomainRecommendations({ domain }: { domain: ContentDomain }) {
  const { toast } = useToast();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [currentIndex, setCurrentIndex] = useState(0);

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
      queryClient.invalidateQueries({ queryKey: ["/api/interactions/collection"] });
    },
    onError: (err) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  useEffect(() => {
    setCurrentIndex(0);
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [domain]);

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const container = scrollRef.current;
    const itemHeight = container.clientHeight;
    if (itemHeight > 0) {
      const index = Math.round(container.scrollTop / itemHeight);
      setCurrentIndex(index);
    }
  }, []);

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="space-y-4 text-center">
          <Skeleton className="h-12 w-12 mx-auto rounded-md" />
          <Skeleton className="h-4 w-40 mx-auto" />
        </div>
      </div>
    );
  }

  if (!items || items.length === 0) {
    return (
      <div className="h-full flex items-center justify-center px-6">
        <Card className="p-8 text-center max-w-sm">
          <div className="text-muted-foreground space-y-2">
            <Film className="h-10 w-10 mx-auto opacity-30" />
            <p className="text-sm">No recommendations yet. Complete your onboarding to get started.</p>
          </div>
        </Card>
      </div>
    );
  }

  const total = items.length;

  return (
    <div className="relative h-full">
      <div
        ref={scrollRef}
        className="h-full overflow-y-auto snap-y snap-mandatory"
        onScroll={handleScroll}
        data-testid="snap-scroll-container"
      >
        {items.map((item, idx) => {
          const color = getScoreColor(item.matchScore);
          const itemImage = getItemImage(item.title);
          const fallback = DOMAIN_FALLBACK[domain];
          const isVisible = idx === currentIndex;
          return (
            <div
              key={item.id}
              className="snap-start w-full h-full relative shrink-0"
              data-testid={`card-item-${item.id}`}
            >
              <img
                src={itemImage || fallback}
                alt={item.title}
                className="absolute inset-0 w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/30 to-black/5" />

              <div className="absolute top-4 right-4">
                <MatchPill score={item.matchScore} size="md" showLabel />
              </div>

              <div className="absolute top-4 left-4 flex items-center gap-2 text-white/40 text-xs font-medium">
                <span>{idx + 1} / {total}</span>
              </div>

              <div className={cn(
                "absolute bottom-0 left-0 right-0 p-5 sm:p-6 flex flex-col gap-3 transition-all duration-500",
                isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
              )}>
                <h2
                  className="font-bold text-white text-2xl sm:text-3xl leading-tight drop-shadow-lg"
                  data-testid={`text-item-title-${item.id}`}
                >
                  {item.title}
                </h2>

                {item.tags && (
                  <div className="flex flex-wrap gap-1.5">
                    {item.tags.map((tag) => (
                      <span
                        key={tag}
                        className={cn(
                          "text-[11px] px-2 py-0.5 rounded border font-medium",
                          getTagColor(tag)
                        )}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                {item.description && (
                  <p className="text-sm text-white/80 leading-relaxed max-w-md" data-testid={`text-synopsis-${item.id}`}>
                    {item.description}
                  </p>
                )}

                <div className="flex items-start gap-2 text-xs">
                  <Sparkles className={cn("h-3.5 w-3.5 mt-0.5 shrink-0",
                    color === "green" ? "text-emerald-400" : color === "yellow" ? "text-amber-400" : "text-zinc-400"
                  )} />
                  <span className="text-white/60 italic">{item.explanation}</span>
                </div>

                <div className="flex items-center gap-1 pt-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="text-white/60"
                    onClick={() => interactMutation.mutate({ itemId: item.id, action: "skip" })}
                    disabled={interactMutation.isPending}
                    data-testid={`button-skip-${item.id}`}
                  >
                    <SkipForward className="h-5 w-5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="text-white/60"
                    onClick={() => interactMutation.mutate({ itemId: item.id, action: "like" })}
                    disabled={interactMutation.isPending}
                    data-testid={`button-like-${item.id}`}
                  >
                    <ThumbsUp className="h-5 w-5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="text-white/60"
                    onClick={() => interactMutation.mutate({ itemId: item.id, action: "save" })}
                    disabled={interactMutation.isPending}
                    data-testid={`button-save-${item.id}`}
                  >
                    <Bookmark className="h-5 w-5" />
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {currentIndex < total - 1 && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 animate-bounce pointer-events-none">
          <ChevronDown className="h-5 w-5 text-white/30" />
        </div>
      )}

      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex flex-col gap-1.5 pointer-events-none">
        {items.slice(0, Math.min(total, 12)).map((_, idx) => (
          <div
            key={idx}
            className={cn(
              "w-1.5 rounded-full transition-all duration-300",
              idx === currentIndex
                ? "h-4 bg-white/80"
                : "h-1.5 bg-white/25"
            )}
          />
        ))}
      </div>
    </div>
  );
}

function HobbiesSection() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [currentIndex, setCurrentIndex] = useState(0);

  const { data: hobbies, isLoading } = useQuery<HobbyWithMatch[]>({
    queryKey: ["/api/explore/hobbies"],
  });

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const container = scrollRef.current;
    const itemHeight = container.clientHeight;
    if (itemHeight > 0) {
      const index = Math.round(container.scrollTop / itemHeight);
      setCurrentIndex(index);
    }
  }, []);

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="space-y-4 text-center">
          <Skeleton className="h-12 w-12 mx-auto rounded-md" />
          <Skeleton className="h-4 w-40 mx-auto" />
        </div>
      </div>
    );
  }

  if (!hobbies || hobbies.length === 0) {
    return (
      <div className="h-full flex items-center justify-center px-6">
        <Card className="p-8 text-center max-w-sm">
          <div className="text-muted-foreground space-y-2">
            <Compass className="h-10 w-10 mx-auto opacity-30" />
            <p className="text-sm">Complete your onboarding to get hobby recommendations.</p>
          </div>
        </Card>
      </div>
    );
  }

  const total = hobbies.length;

  return (
    <div className="relative h-full">
      <div
        ref={scrollRef}
        className="h-full overflow-y-auto snap-y snap-mandatory"
        onScroll={handleScroll}
        data-testid="snap-scroll-container-hobbies"
      >
        {hobbies.map((hobby, idx) => {
          const color = getScoreColor(hobby.matchScore);
          const image = getHobbyImage(hobby.title);
          const isVisible = idx === currentIndex;
          return (
            <div
              key={hobby.id}
              className="snap-start w-full h-full relative shrink-0"
              data-testid={`card-hobby-${hobby.id}`}
            >
              <img
                src={image || DOMAIN_FALLBACK.hobbies}
                alt={hobby.title}
                className="absolute inset-0 w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/30 to-black/5" />

              <div className="absolute top-4 right-4">
                <MatchPill score={hobby.matchScore} size="md" showLabel />
              </div>

              <div className="absolute top-4 left-4 flex items-center gap-2 text-white/40 text-xs font-medium">
                <span>{idx + 1} / {total}</span>
              </div>

              <div className={cn(
                "absolute bottom-0 left-0 right-0 p-5 sm:p-6 flex flex-col gap-3 transition-all duration-500",
                isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
              )}>
                <h2 className="font-bold text-white text-2xl sm:text-3xl leading-tight drop-shadow-lg">
                  {hobby.title}
                </h2>

                {hobby.tags && (
                  <div className="flex flex-wrap gap-1.5">
                    {hobby.tags.map((tag) => (
                      <span
                        key={tag}
                        className={cn(
                          "text-[11px] px-2 py-0.5 rounded border font-medium",
                          getTagColor(tag)
                        )}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                {hobby.description && (
                  <p className="text-sm text-white/80 leading-relaxed max-w-md" data-testid={`text-hobby-desc-${hobby.id}`}>
                    {hobby.description}
                  </p>
                )}

                <div className="flex items-start gap-2 text-xs">
                  <Sparkles className={cn("h-3.5 w-3.5 mt-0.5 shrink-0",
                    color === "green" ? "text-emerald-400" : color === "yellow" ? "text-amber-400" : "text-zinc-400"
                  )} />
                  <span className="text-white/60 italic">{hobby.whyItFits}</span>
                </div>

                {hobby.usersDoingIt > 0 && (
                  <p className="text-xs text-white/40">{hobby.usersDoingIt} people are into this</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {currentIndex < total - 1 && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 animate-bounce pointer-events-none">
          <ChevronDown className="h-5 w-5 text-white/30" />
        </div>
      )}

      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex flex-col gap-1.5 pointer-events-none">
        {hobbies.slice(0, Math.min(total, 12)).map((_, idx) => (
          <div
            key={idx}
            className={cn(
              "w-1.5 rounded-full transition-all duration-300",
              idx === currentIndex
                ? "h-4 bg-white/80"
                : "h-1.5 bg-white/25"
            )}
          />
        ))}
      </div>
    </div>
  );
}
