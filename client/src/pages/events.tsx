import { useState, useRef, useCallback, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useSearch } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { getEventImage } from "@/lib/event-images";
import { MatchPill } from "@/components/match-pill";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  MapPin, Clock, Users, Hand, ChevronDown,
  Filter, Tag, Sparkles, AlertCircle, Info,
  PartyPopper, RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";

const SCROLL_KEY = "persona_events_scroll";

type EventFilter = "all" | "deals" | "campus" | "parties" | "study" | "shows" | "misc";

interface MutualFriend {
  id: string;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
  matchPercent: number;
}

interface AttendeePreview {
  id: string;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
}

interface EventData {
  id: string;
  title: string;
  description: string | null;
  category: string;
  location: string | null;
  dateTime: string | null;
  imageUrl: string | null;
  tags: string[] | null;
  organizerName: string | null;
  clubName: string | null;
  cost: string | null;
  rsvpLimit: number | null;
  locationDetails: string | null;
  priceInfo: string | null;
  isDeal: boolean;
  dealExpiresAt: string | null;
  personaScore: number;
  socialScore: number;
  urgencyScore: number;
  finalScore: number;
  urgencyLabel: string;
  deadline: string | null;
  mutualFriendsGoingCount: number;
  mutualFriendsPreview: MutualFriend[];
  attendeePreview: AttendeePreview[];
  whyShort: string;
  whyLong: string;
  matchMathTooltip: string;
  whyRecommended: string;
  hasRsvpd: boolean;
  rsvpCount: number;
  scoringMethod: string;
  fallbackReason: string | null;
}

