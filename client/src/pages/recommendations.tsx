import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { MatchPill } from "@/components/match-pill";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { type Item } from "@shared/schema";
import { getClubImage } from "@/lib/club-images";
import {
  GraduationCap, Briefcase, Users, Trophy, Heart,
  Bookmark, SkipForward, ThumbsUp, Sparkles, ChevronDown,
  MapPin, Clock, Calendar, DollarSign, ExternalLink,
  ArrowUpDown, SlidersHorizontal, Info,
  SearchX, RotateCcw,
} from "lucide-react";
import { SiInstagram } from "react-icons/si";
import { useState, useRef, useEffect, useCallback } from "react";

const SCROLL_KEY = "persona_clubs_scroll";

type CampusDomain = "academic" | "professional" | "social" | "sports" | "volunteering";

const DOMAINS: { key: CampusDomain; label: string; icon: typeof GraduationCap }[] = [
  { key: "academic", label: "Academic", icon: GraduationCap },
  { key: "professional", label: "Professional", icon: Briefcase },
  { key: "social", label: "Social", icon: Users },
  { key: "sports", label: "Sports", icon: Trophy },
  { key: "volunteering", label: "Volunteering", icon: Heart },
];

const DOMAIN_GRADIENTS: Record<CampusDomain, string> = {
  academic: "from-blue-900 via-indigo-900 to-slate-900",
  professional: "from-slate-800 via-zinc-900 to-neutral-900",
  social: "from-purple-900 via-fuchsia-900 to-pink-900",
  sports: "from-green-900 via-emerald-900 to-teal-900",
  volunteering: "from-amber-900 via-orange-900 to-red-900",
};

interface ClubMutual {
  id: string;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
  matchScore: number;
}

interface RecommendedClub extends Item {
  matchScore: number;
  explanation: string;
  traitExplanation: string;
  vectorScore: number;
  cfScore: number;
  scoringMethod: string;
  fallbackReason: string;
  urgencyScore: number;
  urgencyLabel: string;
  deadline: string | null;
  mutualsInClubCount: number;
  mutualsInClubPreview: ClubMutual[];
  whyShort: string;
  whyLong: string;
  matchMathTooltip: string;
}

type SortMode = "match" | "urgency";

function getScoreColor(score: number) {
  if (score >= 75) return "green" as const;
  if (score >= 50) return "yellow" as const;
  return "grey" as const;
}

function formatMeetingDate(dateStr: string | null): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getUrgencyBadgeStyle(label: string): string {
  switch (label) {
    case "meeting today":
    case "last chance":
      return "bg-red-500/20 text-red-300 border-red-500/40";
    case "meeting tomorrow":
    case "closing soon":
      return "bg-orange-500/20 text-orange-300 border-orange-500/40";
    case "this week":
      return "bg-yellow-500/20 text-yellow-300 border-yellow-500/40";
    case "upcoming":
      return "bg-blue-500/20 text-blue-300 border-blue-500/40";
    default:
      return "bg-zinc-500/20 text-zinc-300 border-zinc-500/40";
  }
}

