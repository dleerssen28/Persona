import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { MatchPill, MatchGlow } from "@/components/match-pill";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { type Item, type Domain } from "@shared/schema";
import {
  Film, Music, Gamepad2, UtensilsCrossed,
  Heart, Bookmark, SkipForward, Info, ThumbsUp
} from "lucide-react";
import { useState } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const REC_DOMAINS: Domain[] = ["movies", "music", "games", "food"];

const DOMAIN_ICONS: Record<string, typeof Film> = {
  movies: Film,
  music: Music,
  games: Gamepad2,
  food: UtensilsCrossed,
};

const DOMAIN_LABELS: Record<string, string> = {
  movies: "Movies",
  music: "Music",
  games: "Games",
  food: "Food",
};

interface RecommendedItem extends Item {
  matchScore: number;
  explanation: string;
}

function getScoreColor(score: number) {
  if (score >= 75) return "green" as const;
  if (score >= 50) return "yellow" as const;
  return "red" as const;
}

const COLOR_TEXT = {
  green: "text-emerald-400",
  yellow: "text-amber-400",
  red: "text-rose-400",
};

const COLOR_BG_BADGE = {
  green: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  yellow: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  red: "bg-rose-500/15 text-rose-400 border-rose-500/30",
};

export default function RecommendationsPage() {
  const [activeDomain, setActiveDomain] = useState<Domain>("movies");

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-recommendations-title">
          Recommended For You
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Content matched to your Taste DNA. Green = perfect match, yellow = good fit, red = not your vibe.
        </p>
      </div>

      <Tabs value={activeDomain} onValueChange={(v) => setActiveDomain(v as Domain)}>
        <TabsList className="w-full flex flex-wrap h-auto gap-1 bg-transparent p-0">
          {REC_DOMAINS.map((domain) => {
            const Icon = DOMAIN_ICONS[domain];
            return (
              <TabsTrigger
                key={domain}
                value={domain}
                className="flex items-center gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                data-testid={`tab-domain-${domain}`}
              >
                <Icon className="h-3.5 w-3.5" />
                {DOMAIN_LABELS[domain]}
              </TabsTrigger>
            );
          })}
        </TabsList>

        {REC_DOMAINS.map((domain) => (
          <TabsContent key={domain} value={domain} className="mt-4">
            <DomainRecommendations domain={domain} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

function DomainRecommendations({ domain }: { domain: Domain }) {
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Skeleton key={i} className="h-48 rounded-md" />
        ))}
      </div>
    );
  }

  if (!items || items.length === 0) {
    return (
      <Card className="p-8 text-center">
        <div className="text-muted-foreground space-y-2">
          <Film className="h-10 w-10 mx-auto opacity-30" />
          <p className="text-sm">No recommendations yet. Complete your onboarding to get started.</p>
        </div>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {items.map((item) => {
        const color = getScoreColor(item.matchScore);
        return (
          <MatchGlow key={item.id} score={item.matchScore}>
            <Card className="overflow-visible p-4 space-y-3 h-full flex flex-col">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <h3
                    className={cn("font-bold text-sm", COLOR_TEXT[color])}
                    data-testid={`text-item-title-${item.id}`}
                  >
                    {item.title}
                  </h3>
                  {item.tags && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {item.tags.slice(0, 3).map((tag) => (
                        <span
                          key={tag}
                          className={cn(
                            "text-[10px] px-1.5 py-0.5 rounded border font-medium",
                            COLOR_BG_BADGE[color]
                          )}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <MatchPill score={item.matchScore} size="sm" showLabel={false} />
              </div>

              {item.description && (
                <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2 flex-1">
                  {item.description}
                </p>
              )}

              <div className="flex items-start gap-1.5 text-xs px-1">
                <Info className={cn("h-3 w-3 mt-0.5 shrink-0",
                  color === "green" ? "text-emerald-400" : color === "yellow" ? "text-amber-400" : "text-rose-400"
                )} />
                <span className="text-muted-foreground">{item.explanation}</span>
              </div>

              <div className="flex items-center justify-end gap-0.5 pt-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => interactMutation.mutate({ itemId: item.id, action: "skip" })}
                      disabled={interactMutation.isPending}
                      data-testid={`button-skip-${item.id}`}
                    >
                      <SkipForward className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Not for me</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => interactMutation.mutate({ itemId: item.id, action: "like" })}
                      disabled={interactMutation.isPending}
                      data-testid={`button-like-${item.id}`}
                    >
                      <ThumbsUp className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Like this</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => interactMutation.mutate({ itemId: item.id, action: "love" })}
                      disabled={interactMutation.isPending}
                      data-testid={`button-love-${item.id}`}
                    >
                      <Heart className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Love it</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => interactMutation.mutate({ itemId: item.id, action: "save" })}
                      disabled={interactMutation.isPending}
                      data-testid={`button-save-${item.id}`}
                    >
                      <Bookmark className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Save for later</TooltipContent>
                </Tooltip>
              </div>
            </Card>
          </MatchGlow>
        );
      })}
    </div>
  );
}
