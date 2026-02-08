import { useState, useRef, useCallback, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { MatchPill } from "@/components/match-pill";
import { cn } from "@/lib/utils";
import { Link } from "wouter";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Users, UserPlus, ChevronDown, Sparkles,
  Phone, ExternalLink, Share2, Link2, Search,
  Heart, RotateCcw,
} from "lucide-react";
import { SiInstagram } from "react-icons/si";

const SCROLL_KEY = "persona_discover_scroll";

interface FriendData {
  id: string;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
  instagramUrl: string | null;
  phoneNumber: string | null;
  gradYear: number | null;
  classStanding: string | null;
  topClusters: string[];
  commonClubs: string[];
  commonEvents: string[];
}

interface SuggestionData {
  id: string;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
  instagramUrl: string | null;
  phoneNumber: string | null;
  gradYear: number | null;
  classStanding: string | null;
  matchScore: number;
  scoringMethod: string;
  topClusters: string[];
  commonClubs: string[];
  commonEvents: string[];
  whyMatched: string[];
}

type TabView = "friends" | "discover";

const GRADIENT_PALETTES = [
  "from-violet-600/90 via-purple-700/80 to-indigo-900/95",
  "from-emerald-600/90 via-teal-700/80 to-cyan-900/95",
  "from-rose-600/90 via-pink-700/80 to-fuchsia-900/95",
  "from-amber-600/90 via-orange-700/80 to-red-900/95",
  "from-sky-600/90 via-blue-700/80 to-indigo-900/95",
  "from-lime-600/90 via-green-700/80 to-emerald-900/95",
  "from-fuchsia-600/90 via-purple-700/80 to-violet-900/95",
  "from-cyan-600/90 via-teal-700/80 to-blue-900/95",
];

export default function SocialPage() {
  const [tab, setTab] = useState<TabView>("friends");

  return (
    <div className="flex flex-col" style={{ height: "calc(100dvh - 3.5rem - 3.5rem)" }}>
      <div className="flex items-center gap-2 px-4 py-2 bg-background/95 backdrop-blur-sm shrink-0 border-b border-border/30">
        <Users className="h-4 w-4 text-muted-foreground shrink-0" />
        <button
          onClick={() => setTab("friends")}
          className={cn(
            "px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-colors border shrink-0",
            tab === "friends"
              ? "bg-primary/15 text-primary border-primary/30"
              : "text-muted-foreground border-border/50"
          )}
          data-testid="button-tab-friends"
        >
          My Friends
        </button>
        <button
          onClick={() => setTab("discover")}
          className={cn(
            "px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-colors border shrink-0",
            tab === "discover"
              ? "bg-primary/15 text-primary border-primary/30"
              : "text-muted-foreground border-border/50"
          )}
          data-testid="button-tab-discover"
        >
          Find Friends
        </button>
      </div>

      <div className="flex-1 overflow-hidden">
        {tab === "friends" ? <MyFriendsTab /> : <DiscoverTab />}
      </div>
    </div>
  );
}

function MyFriendsTab() {
  const { data: friends, isLoading } = useQuery<FriendData[]>({
    queryKey: ["/api/friends"],
  });

  if (isLoading) {
    return (
      <div className="p-4 space-y-3 overflow-y-auto h-full">
        {[1, 2, 3, 4].map(i => (
          <Skeleton key={i} className="h-24 rounded-md" />
        ))}
      </div>
    );
  }

  if (!friends || friends.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8 h-full">
        <Users className="h-12 w-12 text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground text-center">
          No friends yet. Switch to "Find Friends" to discover people with similar interests.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-y-auto h-full p-4 space-y-2" data-testid="friends-list">
      {friends.map(friend => (
        <FriendListCard key={friend.id} friend={friend} />
      ))}
    </div>
  );
}

