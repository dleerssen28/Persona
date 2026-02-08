import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { RadarChart } from "@/components/radar-chart";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { MatchPill } from "@/components/match-pill";
import { TRAIT_AXES, type TasteProfile, type Item } from "@shared/schema";
import {
  Sparkles, TrendingUp, Grip, ChevronUp, ChevronDown,
  Settings, Palette, Upload, X, Check,
  GraduationCap, Calendar, Shield, Users, ArrowLeft, MapPin, Clock
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useRef, useCallback } from "react";
import { useLocation, Link } from "wouter";
import {
  Popover, PopoverContent, PopoverTrigger
} from "@/components/ui/popover";

import themeOceanic from "@/assets/images/theme-oceanic.png";
import themeAurora from "@/assets/images/theme-aurora.png";
import themeEmber from "@/assets/images/theme-ember.png";
import coverSkateboarding from "@/assets/images/cover-skateboarding.png";
import coverDataScience from "@/assets/images/cover-data-science.jpg";

const TRAIT_LABELS: Record<string, string> = {
  novelty: "Novelty Seeker",
  intensity: "Intensity",
  cozy: "Cozy Factor",
  strategy: "Strategic Mind",
  social: "Social Energy",
  creativity: "Creative Spirit",
  nostalgia: "Nostalgia Pull",
  adventure: "Adventure Drive",
};

function getTraitColor(val: number) {
  if (val >= 0.75) return { bar: "bg-emerald-500", text: "text-emerald-400", label: "Strong" };
  if (val >= 0.5) return { bar: "bg-amber-500", text: "text-amber-400", label: "Moderate" };
  return { bar: "bg-zinc-500", text: "text-zinc-400", label: "Low" };
}

function getScoreColor(score: number): "green" | "yellow" | "grey" {
  if (score >= 75) return "green";
  if (score >= 50) return "yellow";
  return "grey";
}

interface ProfileSection {
  id: string;
  title: string;
  visible: boolean;
}

type ThemeId = "oceanic" | "aurora" | "ember" | "custom";

interface ThemeConfig {
  id: ThemeId;
  label: string;
  image: string;
  accent: string;
  glassColor: string;
}

const THEMES: ThemeConfig[] = [
  {
    id: "oceanic",
    label: "Oceanic",
    image: themeOceanic,
    accent: "from-cyan-500/20 to-blue-600/20",
    glassColor: "bg-white/[0.08] border-white/20",
  },
  {
    id: "aurora",
    label: "Aurora",
    image: themeAurora,
    accent: "from-green-500/20 to-purple-600/20",
    glassColor: "bg-white/[0.08] border-white/20",
  },
  {
    id: "ember",
    label: "Ember",
    image: themeEmber,
    accent: "from-orange-500/20 to-red-600/20",
    glassColor: "bg-white/[0.08] border-white/20",
  },
];

const GLASS_BASE = "backdrop-blur-md border rounded-md shadow-lg";

const CATEGORY_COLORS: Record<string, string> = {
  parties: "bg-pink-500/20 text-pink-300 border-pink-400/30",
  deals: "bg-emerald-500/20 text-emerald-300 border-emerald-400/30",
  campus: "bg-blue-500/20 text-blue-300 border-blue-400/30",
  study: "bg-amber-500/20 text-amber-300 border-amber-400/30",
  shows: "bg-purple-500/20 text-purple-300 border-purple-400/30",
  misc: "bg-teal-500/20 text-teal-300 border-teal-400/30",
};

interface MainClubData extends Item {
  matchScore: number;
  whyShort: string;
  whyLong: string;
  matchMathTooltip: string;
  scoringMethod: string;
}

interface EventHistoryItem {
  eventId: string;
  title: string;
  dateTime: string | null;
  location: string | null;
  imageUrl: string | null;
  tags: string[] | null;
  category: string | null;
  matchScore: number;
  whyShort: string;
  whyLong: string;
  matchMathTooltip: string;
  scoringMethod: string;
}

interface MutualUser {
  userId: string;
  name: string;
  profileImageUrl: string | null;
  matchScore: number;
  commonEventsCount: number;
  topSharedTraits: string[];
}

interface ProfileData {
  id: string;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
  gradYear: number | null;
  classStanding: string | null;
  mainClubItemId: string | null;
  topClusters: string[];
  traits: Record<string, number> | null;
  onboardingComplete: boolean;
}