function formatEventDate(dateStr: string | null): string {
  if (!dateStr) return "TBD";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function matchesFilters(event: EventData, filters: Set<EventFilter>): boolean {
  if (filters.size === 0 || filters.has("all")) return true;
  if (filters.has("deals") && (event.isDeal || event.category === "deals")) return true;
  if (filters.has("campus") && event.category === "campus") return true;
  if (filters.has("parties") && event.category === "parties") return true;
  if (filters.has("study") && event.category === "study") return true;
  if (filters.has("shows") && event.category === "shows") return true;
  if (filters.has("misc") && event.category === "misc") return true;
  return false;
}

const FILTER_OPTIONS: { value: EventFilter; label: string }[] = [
  { value: "all", label: "For You" },
  { value: "deals", label: "Deals" },
  { value: "campus", label: "Campus" },
  { value: "parties", label: "Parties" },
  { value: "study", label: "Study" },
  { value: "shows", label: "Shows" },
  { value: "misc", label: "Misc" },
];

export default function EventsPage() {
  const [activeFilters, setActiveFilters] = useState<Set<EventFilter>>(() => new Set<EventFilter>(["all"]));
  const scrollRef = useRef<HTMLDivElement>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const searchString = useSearch();
  const highlightEventId = new URLSearchParams(searchString).get("event");

  const { data: events, isLoading } = useQuery<EventData[]>({
    queryKey: ["/api/events/for-you"],
    queryFn: async () => {
      const res = await fetch("/api/events/for-you", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch events");
      return res.json();
    },
  });

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
    if (!scrollRef.current || !events?.length) return;
    try {
      const saved = sessionStorage.getItem(SCROLL_KEY);
      if (saved && !highlightEventId) {
        const idx = parseInt(saved, 10);
        if (idx > 0 && idx < events.length) {
          requestAnimationFrame(() => {
            if (scrollRef.current) {
              scrollRef.current.scrollTop = idx * scrollRef.current.clientHeight;
              setCurrentIndex(idx);
            }
          });
        }
      }
    } catch {}
  }, [events, highlightEventId]);

  const toggleFilter = useCallback((filter: EventFilter) => {
    setActiveFilters(prev => {
      const next = new Set<EventFilter>(prev);
      if (filter === "all") {
        return new Set<EventFilter>(["all"]);
      }
      next.delete("all");
      if (next.has(filter)) {
        next.delete(filter);
      } else {
        next.add(filter);
      }
      if (next.size === 0) return new Set<EventFilter>(["all"]);
      return next;
    });
    setCurrentIndex(0);
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center" style={{ height: "calc(100dvh - 3.5rem - 3.5rem)" }}>
        <div className="space-y-4 text-center">
          <Skeleton className="h-12 w-12 mx-auto rounded-md" />
          <Skeleton className="h-4 w-40 mx-auto" />
          <p className="text-sm text-muted-foreground">Finding events for you...</p>
        </div>
      </div>
    );
  }

  const filteredEvents = (() => {
    let filtered = (events || []).filter(e => matchesFilters(e, activeFilters));
    if (highlightEventId) {
      const idx = filtered.findIndex(e => String(e.id) === highlightEventId);
      if (idx > 0) {
        const [highlighted] = filtered.splice(idx, 1);
        filtered = [highlighted, ...filtered];
      } else if (idx === -1) {
        const allEvents = events || [];
        const found = allEvents.find(e => String(e.id) === highlightEventId);
        if (found) {
          filtered = [found, ...filtered];
        }
      }
    }
    return filtered;
  })();

  return (
    <div className="flex flex-col" style={{ height: "calc(100dvh - 3.5rem - 3.5rem)" }}>
      <div className="flex items-center gap-2 px-4 py-2 bg-background/95 backdrop-blur-sm shrink-0 border-b border-border/30 overflow-x-auto no-scrollbar">
        <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
        {FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => toggleFilter(opt.value)}
            className={cn(
              "px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-colors border shrink-0",
              activeFilters.has(opt.value)
                ? "bg-primary/15 text-primary border-primary/30"
                : "text-muted-foreground border-border/50"
            )}
            data-testid={`button-filter-${opt.value}`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {filteredEvents.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-muted-foreground text-sm">No events found</p>
        </div>
      ) : (
        <div className="relative flex-1">
          <div
            ref={scrollRef}
            className="h-full overflow-y-auto snap-y snap-mandatory"
            onScroll={handleScroll}
            data-testid="events-scroll-container"
          >
            {filteredEvents.map((event, idx) => (
              <EventCard
                key={event.id}
                event={event}
                isVisible={idx === currentIndex}
              />
            ))}
            <div className="snap-start w-full h-full relative shrink-0 flex items-center justify-center bg-gradient-to-b from-zinc-900 to-black" data-testid="end-of-events">
              <div className="text-center space-y-4 px-8">
                <PartyPopper className="h-12 w-12 mx-auto text-primary/60" />
                <h3 className="text-xl font-bold text-white">You've seen all events</h3>
                <p className="text-sm text-white/50">Check back later for new happenings around campus</p>
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
                  data-testid="button-restart-events"
                >
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Back to top
                </Button>
              </div>
            </div>
          </div>

          {filteredEvents.length > 1 && currentIndex < filteredEvents.length && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 animate-bounce pointer-events-none">
              <ChevronDown className="h-6 w-6 text-white/60" />
            </div>
          )}

          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex flex-col gap-1">
            {filteredEvents.slice(0, Math.min(filteredEvents.length, 12)).map((_, idx) => (
              <div
                key={idx}
                className={cn(
                  "w-1 rounded-full transition-all",
                  idx === currentIndex ? "h-4 bg-white" : "h-2 bg-white/30"
                )}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function EventCard({ event, isVisible }: { event: EventData; isVisible: boolean }) {
  const { toast } = useToast();
  const eventImage = getEventImage(event.imageUrl);

  const rsvpMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/events/${event.id}/rsvp`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events/for-you"] });
    },
    onError: (err) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const urgencyColor = event.urgencyScore >= 90
    ? "bg-red-500/20 text-red-300 border-red-500/40"
    : event.urgencyScore >= 75
    ? "bg-orange-500/20 text-orange-300 border-orange-500/40"
    : event.urgencyScore >= 50
    ? "bg-yellow-500/20 text-yellow-300 border-yellow-500/40"
    : "bg-zinc-500/20 text-zinc-300 border-zinc-500/40";

  return (
    <div
      className="snap-start w-full h-full relative shrink-0"
      data-testid={`card-event-${event.id}`}
    >
      <img
        src={eventImage}
        alt={event.title}
        className="absolute inset-0 w-full h-full object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/40 to-black/10" />

      <div className="absolute top-3 left-3 flex items-center gap-2 flex-wrap">
        <Badge
          variant="outline"
          className={cn("text-xs border no-default-hover-elevate no-default-active-elevate", getCategoryStyle(event.category))}
          data-testid={`badge-category-${event.id}`}
        >
          {formatCategory(event.category)}
        </Badge>
        {event.isDeal && (
          <Badge variant="outline" className="text-xs border bg-emerald-500/20 text-emerald-300 border-emerald-500/40 no-default-hover-elevate no-default-active-elevate" data-testid={`badge-deal-${event.id}`}>
            <Tag className="h-3 w-3 mr-1" />
            Deal
          </Badge>
        )}
        {event.urgencyScore >= 50 && (
          <Badge variant="outline" className={cn("text-xs border no-default-hover-elevate no-default-active-elevate", urgencyColor)} data-testid={`badge-urgency-${event.id}`}>
            <AlertCircle className="h-3 w-3 mr-1" />
            {event.urgencyLabel}
          </Badge>
        )}
      </div>

      <div className="absolute top-3 right-3">
        <Popover>
          <PopoverTrigger asChild>
            <button data-testid={`match-score-${event.id}`} className="cursor-pointer">
              <MatchPill score={event.finalScore} size="sm" />
            </button>
          </PopoverTrigger>
          <PopoverContent side="left" className="max-w-xs bg-zinc-900 text-zinc-100 border-zinc-700 p-3 w-auto" data-testid={`tooltip-match-${event.id}`}>
            <div className="space-y-1.5 text-xs">
              {event.matchMathTooltip?.split("\n").map((line, i) => (
                <p key={i} className={i === 0 ? "font-medium text-white" : "text-zinc-300"}>
                  {line}
                </p>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <div className="absolute bottom-0 left-0 right-0 p-4 space-y-3">
        <div>
          <h2 className="text-2xl font-bold text-white leading-tight" data-testid={`text-event-title-${event.id}`}>
            {event.title}
          </h2>
          {event.organizerName && (
            <p className="text-sm text-white/60 mt-0.5">by {event.organizerName}</p>
          )}
        </div>

        {event.description && (
          <p className="text-sm text-white/80 line-clamp-2" data-testid={`text-event-desc-${event.id}`}>
            {event.description}
          </p>
        )}

        {event.priceInfo && (
          <div className="flex items-center gap-2 text-emerald-300 text-sm font-medium" data-testid={`text-price-${event.id}`}>
            <Tag className="h-3.5 w-3.5 shrink-0" />
            <span>{event.priceInfo}</span>
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          {event.location && (
            <div className="flex items-center gap-2 text-white/70 text-sm">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{event.location}</span>
            </div>
          )}
          {event.dateTime && (
            <div className="flex items-center gap-2 text-white/70 text-sm">
              <Clock className="h-3.5 w-3.5 shrink-0" />
              <span>{formatEventDate(event.dateTime)}</span>
            </div>
          )}
          <div className="flex items-center gap-2 text-white/70 text-sm">
            <Users className="h-3.5 w-3.5 shrink-0" />
            <span>{event.rsvpCount} going</span>
          </div>
        </div>

        {event.mutualFriendsGoingCount > 0 && (
          <div className="flex items-center gap-2" data-testid={`mutuals-${event.id}`}>
            <div className="flex -space-x-2">
              {event.mutualFriendsPreview.slice(0, 3).map((f) => (
                <Avatar key={f.id} className="h-6 w-6 border-2 border-black/50">
                  <AvatarImage src={f.profileImageUrl || undefined} />
                  <AvatarFallback className="text-[9px] bg-zinc-700 text-white">
                    {(f.firstName?.[0] || "") + (f.lastName?.[0] || "")}
                  </AvatarFallback>
                </Avatar>
              ))}
            </div>
            <span className="text-xs text-white/60">
              {event.mutualFriendsPreview.slice(0, 2).map(f => f.firstName).join(", ")}
              {event.mutualFriendsGoingCount > 2 && ` +${event.mutualFriendsGoingCount - 2} more`}
              {" "}going
            </span>
          </div>
        )}

        {event.whyShort && (
          <Popover>
            <PopoverTrigger asChild>
              <div className="flex items-start gap-2 text-xs text-white/50 cursor-pointer" data-testid={`why-${event.id}`}>
                <Sparkles className="h-3.5 w-3.5 shrink-0 mt-0.5 text-primary/70" />
                <span>{event.whyShort}</span>
                <Info className="h-3 w-3 shrink-0 mt-0.5 text-white/30" />
              </div>
            </PopoverTrigger>
            <PopoverContent side="top" className="max-w-sm bg-zinc-900 text-zinc-100 border-zinc-700 p-3 w-auto" data-testid={`tooltip-why-${event.id}`}>
              <p className="text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap">
                {event.whyLong}
              </p>
            </PopoverContent>
          </Popover>
        )}

        <div className="flex items-center gap-2 pt-1">
          <Button
            variant={event.hasRsvpd ? "default" : "outline"}
            className={cn(
              "flex-1",
              event.hasRsvpd
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-white/10 text-white border-white/20 backdrop-blur-sm"
            )}
            onClick={() => rsvpMutation.mutate()}
            disabled={rsvpMutation.isPending}
            data-testid={`button-rsvp-${event.id}`}
          >
            <Hand className="h-4 w-4 mr-2" />
            {event.hasRsvpd ? "Going" : "I want to go"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function getCategoryStyle(category: string): string {
  switch (category) {
    case "parties": return "bg-pink-500/20 text-pink-300 border-pink-500/40";
    case "deals": return "bg-emerald-500/20 text-emerald-300 border-emerald-500/40";
    case "campus": return "bg-blue-500/20 text-blue-300 border-blue-500/40";
    case "study": return "bg-amber-500/20 text-amber-300 border-amber-500/40";
    case "shows": return "bg-purple-500/20 text-purple-300 border-purple-500/40";
    case "misc": return "bg-teal-500/20 text-teal-300 border-teal-500/40";
    default: return "bg-zinc-500/20 text-zinc-300 border-zinc-500/40";
  }
}

function formatCategory(category: string): string {
  switch (category) {
    case "parties": return "Party";
    case "deals": return "Deal";
    case "campus": return "Campus";
    case "study": return "Study";
    case "shows": return "Show";
    case "misc": return "Misc";
    default: return category.charAt(0).toUpperCase() + category.slice(1);
  }
}