function FriendListCard({ friend }: { friend: FriendData }) {
  const initials = ((friend.firstName?.[0] || "") + (friend.lastName?.[0] || "")).toUpperCase() || "?";

  return (
    <Link href={`/profile/${friend.id}`}>
      <div
        className="flex items-start gap-3 p-3 rounded-md border border-border/50 bg-card hover-elevate cursor-pointer"
        data-testid={`card-friend-${friend.id}`}
      >
        <Avatar className="h-12 w-12 shrink-0">
          <AvatarImage src={friend.profileImageUrl ?? undefined} />
          <AvatarFallback className="bg-primary/10 text-primary font-semibold">
            {initials}
          </AvatarFallback>
        </Avatar>

        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm" data-testid={`text-friend-name-${friend.id}`}>
              {friend.firstName} {friend.lastName}
            </span>
            {friend.classStanding && (
              <Badge variant="secondary" className="text-[10px] px-1.5">
                {friend.classStanding} {friend.gradYear ? `'${String(friend.gradYear).slice(-2)}` : ""}
              </Badge>
            )}
          </div>

          {friend.topClusters.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {friend.topClusters.slice(0, 3).map(c => (
                <Badge key={c} variant="outline" className="text-[10px] px-1.5 no-default-hover-elevate no-default-active-elevate">
                  {c}
                </Badge>
              ))}
            </div>
          )}

          {(friend.commonClubs.length > 0 || friend.commonEvents.length > 0) && (
            <div className="text-xs text-muted-foreground space-y-0.5">
              {friend.commonClubs.length > 0 && (
                <div className="flex items-start gap-1.5">
                  <span className="inline-block h-1.5 w-1.5 rounded-full mt-1 shrink-0 bg-primary/60" />
                  <span className="truncate">{friend.commonClubs.length} shared club{friend.commonClubs.length > 1 ? "s" : ""}: {friend.commonClubs.slice(0, 2).join(", ")}{friend.commonClubs.length > 2 ? ` +${friend.commonClubs.length - 2}` : ""}</span>
                </div>
              )}
              {friend.commonEvents.length > 0 && (
                <div className="flex items-start gap-1.5">
                  <span className="inline-block h-1.5 w-1.5 rounded-full mt-1 shrink-0 bg-amber-400/60" />
                  <span className="truncate">{friend.commonEvents.length} shared event{friend.commonEvents.length > 1 ? "s" : ""}: {friend.commonEvents.slice(0, 2).join(", ")}{friend.commonEvents.length > 2 ? ` +${friend.commonEvents.length - 2}` : ""}</span>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-1 shrink-0">
          <a
            href="https://instagram.com/therock/"
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            data-testid={`button-instagram-${friend.id}`}
          >
            <Button size="icon" variant="ghost">
              <SiInstagram className="h-4 w-4" />
            </Button>
          </a>
          {friend.phoneNumber && (
            <a
              href={`tel:${friend.phoneNumber}`}
              onClick={(e) => e.stopPropagation()}
              data-testid={`button-phone-${friend.id}`}
            >
              <Button size="icon" variant="ghost">
                <Phone className="h-4 w-4" />
              </Button>
            </a>
          )}
        </div>
      </div>
    </Link>
  );
}

function DiscoverTab() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const { toast } = useToast();

  const { data: suggestions, isLoading } = useQuery<SuggestionData[]>({
    queryKey: ["/api/friends/suggestions"],
  });

  const addFriendMutation = useMutation({
    mutationFn: async (friendId: string) => {
      await apiRequest("POST", `/api/friends/${friendId}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/friends"] });
      queryClient.invalidateQueries({ queryKey: ["/api/friends/suggestions"] });
      toast({ title: "Friend added" });
    },
    onError: (err) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
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
    if (!scrollRef.current || !suggestions?.length) return;
    try {
      const saved = sessionStorage.getItem(SCROLL_KEY);
      if (saved) {
        const idx = parseInt(saved, 10);
        if (idx > 0 && idx < suggestions.length) {
          requestAnimationFrame(() => {
            if (scrollRef.current) {
              scrollRef.current.scrollTop = idx * scrollRef.current.clientHeight;
              setCurrentIndex(idx);
            }
          });
        }
      }
    } catch {}
  }, [suggestions]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="space-y-4 text-center">
          <Skeleton className="h-12 w-12 mx-auto rounded-md" />
          <Skeleton className="h-4 w-40 mx-auto" />
          <p className="text-sm text-muted-foreground">Finding people for you...</p>
        </div>
      </div>
    );
  }

  if (!suggestions || suggestions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 p-8 h-full">
        <UserPlus className="h-12 w-12 text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground text-center">
          No new suggestions right now. Check back later as more people join.
        </p>
      </div>
    );
  }

  return (
    <div className="relative h-full flex flex-col">
      <div className="absolute top-3 left-3 z-10">
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className="bg-white/10 text-white border-white/20 backdrop-blur-md"
              data-testid="button-add-friend-via"
            >
              <UserPlus className="h-4 w-4 mr-2" />
              Add Friend via
            </Button>
          </PopoverTrigger>
          <PopoverContent side="bottom" align="start" className="w-48 p-1.5 bg-zinc-900 border-zinc-700">
            <a
              href="https://instagram.com/therock/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-3 py-2 rounded-md text-sm text-zinc-200 hover-elevate cursor-pointer"
              data-testid="button-add-via-instagram"
            >
              <SiInstagram className="h-4 w-4" />
              Instagram
            </a>
            <a
              href="sms:"
              className="flex items-center gap-2 px-3 py-2 rounded-md text-sm text-zinc-200 hover-elevate cursor-pointer"
              data-testid="button-add-via-phone"
            >
              <Phone className="h-4 w-4" />
              Phone
            </a>
            <button
              onClick={() => {
                navigator.clipboard.writeText(window.location.origin + "/social");
                toast({ title: "Link copied to clipboard" });
              }}
              className="flex items-center gap-2 px-3 py-2 rounded-md text-sm text-zinc-200 hover-elevate cursor-pointer w-full text-left"
              data-testid="button-add-via-link"
            >
              <Link2 className="h-4 w-4" />
              Copy Link
            </button>
          </PopoverContent>
        </Popover>
      </div>

      <div
        ref={scrollRef}
        className="h-full overflow-y-auto snap-y snap-mandatory"
        onScroll={handleScroll}
        data-testid="discover-scroll-container"
      >
        {suggestions.map((suggestion, idx) => (
          <SuggestionCard
            key={suggestion.id}
            suggestion={suggestion}
            gradientIndex={idx}
            onAddFriend={() => addFriendMutation.mutate(suggestion.id)}
            isAdding={addFriendMutation.isPending}
          />
        ))}
        <div className="snap-start w-full h-full relative shrink-0 flex items-center justify-center bg-gradient-to-b from-zinc-900 to-black" data-testid="end-of-suggestions">
          <div className="text-center space-y-4 px-8">
            <Heart className="h-12 w-12 mx-auto text-primary/60" />
            <h3 className="text-xl font-bold text-white">You've seen everyone</h3>
            <p className="text-sm text-white/50">Check back later as more people join Persona</p>
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
              data-testid="button-restart-discover"
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Back to top
            </Button>
          </div>
        </div>
      </div>

      {suggestions.length > 1 && currentIndex < suggestions.length && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 animate-bounce pointer-events-none">
          <ChevronDown className="h-6 w-6 text-white/60" />
        </div>
      )}

      <div className="absolute right-3 top-1/2 -translate-y-1/2 flex flex-col gap-1">
        {suggestions.slice(0, Math.min(suggestions.length, 12)).map((_, idx) => (
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
  );
}

function SuggestionCard({
  suggestion,
  gradientIndex,
  onAddFriend,
  isAdding,
}: {
  suggestion: SuggestionData;
  gradientIndex: number;
  onAddFriend: () => void;
  isAdding: boolean;
}) {
  const gradient = GRADIENT_PALETTES[gradientIndex % GRADIENT_PALETTES.length];
  const initials = ((suggestion.firstName?.[0] || "") + (suggestion.lastName?.[0] || "")).toUpperCase() || "?";
  return (
    <div
      className="snap-start w-full h-full relative shrink-0"
      data-testid={`card-suggestion-${suggestion.id}`}
    >
      <div className={cn("absolute inset-0 bg-gradient-to-t", gradient)} />

      <div className="absolute top-3 right-3">
        <MatchPill score={suggestion.matchScore} size="sm" />
      </div>

      <div className="absolute inset-0 flex flex-col items-center justify-center px-6 pb-48">
        <Avatar className="h-24 w-24 ring-4 ring-white/20 mb-4">
          <AvatarImage src={suggestion.profileImageUrl ?? undefined} />
          <AvatarFallback className="bg-white/20 text-white text-2xl font-bold">
            {initials}
          </AvatarFallback>
        </Avatar>

        <h2 className="text-2xl font-bold text-white text-center" data-testid={`text-suggestion-name-${suggestion.id}`}>
          {suggestion.firstName} {suggestion.lastName}
        </h2>

        {suggestion.classStanding && (
          <p className="text-sm text-white/60 mt-1">
            {suggestion.classStanding} {suggestion.gradYear ? `'${String(suggestion.gradYear).slice(-2)}` : ""}
          </p>
        )}

        {suggestion.topClusters.length > 0 && (
          <div className="flex flex-wrap justify-center gap-1.5 mt-3">
            {suggestion.topClusters.slice(0, 3).map(c => (
              <Badge
                key={c}
                variant="outline"
                className="text-xs bg-white/10 text-white/90 border-white/20 no-default-hover-elevate no-default-active-elevate"
              >
                {c}
              </Badge>
            ))}
          </div>
        )}
      </div>

      <div className="absolute bottom-0 left-0 right-0 p-4 space-y-3">
        {(suggestion.commonClubs.length > 0 || suggestion.commonEvents.length > 0) && (
          <div className="space-y-1.5">
            {suggestion.commonClubs.length > 0 && (
              <div className="flex items-start gap-2 text-sm text-white/70">
                <span className="inline-block h-1.5 w-1.5 rounded-full mt-1.5 shrink-0 bg-emerald-400" />
                <span>{suggestion.commonClubs.length} shared club{suggestion.commonClubs.length > 1 ? "s" : ""}: {suggestion.commonClubs.slice(0, 2).join(", ")}{suggestion.commonClubs.length > 2 ? ` +${suggestion.commonClubs.length - 2}` : ""}</span>
              </div>
            )}
            {suggestion.commonEvents.length > 0 && (
              <div className="flex items-start gap-2 text-sm text-white/70">
                <span className="inline-block h-1.5 w-1.5 rounded-full mt-1.5 shrink-0 bg-amber-400" />
                <span>{suggestion.commonEvents.length} shared event{suggestion.commonEvents.length > 1 ? "s" : ""}: {suggestion.commonEvents.slice(0, 2).join(", ")}{suggestion.commonEvents.length > 2 ? ` +${suggestion.commonEvents.length - 2}` : ""}</span>
              </div>
            )}
          </div>
        )}

        {suggestion.whyMatched.length > 0 && (
          <div className="flex items-start gap-2 text-xs text-white/50">
            <Sparkles className="h-3.5 w-3.5 shrink-0 mt-0.5 text-primary/70" />
            <span>{suggestion.whyMatched.join(" / ")}</span>
          </div>
        )}

        <div className="flex items-center gap-2 pt-1">
          <a
            href="https://instagram.com/therock/"
            target="_blank"
            rel="noopener noreferrer"
            data-testid={`button-ig-suggestion-${suggestion.id}`}
          >
            <Button
              variant="outline"
              className="bg-white/10 text-white border-white/20 backdrop-blur-sm"
              data-testid={`button-instagram-discover-${suggestion.id}`}
            >
              <SiInstagram className="h-4 w-4 mr-2" />
              Instagram
            </Button>
          </a>
          <Button
            className="flex-1 bg-primary text-primary-foreground border-primary"
            onClick={onAddFriend}
            disabled={isAdding}
            data-testid={`button-add-friend-${suggestion.id}`}
          >
            <UserPlus className="h-4 w-4 mr-2" />
            Add Friend
          </Button>
        </div>

        <Link href={`/profile/${suggestion.id}`}>
          <Button
            variant="ghost"
            className="w-full text-white/60"
            data-testid={`button-view-profile-${suggestion.id}`}
          >
            <ExternalLink className="h-4 w-4 mr-2" />
            View Full Profile
          </Button>
        </Link>
      </div>
    </div>
  );
}