export default function ProfilePage({ params }: { params?: { userId?: string } }) {
  const { user } = useAuth();
  const targetUserId = params?.userId;
  const isOwnProfile = !targetUserId;
  const viewingUserId = targetUserId || user?.id;

  const [sections, setSections] = useState<ProfileSection[]>([
    { id: "top-traits", title: "Top 3 Traits", visible: true },
    { id: "main-club", title: "Main Club", visible: true },
    { id: "event-history", title: "Event History", visible: true },
    { id: "taste-dna", title: "Persona DNA Radar", visible: true },
  ]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editingLayout, setEditingLayout] = useState(false);
  const [activeTheme, setActiveTheme] = useState<ThemeId>("oceanic");
  const [customThemeImage, setCustomThemeImage] = useState<string | null>(null);
  const [eventHistoryMode, setEventHistoryMode] = useState<"all" | "common">("all");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [, navigate] = useLocation();

  const { data: ownProfile, isLoading: ownProfileLoading } = useQuery<TasteProfile>({
    queryKey: ["/api/taste-profile"],
    enabled: isOwnProfile,
  });

  const { data: otherProfile, isLoading: otherProfileLoading } = useQuery<ProfileData>({
    queryKey: ["/api/profile", viewingUserId],
    enabled: !isOwnProfile && !!viewingUserId,
  });

  const { data: mainClub } = useQuery<MainClubData | null>({
    queryKey: ["/api/profile", viewingUserId, "main-club"],
    enabled: !!viewingUserId,
  });

  const eventHistoryUrl = !isOwnProfile
    ? `/api/profile/${viewingUserId}/event-history?mode=${eventHistoryMode}`
    : `/api/profile/${viewingUserId}/event-history`;

  const { data: eventHistory } = useQuery<EventHistoryItem[]>({
    queryKey: [eventHistoryUrl],
    enabled: !!viewingUserId,
  });

  const { data: mutuals } = useQuery<MutualUser[]>({
    queryKey: ["/api/profile", viewingUserId, "mutuals"],
    enabled: !isOwnProfile && !!viewingUserId,
  });

  const isLoading = isOwnProfile ? ownProfileLoading : otherProfileLoading;

  const displayUser = isOwnProfile
    ? user
    : otherProfile
      ? { id: otherProfile.id, firstName: otherProfile.firstName, lastName: otherProfile.lastName, profileImageUrl: otherProfile.profileImageUrl }
      : null;

  const profileData = isOwnProfile
    ? ownProfile
    : otherProfile;

  const traits: Record<string, number> = isOwnProfile && ownProfile
    ? {
        novelty: ownProfile.traitNovelty ?? 0.5,
        intensity: ownProfile.traitIntensity ?? 0.5,
        cozy: ownProfile.traitCozy ?? 0.5,
        strategy: ownProfile.traitStrategy ?? 0.5,
        social: ownProfile.traitSocial ?? 0.5,
        creativity: ownProfile.traitCreativity ?? 0.5,
        nostalgia: ownProfile.traitNostalgia ?? 0.5,
        adventure: ownProfile.traitAdventure ?? 0.5,
      }
    : otherProfile?.traits ?? {};

  const topClusters = isOwnProfile
    ? (ownProfile?.topClusters ?? [])
    : (otherProfile?.topClusters ?? []);

  const gradYear = isOwnProfile ? user?.gradYear : otherProfile?.gradYear;
  const classStanding = isOwnProfile ? user?.classStanding : otherProfile?.classStanding;

  const handleCustomImage = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setCustomThemeImage(ev.target?.result as string);
      setActiveTheme("custom");
    };
    reader.readAsDataURL(file);
  }, []);

  if (isLoading) {
    return (
      <div className="p-6 space-y-6 max-w-3xl mx-auto">
        <Skeleton className="h-48 w-full rounded-md" />
        <Skeleton className="h-32 w-full rounded-md" />
        <Skeleton className="h-64 w-full rounded-md" />
      </div>
    );
  }

  const USER_THEMES: Record<string, ThemeId> = {
    "seed-andy": "aurora",
  };
  const USER_COVERS: Record<string, string> = {
    "seed-andy": coverDataScience,
  };

  const effectiveTheme = viewingUserId && USER_THEMES[viewingUserId] && !isOwnProfile
    ? USER_THEMES[viewingUserId]
    : activeTheme;
  const effectiveCover = viewingUserId && USER_COVERS[viewingUserId] && !isOwnProfile
    ? USER_COVERS[viewingUserId]
    : coverSkateboarding;

  const currentTheme = THEMES.find((t) => t.id === effectiveTheme) ?? THEMES[0];
  const themeImage = effectiveTheme === "custom" && customThemeImage ? customThemeImage : currentTheme.image;
  const glassClass = effectiveTheme === "custom"
    ? "bg-white/[0.08] border-white/20"
    : currentTheme.glassColor;

  const topTraits = Object.entries(traits)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3);

  function moveSection(idx: number, dir: -1 | 1) {
    setSections((prev) => {
      const next = [...prev];
      const targetIdx = idx + dir;
      if (targetIdx < 0 || targetIdx >= next.length) return prev;
      [next[idx], next[targetIdx]] = [next[targetIdx], next[idx]];
      return next;
    });
  }

  function toggleSection(idx: number) {
    setSections((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], visible: !next[idx].visible };
      return next;
    });
  }

  function formatEventDate(dateStr: string | null) {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  }

  const sectionRenderers: Record<string, () => JSX.Element | null> = {
    "top-traits": () => (
      <div className={cn(GLASS_BASE, glassClass, "p-5")} data-testid="section-top-traits">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="h-4 w-4 text-white/80" />
          <h2 className="font-semibold text-white">Top 3 Traits</h2>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {topTraits.map(([key, val], idx) => {
            const color = getTraitColor(val);
            return (
              <div
                key={key}
                className="p-3 rounded-md bg-white/[0.06] text-center space-y-1"
              >
                <span className={cn("text-xs font-bold tabular-nums", color.text)}>#{idx + 1}</span>
                <div className="text-xs font-medium text-white/60">{TRAIT_LABELS[key]}</div>
                <div className={cn("text-xl font-bold tabular-nums", color.text)}>
                  {Math.round(val * 100)}%
                </div>
              </div>
            );
          })}
        </div>
      </div>
    ),

    "main-club": () => {
      if (!mainClub) return null;

      const scoreColor = getScoreColor(mainClub.matchScore);
      const colorMap = {
        green: "border-emerald-400/30",
        yellow: "border-amber-400/30",
        grey: "border-zinc-400/30",
      };

      return (
        <div className={cn(GLASS_BASE, glassClass, "p-5")} data-testid="section-main-club">
          <div className="flex items-center gap-2 mb-4">
            <Shield className="h-4 w-4 text-white/80" />
            <h2 className="font-semibold text-white">
              {isOwnProfile ? "My Main Club" : `${displayUser?.firstName}'s Main Club`}
            </h2>
          </div>
          <div className={cn("p-4 rounded-md bg-white/[0.06] border", colorMap[scoreColor])}>
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="flex-1">
                <h3 className="font-semibold text-white text-sm" data-testid="text-main-club-name">{mainClub.title}</h3>
                <Badge variant="secondary" className="text-[10px] bg-white/15 text-white/60 border-white/10 mt-1">
                  {mainClub.domain}
                </Badge>
              </div>
              <Popover>
                <PopoverTrigger asChild>
                  <button className="cursor-pointer">
                    <MatchPill score={mainClub.matchScore} />
                  </button>
                </PopoverTrigger>
                <PopoverContent side="left" className="max-w-xs whitespace-pre-line text-xs font-mono bg-zinc-900 text-zinc-100 border-zinc-700 p-3 w-auto">
                  {mainClub.matchMathTooltip}
                </PopoverContent>
              </Popover>
            </div>
            <p className="text-xs text-white/50 line-clamp-2 mb-2">{mainClub.description}</p>
            <Popover>
              <PopoverTrigger asChild>
                <p className="text-xs text-emerald-300/80 cursor-pointer" data-testid="text-main-club-why">
                  {mainClub.whyShort}
                </p>
              </PopoverTrigger>
              <PopoverContent side="bottom" className="max-w-sm text-xs bg-zinc-900 text-zinc-100 border-zinc-700 p-3 w-auto">
                {mainClub.whyLong}
              </PopoverContent>
            </Popover>
            {mainClub.tags && mainClub.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {mainClub.tags.slice(0, 4).map((tag) => (
                  <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-white/50">
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      );
    },

    "event-history": () => {
      const events = eventHistory ?? [];

      return (
        <div className={cn(GLASS_BASE, glassClass, "p-5")} data-testid="section-event-history">
          <div className="flex items-center justify-between gap-2 mb-4">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-white/80" />
              <h2 className="font-semibold text-white">Event History</h2>
              <span className="text-xs text-white/40">{events.length}</span>
            </div>
            {!isOwnProfile && (
              <div className="flex items-center gap-1 bg-white/10 rounded-md p-0.5">
                <button
                  onClick={() => setEventHistoryMode("all")}
                  className={cn(
                    "text-[11px] px-2.5 py-1 rounded transition-all",
                    eventHistoryMode === "all"
                      ? "bg-white/20 text-white font-medium"
                      : "text-white/50"
                  )}
                  data-testid="button-event-history-all"
                >
                  All
                </button>
                <button
                  onClick={() => setEventHistoryMode("common")}
                  className={cn(
                    "text-[11px] px-2.5 py-1 rounded transition-all",
                    eventHistoryMode === "common"
                      ? "bg-white/20 text-white font-medium"
                      : "text-white/50"
                  )}
                  data-testid="button-event-history-common"
                >
                  Common
                </button>
              </div>
            )}
          </div>

          {events.length === 0 ? (
            <p className="text-xs text-white/40 text-center py-4">
              {eventHistoryMode === "common" ? "No common events yet" : "No events attended yet"}
            </p>
          ) : (
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {events.slice(0, 12).map((evt) => {
                const catColors = CATEGORY_COLORS[evt.category || "misc"] || CATEGORY_COLORS.misc;
                return (
                  <Popover key={evt.eventId}>
                    <PopoverTrigger asChild>
                      <div
                        className="flex items-center gap-3 p-3 rounded-md bg-white/[0.06] cursor-pointer"
                        data-testid={`event-history-${evt.eventId}`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-sm font-medium text-white truncate">{evt.title}</span>
                            {evt.category && (
                              <span className={cn("text-[9px] px-1.5 py-0.5 rounded border shrink-0", catColors)}>
                                {evt.category}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-[11px] text-white/40">
                            {evt.dateTime && (
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {formatEventDate(evt.dateTime)}
                              </span>
                            )}
                            {evt.location && (
                              <span className="flex items-center gap-1 truncate">
                                <MapPin className="h-3 w-3" />
                                {evt.location}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-emerald-300/70 mt-0.5">{evt.whyShort}</p>
                        </div>
                        <MatchPill score={evt.matchScore} />
                      </div>
                    </PopoverTrigger>
                    <PopoverContent side="left" className="max-w-xs whitespace-pre-line text-xs font-mono bg-zinc-900 text-zinc-100 border-zinc-700 p-3 w-auto">
                      {evt.matchMathTooltip}
                    </PopoverContent>
                  </Popover>
                );
              })}
            </div>
          )}
        </div>
      );
    },

    "taste-dna": () => (
      <div className={cn(GLASS_BASE, glassClass, "p-5")} data-testid="section-taste-dna">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="h-4 w-4 text-white/80" />
          <h2 className="font-semibold text-white">Persona DNA</h2>
        </div>
        <div className="flex flex-col sm:flex-row items-center gap-6">
          <RadarChart traits={traits} size={220} />
          <div className="flex-1 space-y-2.5 w-full">
            {TRAIT_AXES.map((axis) => {
              const val = traits[axis] ?? 0.5;
              const color = getTraitColor(val);
              return (
                <div key={axis} className="space-y-0.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-medium text-white/60">
                      {TRAIT_LABELS[axis]}
                    </span>
                    <span className={cn("text-[11px] font-semibold tabular-nums", color.text)}>
                      {Math.round(val * 100)}%
                    </span>
                  </div>
                  <div className="h-1.5 bg-white/[0.06] rounded-md overflow-hidden">
                    <div
                      className={cn("h-full rounded-md transition-all duration-700 ease-out", color.bar)}
                      style={{ width: `${val * 100}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    ),

    "mutuals": () => {
      if (isOwnProfile || !mutuals || mutuals.length === 0) return null;

      return (
        <div className={cn(GLASS_BASE, glassClass, "p-5")} data-testid="section-mutuals">
          <div className="flex items-center gap-2 mb-4">
            <Users className="h-4 w-4 text-white/80" />
            <h2 className="font-semibold text-white">Mutual Connections</h2>
            <span className="text-xs text-white/40">{mutuals.length}</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {mutuals.map((mutual) => (
              <Link
                key={mutual.userId}
                href={`/profile/${mutual.userId}`}
                className="block"
              >
                <div
                  className="p-3 rounded-md bg-white/[0.06] text-center space-y-2 cursor-pointer transition-all"
                  data-testid={`mutual-${mutual.userId}`}
                >
                  <Avatar className="h-10 w-10 mx-auto">
                    <AvatarImage src={mutual.profileImageUrl ?? undefined} />
                    <AvatarFallback className="bg-white/10 text-white text-sm font-semibold">
                      {mutual.name[0]?.toUpperCase() ?? "?"}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-xs font-medium text-white truncate">{mutual.name}</p>
                    <div className="flex items-center justify-center gap-1 mt-1">
                      <MatchPill score={mutual.matchScore} />
                    </div>
                  </div>
                  {mutual.commonEventsCount > 0 && (
                    <p className="text-[10px] text-white/40">
                      {mutual.commonEventsCount} shared events
                    </p>
                  )}
                  {mutual.topSharedTraits.length > 0 && (
                    <div className="flex flex-wrap gap-0.5 justify-center">
                      {mutual.topSharedTraits.map((t) => (
                        <span key={t} className="text-[9px] px-1 py-0.5 rounded bg-emerald-500/15 text-emerald-300/70">
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </div>
      );
    },
  };

  const activeSections = isOwnProfile
    ? sections
    : [
        ...sections,
        ...(mutuals && mutuals.length > 0 ? [{ id: "mutuals", title: "Mutual Connections", visible: true }] : []),
      ];

  return (
    <>
      <div className="fixed inset-0 z-0" style={{ pointerEvents: "none" }}>
        <img
          src={themeImage}
          alt="Theme background"
          className="w-full h-full object-cover"
          data-testid="img-theme-background"
        />
        <div className="absolute inset-0 bg-black/20" />
      </div>

      <div className="relative min-h-screen z-[1]" style={{ background: "transparent" }}>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleCustomImage}
          data-testid="input-custom-theme"
        />

        <div className="relative max-w-3xl mx-auto">
          <div className="relative h-48 sm:h-56 overflow-hidden rounded-b-lg">
            <img
              src={effectiveCover}
              alt="Profile cover"
              className="w-full h-full object-cover"
              data-testid="img-profile-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
          </div>

          {!isOwnProfile && (
            <div className="absolute top-3 left-3 z-20">
              <Button
                size="icon"
                variant="ghost"
                onClick={() => navigate("/")}
                className="bg-black/30 backdrop-blur-sm text-white border border-white/10"
                data-testid="button-back"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </div>
          )}

          {isOwnProfile && (
            <div className="absolute top-3 right-3 z-20">
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setSettingsOpen(!settingsOpen)}
                className="bg-black/30 backdrop-blur-sm text-white border border-white/10"
                data-testid="button-settings"
              >
                <Settings className="h-4 w-4" />
              </Button>
            </div>
          )}

          {settingsOpen && isOwnProfile && (
            <div
              className={cn(GLASS_BASE, "absolute top-14 right-3 z-30 w-72 p-4 bg-black/40 border-white/20")}
              data-testid="settings-panel"
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-white">Profile Settings</h3>
                <Button size="icon" variant="ghost" onClick={() => setSettingsOpen(false)} className="text-white/60 h-6 w-6">
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>

              <div className="space-y-4">
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <Palette className="h-3.5 w-3.5 text-white/60" />
                    <span className="text-xs font-medium text-white/70">Theme</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {THEMES.map((theme) => (
                      <button
                        key={theme.id}
                        onClick={() => setActiveTheme(theme.id)}
                        className={cn(
                          "relative aspect-[3/4] rounded-md overflow-hidden border-2 transition-all",
                          activeTheme === theme.id ? "border-white ring-1 ring-white/50" : "border-white/10"
                        )}
                        data-testid={`button-theme-${theme.id}`}
                      >
                        <img src={theme.image} alt={theme.label} className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/30 flex items-end justify-center pb-1">
                          <span className="text-[9px] font-semibold text-white drop-shadow">{theme.label}</span>
                        </div>
                        {activeTheme === theme.id && (
                          <div className="absolute top-1 right-1 bg-white rounded-full p-0.5">
                            <Check className="h-2.5 w-2.5 text-black" />
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  onClick={() => fileInputRef.current?.click()}
                  className={cn(
                    "w-full flex items-center gap-2 p-2.5 rounded-md text-xs text-white/80 transition-all",
                    "bg-white/10 border border-white/10",
                    activeTheme === "custom" && "border-white/30 bg-white/15"
                  )}
                  data-testid="button-custom-theme"
                >
                  <Upload className="h-3.5 w-3.5" />
                  <span>{customThemeImage ? "Change Custom Image" : "Import Custom Theme"}</span>
                  {activeTheme === "custom" && (
                    <Check className="h-3 w-3 ml-auto text-emerald-400" />
                  )}
                </button>

                <div className="border-t border-white/10 pt-3">
                  <button
                    onClick={() => {
                      setEditingLayout(!editingLayout);
                      setSettingsOpen(false);
                    }}
                    className="w-full flex items-center gap-2 p-2.5 rounded-md text-xs text-white/80 bg-white/10 border border-white/10"
                    data-testid="button-edit-layout"
                  >
                    <Grip className="h-3.5 w-3.5" />
                    <span>{editingLayout ? "Done Editing Layout" : "Edit Layout"}</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="px-4 sm:px-6 -mt-12 relative z-10 space-y-4">
            <div className="flex flex-col sm:flex-row items-center sm:items-end gap-4">
              <Avatar className="h-24 w-24 ring-4 ring-white/20">
                <AvatarImage src={displayUser?.profileImageUrl ?? undefined} />
                <AvatarFallback className="text-2xl font-bold bg-white/10 text-white backdrop-blur-sm">
                  {(displayUser?.firstName?.[0] ?? "?").toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="text-center sm:text-left flex-1 pb-1">
                <h1 className="text-2xl font-bold tracking-tight text-white drop-shadow-lg" data-testid="text-profile-name">
                  {displayUser?.firstName} {displayUser?.lastName}
                </h1>
                <div className="flex flex-wrap gap-1.5 mt-1.5 justify-center sm:justify-start">
                  {classStanding && (
                    <Badge variant="secondary" className="text-xs bg-blue-500/20 text-blue-300 border-blue-400/30 backdrop-blur-sm" data-testid="badge-class-standing">
                      <GraduationCap className="h-3 w-3 mr-1" />
                      {classStanding}
                    </Badge>
                  )}
                  {gradYear && (
                    <Badge variant="secondary" className="text-xs bg-purple-500/20 text-purple-300 border-purple-400/30 backdrop-blur-sm" data-testid="badge-grad-year">
                      Class of {gradYear}
                    </Badge>
                  )}
                  {topClusters.map((cluster) => (
                    <Badge key={cluster} variant="secondary" className="text-xs bg-white/15 text-white/80 border-white/10 backdrop-blur-sm">
                      {cluster}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>

            {editingLayout && isOwnProfile && (
              <div className={cn(GLASS_BASE, "p-4 bg-black/30 border-white/20")} data-testid="section-editor">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs text-white/60">
                    Reorder or toggle sections to customize your profile
                  </p>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditingLayout(false)}
                    className="text-white/60 text-xs"
                  >
                    Done
                  </Button>
                </div>
                <div className="space-y-1.5">
                  {sections.map((sec, idx) => (
                    <div key={sec.id} className="flex items-center gap-2 p-2 rounded-md bg-white/10">
                      <Grip className="h-3.5 w-3.5 text-white/40 shrink-0" />
                      <span className="text-sm flex-1 text-white/80">{sec.title}</span>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => moveSection(idx, -1)}
                        disabled={idx === 0}
                        className="text-white/60"
                      >
                        <ChevronUp className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => moveSection(idx, 1)}
                        disabled={idx === sections.length - 1}
                        className="text-white/60"
                      >
                        <ChevronDown className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant={sec.visible ? "default" : "outline"}
                        onClick={() => toggleSection(idx)}
                        className="text-xs"
                      >
                        {sec.visible ? "On" : "Off"}
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-4 pb-8">
              {activeSections.filter((s) => s.visible).map((sec) => {
                const renderer = sectionRenderers[sec.id];
                return renderer ? <div key={sec.id}>{renderer()}</div> : null;
              })}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