export default function RecommendationsPage() {
  const [selectedDomains, setSelectedDomains] = useState<Set<CampusDomain>>(new Set());
  const [sortMode, setSortMode] = useState<SortMode>("match");

  const toggleDomain = (key: CampusDomain) => {
    setSelectedDomains(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const activeDomains = selectedDomains.size === 0
    ? DOMAINS.map(d => d.key)
    : Array.from(selectedDomains);

  return (
    <div className="flex flex-col" style={{ height: "calc(100dvh - 3.5rem - 3.5rem)" }}>
      <div className="shrink-0 border-b border-border/30 bg-background/95 backdrop-blur-sm">
        <div className="flex items-center gap-2 overflow-x-auto px-4 sm:px-6 py-2 no-scrollbar">
          {DOMAINS.map((domain) => {
            const Icon = domain.icon;
            const isActive = selectedDomains.has(domain.key);
            return (
              <button
                key={domain.key}
                onClick={() => toggleDomain(domain.key)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-colors border shrink-0",
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

          <div className="w-px h-6 bg-border/50 shrink-0 mx-1" />

          <button
            onClick={() => setSortMode(sortMode === "match" ? "urgency" : "match")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-colors border shrink-0",
              "bg-muted/50 text-muted-foreground border-border/50 hover-elevate"
            )}
            data-testid="button-sort-toggle"
          >
            <ArrowUpDown className="h-3.5 w-3.5" />
            {sortMode === "match" ? "Recommended" : "Upcoming"}
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0">
        <ClubRecommendations domains={activeDomains} sortMode={sortMode} />
      </div>
    </div>
  );
}

function ClubRecommendations({ domains, sortMode }: { domains: CampusDomain[]; sortMode: SortMode }) {
  const { toast } = useToast();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [currentIndex, setCurrentIndex] = useState(0);

  const results = useQuery<{ recommendations: RecommendedClub[]; communityPicks: any[] }[]>({
    queryKey: ["/api/recommendations/multi", domains.join(","), sortMode],
    queryFn: async () => {
      const promises = domains.map(d =>
        fetch(`/api/recommendations/${d}?sort=${sortMode}`, { credentials: "include" })
          .then(r => r.ok ? r.json() : { recommendations: [], communityPicks: [] })
      );
      return Promise.all(promises);
    },
  });

  const allClubs = (results.data || [])
    .flatMap(d => d.recommendations)
    .sort((a, b) =>
      sortMode === "urgency"
        ? b.urgencyScore - a.urgencyScore
        : b.matchScore - a.matchScore
    );

  const seen = new Set<string>();
  const clubs = allClubs.filter(c => {
    if (seen.has(c.id)) return false;
    seen.add(c.id);
    return true;
  });

  const interactMutation = useMutation({
    mutationFn: async ({ itemId, domain, action }: { itemId: string; domain: string; action: string }) => {
      await apiRequest("POST", "/api/interactions", { itemId, domain, action });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recommendations"] });
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
  }, [domains.join(","), sortMode]);

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const container = scrollRef.current;
    const itemHeight = container.clientHeight;
    if (itemHeight > 0) {
      const index = Math.round(container.scrollTop / itemHeight);
      setCurrentIndex(index);
      try { sessionStorage.setItem(SCROLL_KEY, String(index)); } catch {}
    }
  }, []);

  useEffect(() => {
    if (!scrollRef.current || clubs.length === 0) return;
    try {
      const saved = sessionStorage.getItem(SCROLL_KEY);
      if (saved) {
        const idx = parseInt(saved, 10);
        if (idx > 0 && idx < clubs.length) {
          requestAnimationFrame(() => {
            if (scrollRef.current) {
              scrollRef.current.scrollTop = idx * scrollRef.current.clientHeight;
              setCurrentIndex(idx);
            }
          });
        }
      }
    } catch {}
  }, [clubs.length]);

  if (results.isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="space-y-4 text-center">
          <Skeleton className="h-12 w-12 mx-auto rounded-md" />
          <Skeleton className="h-4 w-40 mx-auto" />
          <p className="text-sm text-muted-foreground">Finding clubs for you...</p>
        </div>
      </div>
    );
  }

  if (clubs.length === 0) {
    return (
      <div className="h-full flex items-center justify-center px-6">
        <Card className="p-8 text-center max-w-sm">
          <div className="text-muted-foreground space-y-2">
            <GraduationCap className="h-10 w-10 mx-auto opacity-30" />
            <p className="text-sm">No club recommendations yet. Complete your onboarding to get started.</p>
          </div>
        </Card>
      </div>
    );
  }

  const total = clubs.length;

  return (
    <div className="relative h-full">
      <div
        ref={scrollRef}
        className="h-full overflow-y-auto snap-y snap-mandatory"
        onScroll={handleScroll}
        data-testid="snap-scroll-container"
      >
        {clubs.map((club, idx) => {
          const color = getScoreColor(club.matchScore);
          const domainGradient = DOMAIN_GRADIENTS[(club.domain as CampusDomain)] || DOMAIN_GRADIENTS.academic;
          const isVisible = idx === currentIndex;
          return (
            <div
              key={club.id}
              className="snap-start w-full h-full relative shrink-0 will-change-transform"
              data-testid={`card-club-${club.id}`}
            >
              <img
                src={getClubImage(club.imageUrl)}
                alt=""
                className="absolute inset-0 w-full h-full object-cover"
                loading={idx < 3 ? "eager" : "lazy"}
              />
              <div className={cn("absolute inset-0 bg-gradient-to-br opacity-40", domainGradient)} />
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-black/10" />

              <div className="absolute top-4 right-4 flex items-center gap-2">
                {club.urgencyLabel && club.urgencyScore > 0 && (
                  <Badge
                    variant="outline"
                    className={cn("text-[11px]", getUrgencyBadgeStyle(club.urgencyLabel))}
                    data-testid={`badge-urgency-${club.id}`}
                  >
                    {club.urgencyLabel}
                  </Badge>
                )}
                <Popover>
                  <PopoverTrigger asChild>
                    <button data-testid={`match-score-${club.id}`} className="cursor-pointer">
                      <MatchPill score={club.matchScore} size="md" showLabel />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent side="left" className="max-w-xs bg-zinc-900 text-zinc-100 border-zinc-700 p-3 w-auto" data-testid={`tooltip-match-${club.id}`}>
                    <div className="space-y-1.5 text-xs">
                      {(club.matchMathTooltip || `Score: ${club.matchScore}%\nscoringMethod: ${club.scoringMethod}`).split("\n").map((line, i) => (
                        <p key={i} className={i === 0 ? "font-medium text-white" : "text-zinc-300"}>
                          {line}
                        </p>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>

              <div className="absolute top-4 left-4 flex items-center gap-2">
                <Badge
                  variant="outline"
                  className="text-[11px] bg-white/10 text-white/80 border-white/20"
                  data-testid={`badge-domain-${club.id}`}
                >
                  {club.domain}
                </Badge>
                <span className="text-white/40 text-xs font-medium">{idx + 1} / {total}</span>
              </div>

              <div className={cn(
                "absolute bottom-0 left-0 right-0 p-5 sm:p-6 flex flex-col gap-2.5 transition-all duration-500",
                isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
              )}>
                <h2
                  className="font-bold text-white text-2xl sm:text-3xl leading-tight drop-shadow-lg"
                  data-testid={`text-club-title-${club.id}`}
                >
                  {club.title}
                </h2>

                {club.description && (
                  <p className="text-sm text-white/80 leading-relaxed line-clamp-2" data-testid={`text-club-desc-${club.id}`}>
                    {club.description}
                  </p>
                )}

                <div className="flex flex-col gap-1.5 text-sm">
                  {club.nextMeetingAt && (
                    <div className="flex items-center gap-2 text-white/70">
                      <Calendar className="h-3.5 w-3.5 shrink-0" />
                      <span>Next: {formatMeetingDate(club.nextMeetingAt as unknown as string)}</span>
                    </div>
                  )}
                  {!club.nextMeetingAt && club.meetingDay && club.meetingTime && (
                    <div className="flex items-center gap-2 text-white/70">
                      <Clock className="h-3.5 w-3.5 shrink-0" />
                      <span>{club.meetingDay} at {club.meetingTime}</span>
                    </div>
                  )}
                  {club.meetingLocation && (
                    <div className="flex items-center gap-2 text-white/70">
                      <MapPin className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{club.meetingLocation}</span>
                    </div>
                  )}
                  {club.dues && (
                    <div className="flex items-center gap-2 text-white/70">
                      <DollarSign className="h-3.5 w-3.5 shrink-0" />
                      <span>{club.dues}</span>
                      {club.duesDeadline && (
                        <span className="text-white/40 text-xs">
                          (due {new Date(club.duesDeadline as unknown as string).toLocaleDateString("en-US", { month: "short", day: "numeric" })})
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <Popover>
                  <PopoverTrigger asChild>
                    <div className="flex items-start gap-2 text-xs cursor-pointer" data-testid={`why-${club.id}`}>
                      <Sparkles className={cn("h-3.5 w-3.5 mt-0.5 shrink-0",
                        color === "green" ? "text-emerald-400" : color === "yellow" ? "text-amber-400" : "text-zinc-400"
                      )} />
                      <span className="text-white/60">{club.whyShort || club.explanation}</span>
                      <Info className="h-3 w-3 shrink-0 mt-0.5 text-white/30" />
                    </div>
                  </PopoverTrigger>
                  <PopoverContent side="top" className="max-w-sm bg-zinc-900 text-zinc-100 border-zinc-700 p-3 w-auto" data-testid={`tooltip-why-${club.id}`}>
                    <p className="text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap">
                      {club.whyLong || club.traitExplanation || club.explanation}
                    </p>
                  </PopoverContent>
                </Popover>

                {club.mutualsInClubCount > 0 && (
                  <div className="flex items-center gap-2">
                    <div className="flex -space-x-2">
                      {club.mutualsInClubPreview.slice(0, 3).map((m) => (
                        <Avatar key={m.id} className="h-6 w-6 border-2 border-black/50">
                          <AvatarImage src={m.profileImageUrl || undefined} />
                          <AvatarFallback className="text-[9px] bg-zinc-700 text-white">
                            {(m.firstName?.[0] || "") + (m.lastName?.[0] || "")}
                          </AvatarFallback>
                        </Avatar>
                      ))}
                    </div>
                    <span className="text-xs text-white/50">
                      {club.mutualsInClubPreview.slice(0, 2).map(m => m.firstName).join(", ")}
                      {club.mutualsInClubCount > 2 && ` +${club.mutualsInClubCount - 2} more`}
                      {" "}similar to you
                    </span>
                  </div>
                )}

                <div className="flex items-center gap-1 pt-1 flex-wrap">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="text-white/60"
                    onClick={() => interactMutation.mutate({ itemId: club.id, domain: club.domain, action: "skip" })}
                    disabled={interactMutation.isPending}
                    data-testid={`button-skip-${club.id}`}
                  >
                    <SkipForward className="h-5 w-5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="text-white/60"
                    onClick={() => interactMutation.mutate({ itemId: club.id, domain: club.domain, action: "like" })}
                    disabled={interactMutation.isPending}
                    data-testid={`button-like-${club.id}`}
                  >
                    <ThumbsUp className="h-5 w-5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="text-white/60"
                    onClick={() => interactMutation.mutate({ itemId: club.id, domain: club.domain, action: "save" })}
                    disabled={interactMutation.isPending}
                    data-testid={`button-save-${club.id}`}
                  >
                    <Bookmark className="h-5 w-5" />
                  </Button>

                  <div className="flex-1" />

                  {club.signupUrl && (
                    <Button
                      variant="outline"
                      className="bg-white/10 text-white border-white/20 backdrop-blur-sm text-xs"
                      onClick={() => window.open(club.signupUrl!, "_blank")}
                      data-testid={`button-signup-${club.id}`}
                    >
                      <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                      Sign Up
                    </Button>
                  )}
                  <Button
                    size="icon"
                    variant="outline"
                    className="bg-white/10 text-white border-white/20 backdrop-blur-sm"
                    onClick={() => window.open("https://instagram.com/therock/", "_blank")}
                    data-testid={`button-instagram-${club.id}`}
                  >
                    <SiInstagram className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
        <div className="snap-start w-full h-full relative shrink-0 flex items-center justify-center bg-gradient-to-b from-zinc-900 to-black" data-testid="end-of-clubs">
          <div className="text-center space-y-4 px-8">
            <SearchX className="h-12 w-12 mx-auto text-primary/60" />
            <h3 className="text-xl font-bold text-white">You've seen all clubs</h3>
            <p className="text-sm text-white/50">Explore other categories or check back as new clubs are added</p>
            <Button
              variant="outline"
              className="bg-white/10 text-white border-white/20"
              onClick={() => {
                if (scrollRef.current) {
                  scrollRef.current.scrollTo({ top: 0, behavior: "smooth" });
                  setCurrentIndex(0);
                  try { sessionStorage.setItem(SCROLL_KEY, "0"); } catch {}
                }
              }}
              data-testid="button-restart-clubs"
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Back to top
            </Button>
          </div>
        </div>
      </div>

      {currentIndex < total && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 animate-bounce pointer-events-none">
          <ChevronDown className="h-5 w-5 text-white/30" />
        </div>
      )}

      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex flex-col gap-1.5 pointer-events-none">
        {clubs.slice(0, Math.min(total, 12)).map((_, idx) => (
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
