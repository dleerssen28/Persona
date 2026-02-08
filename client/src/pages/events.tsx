import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { getEventImage } from "@/lib/event-images";
import { MatchPill } from "@/components/match-pill";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  MapPin, Clock, Users, Hand, ChevronDown,
  Filter, X, Mail, UserPlus
} from "lucide-react";
import { cn } from "@/lib/utils";

type EventCategory = "all" | "organized" | "custom";

interface EventAttendee {
  id: string;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
}

interface EventMatchedUser extends EventAttendee {
  email: string | null;
  matchScore: number;
  color: string;
  explanations: string[];
  topClusters: string[];
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
  creatorName: string | null;
  contactInfo: string | null;
  attendeeCount: number | null;
  matchScore: number;
  hasRsvpd: boolean;
  rsvpCount: number;
  attendees: EventAttendee[];
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

export default function EventsPage() {
  const [category, setCategory] = useState<EventCategory>("all");
  const scrollRef = useRef<HTMLDivElement>(null);
  const [currentIndex, setCurrentIndex] = useState(0);

  const queryParam = category === "all" ? "" : `?category=${category}`;
  const { data: events, isLoading } = useQuery<EventData[]>({
    queryKey: ["/api/events", category],
    queryFn: async () => {
      const res = await fetch(`/api/events${queryParam}`, { credentials: "include" });
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
    }
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

  const filteredEvents = events || [];

  return (
    <div className="flex flex-col" style={{ height: "calc(100dvh - 3.5rem - 3.5rem)" }}>
      <div className="flex items-center gap-2 px-4 py-2 bg-background/95 backdrop-blur-sm shrink-0 border-b border-border/30">
        <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
        {(["all", "organized", "custom"] as EventCategory[]).map((cat) => (
          <button
            key={cat}
            onClick={() => { setCategory(cat); setCurrentIndex(0); }}
            className={cn(
              "px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-colors border shrink-0",
              category === cat
                ? "bg-primary/15 text-primary border-primary/30"
                : "text-muted-foreground border-border/50"
            )}
            data-testid={`button-filter-${cat}`}
          >
            {cat === "all" ? "All Events" : cat === "organized" ? "Organized" : "Custom"}
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
          </div>

          {filteredEvents.length > 1 && currentIndex < filteredEvents.length - 1 && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 animate-bounce pointer-events-none">
              <ChevronDown className="h-6 w-6 text-white/60" />
            </div>
          )}

          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex flex-col gap-1">
            {filteredEvents.map((_, idx) => (
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
  const [showMatches, setShowMatches] = useState(false);
  const eventImage = getEventImage(event.imageUrl);

  const rsvpMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/events/${event.id}/rsvp`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
    },
    onError: (err) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const { data: matchedUsers, isLoading: matchesLoading } = useQuery<EventMatchedUser[]>({
    queryKey: ["/api/events", event.id, "matches"],
    queryFn: async () => {
      const res = await fetch(`/api/events/${event.id}/matches`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: showMatches,
  });

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

      <div className="absolute top-3 left-3">
        <Badge
          variant="outline"
          className={cn(
            "text-xs border",
            event.category === "organized"
              ? "bg-blue-500/20 text-blue-300 border-blue-500/40"
              : "bg-purple-500/20 text-purple-300 border-purple-500/40"
          )}
          data-testid={`badge-category-${event.id}`}
        >
          {event.category === "organized" ? "Organized" : "Custom"}
        </Badge>
      </div>

      <div className="absolute top-3 right-3">
        <MatchPill score={event.matchScore} size="sm" data-testid={`match-score-${event.id}`} />
      </div>

      <div className="absolute bottom-0 left-0 right-0 p-4 space-y-3">
        <div>
          <h2 className="text-2xl font-bold text-white leading-tight" data-testid={`text-event-title-${event.id}`}>
            {event.title}
          </h2>
          {event.creatorName && (
            <p className="text-sm text-white/60 mt-0.5">by {event.creatorName}</p>
          )}
        </div>

        {event.description && (
          <p className="text-sm text-white/80 line-clamp-2" data-testid={`text-event-desc-${event.id}`}>
            {event.description}
          </p>
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
            <span>{(event.attendeeCount || 0) + event.rsvpCount} going</span>
          </div>
        </div>

        {event.tags && event.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {event.tags.slice(0, 4).map((tag) => (
              <span
                key={tag}
                className="text-[10px] px-2 py-0.5 rounded-md bg-white/10 text-white/70 border border-white/10"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {event.attendees.length > 0 && (
          <div className="flex items-center gap-2">
            <div className="flex -space-x-2">
              {event.attendees.slice(0, 5).map((a) => (
                <Avatar key={a.id} className="h-6 w-6 border-2 border-black/50">
                  <AvatarImage src={a.profileImageUrl || undefined} />
                  <AvatarFallback className="text-[9px] bg-zinc-700 text-white">
                    {(a.firstName?.[0] || "") + (a.lastName?.[0] || "")}
                  </AvatarFallback>
                </Avatar>
              ))}
            </div>
            <span className="text-xs text-white/50">
              {event.attendees.slice(0, 2).map(a => a.firstName).join(", ")}
              {event.attendees.length > 2 && ` +${event.attendees.length - 2} more`}
            </span>
          </div>
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

          <Button
            variant="outline"
            size="icon"
            className="bg-white/10 text-white border-white/20 backdrop-blur-sm"
            onClick={() => setShowMatches(!showMatches)}
            data-testid={`button-find-people-${event.id}`}
          >
            <UserPlus className="h-4 w-4" />
          </Button>
        </div>

        {showMatches && (
          <MatchedAttendeesPanel
            users={matchedUsers || []}
            loading={matchesLoading}
            onClose={() => setShowMatches(false)}
            contactInfo={event.contactInfo}
          />
        )}
      </div>
    </div>
  );
}

function MatchedAttendeesPanel({
  users,
  loading,
  onClose,
  contactInfo,
}: {
  users: EventMatchedUser[];
  loading: boolean;
  onClose: () => void;
  contactInfo: string | null;
}) {
  return (
    <div
      className="bg-black/80 backdrop-blur-xl rounded-md border border-white/10 p-3 space-y-2 max-h-48 overflow-y-auto"
      data-testid="panel-matched-attendees"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-white">People with similar taste</h3>
        <Button size="icon" variant="ghost" className="h-6 w-6 text-white/50" onClick={onClose}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full bg-white/10" />
          <Skeleton className="h-10 w-full bg-white/10" />
        </div>
      ) : users.length === 0 ? (
        <div className="text-center py-2">
          <p className="text-xs text-white/50">No matched attendees yet. Be the first to RSVP!</p>
          {contactInfo && (
            <div className="flex items-center gap-1.5 justify-center mt-2 text-xs text-white/60">
              <Mail className="h-3 w-3" />
              <span>{contactInfo}</span>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-1.5">
          {users.map((user) => (
            <div
              key={user.id}
              className="flex items-center gap-2 p-1.5 rounded-md bg-white/5"
              data-testid={`matched-user-${user.id}`}
            >
              <Avatar className="h-7 w-7">
                <AvatarImage src={user.profileImageUrl || undefined} />
                <AvatarFallback className="text-[9px] bg-zinc-700 text-white">
                  {(user.firstName?.[0] || "") + (user.lastName?.[0] || "")}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium text-white truncate">
                    {user.firstName} {user.lastName}
                  </span>
                  <MatchPill score={user.matchScore} size="sm" showLabel={false} />
                </div>
                {user.email && (
                  <p className="text-[10px] text-white/40 truncate">{user.email}</p>
                )}
                {user.topClusters.length > 0 && (
                  <div className="flex gap-1 mt-0.5">
                    {user.topClusters.slice(0, 2).map(c => (
                      <span key={c} className="text-[9px] px-1 py-0.5 rounded bg-white/10 text-white/50">{c}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          {contactInfo && (
            <div className="flex items-center gap-1.5 pt-1 text-xs text-white/40 border-t border-white/10">
              <Mail className="h-3 w-3" />
              <span>Event contact: {contactInfo}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
