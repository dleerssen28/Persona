import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { RadarChart } from "@/components/radar-chart";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { TRAIT_AXES, type TasteProfile, type Item } from "@shared/schema";
import {
  Sparkles, TrendingUp, Grip, ChevronUp, ChevronDown,
  Image as ImageIcon, Film, Music, Gamepad2, Utensils,
  Settings, Palette, Upload, X, Check, Heart, Bookmark
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useRef, useCallback } from "react";
import { getHobbyImage } from "@/lib/hobby-images";

import themeOceanic from "@/assets/images/theme-oceanic.png";
import themeAurora from "@/assets/images/theme-aurora.png";
import themeEmber from "@/assets/images/theme-ember.png";
import coverSkateboarding from "@/assets/images/cover-skateboarding.png";
import profileCover from "@/assets/images/profile-cover.jpg";

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

interface ProfileSection {
  id: string;
  title: string;
  visible: boolean;
}

const DEFAULT_SECTIONS: ProfileSection[] = [
  { id: "top-traits", title: "Top 3 Traits", visible: true },
  { id: "mydna-top3", title: "myDNA Top 3", visible: true },
  { id: "my-collection", title: "My Collection", visible: true },
  { id: "taste-dna", title: "Taste DNA Radar", visible: true },
  { id: "gallery", title: "Gallery (Hobby Tags)", visible: true },
];

interface HobbyWithMatch {
  id: string;
  title: string;
  matchScore: number;
  tags: string[] | null;
  whyItFits: string;
}

interface CollectionItem {
  id: string;
  action: string;
  domain: string;
  item: Item;
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

export default function ProfilePage() {
  const { user } = useAuth();
  const [sections, setSections] = useState<ProfileSection[]>(DEFAULT_SECTIONS);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editingLayout, setEditingLayout] = useState(false);
  const [activeTheme, setActiveTheme] = useState<ThemeId>("oceanic");
  const [customThemeImage, setCustomThemeImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: profile, isLoading } = useQuery<TasteProfile>({
    queryKey: ["/api/taste-profile"],
  });

  const { data: movieRecs } = useQuery<(Item & { matchScore: number })[]>({
    queryKey: ["/api/recommendations", "movies"],
  });

  const { data: musicRecs } = useQuery<(Item & { matchScore: number })[]>({
    queryKey: ["/api/recommendations", "music"],
  });

  const { data: gameRecs } = useQuery<(Item & { matchScore: number })[]>({
    queryKey: ["/api/recommendations", "games"],
  });

  const { data: hobbies } = useQuery<HobbyWithMatch[]>({
    queryKey: ["/api/explore/hobbies"],
  });

  const { data: collection } = useQuery<CollectionItem[]>({
    queryKey: ["/api/interactions/collection"],
  });

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

  const currentTheme = THEMES.find((t) => t.id === activeTheme) ?? THEMES[0];
  const themeImage = activeTheme === "custom" && customThemeImage ? customThemeImage : currentTheme.image;
  const glassClass = activeTheme === "custom"
    ? "bg-white/[0.08] border-white/20"
    : currentTheme.glassColor;

  const coverImage = coverSkateboarding;

  const traits: Record<string, number> = profile
    ? {
        novelty: profile.traitNovelty ?? 0.5,
        intensity: profile.traitIntensity ?? 0.5,
        cozy: profile.traitCozy ?? 0.5,
        strategy: profile.traitStrategy ?? 0.5,
        social: profile.traitSocial ?? 0.5,
        creativity: profile.traitCreativity ?? 0.5,
        nostalgia: profile.traitNostalgia ?? 0.5,
        adventure: profile.traitAdventure ?? 0.5,
      }
    : {};

  const topTraits = Object.entries(traits)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3);

  const topMovie = movieRecs?.[0];
  const topSong = musicRecs?.[0];
  const topGame = gameRecs?.[0];

  const topHobbies = hobbies?.slice(0, 6) ?? [];

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

    "mydna-top3": () => (
      <div className={cn(GLASS_BASE, glassClass, "p-5")} data-testid="section-mydna-top3">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="h-4 w-4 text-white/80" />
          <h2 className="font-semibold text-white">myDNA Top 3</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {topMovie && (
            <div className="p-3 rounded-md bg-white/[0.06] space-y-1">
              <div className="flex items-center gap-1.5 text-xs text-white/60">
                <Film className="h-3 w-3" />
                <span>Top Movie</span>
              </div>
              <div className="font-semibold text-sm text-white">{topMovie.title}</div>
              <Badge variant="secondary" className="text-[10px] bg-white/15 text-white/80 border-white/10">{topMovie.matchScore}% match</Badge>
            </div>
          )}
          {topSong && (
            <div className="p-3 rounded-md bg-white/[0.06] space-y-1">
              <div className="flex items-center gap-1.5 text-xs text-white/60">
                <Music className="h-3 w-3" />
                <span>Top Music</span>
              </div>
              <div className="font-semibold text-sm text-white">{topSong.title}</div>
              <Badge variant="secondary" className="text-[10px] bg-white/15 text-white/80 border-white/10">{topSong.matchScore}% match</Badge>
            </div>
          )}
          {topGame && (
            <div className="p-3 rounded-md bg-white/[0.06] space-y-1">
              <div className="flex items-center gap-1.5 text-xs text-white/60">
                <Gamepad2 className="h-3 w-3" />
                <span>Top Game</span>
              </div>
              <div className="font-semibold text-sm text-white">{topGame.title}</div>
              <Badge variant="secondary" className="text-[10px] bg-white/15 text-white/80 border-white/10">{topGame.matchScore}% match</Badge>
            </div>
          )}
        </div>
      </div>
    ),

    "my-collection": () => {
      const DOMAIN_ICONS: Record<string, typeof Film> = {
        movies: Film,
        music: Music,
        games: Gamepad2,
        food: Utensils,
      };

      const liked = collection?.filter(c => c.action === "like" || c.action === "love") || [];
      const saved = collection?.filter(c => c.action === "save") || [];

      if (liked.length === 0 && saved.length === 0) {
        return (
          <div className={cn(GLASS_BASE, glassClass, "p-5")} data-testid="section-my-collection">
            <div className="flex items-center gap-2 mb-3">
              <Heart className="h-4 w-4 text-white/80" />
              <h2 className="font-semibold text-white">My Collection</h2>
            </div>
            <p className="text-xs text-white/40 text-center py-4">
              Like or save items in For You to build your collection
            </p>
          </div>
        );
      }

      return (
        <div className={cn(GLASS_BASE, glassClass, "p-5")} data-testid="section-my-collection">
          <div className="flex items-center gap-2 mb-4">
            <Heart className="h-4 w-4 text-white/80" />
            <h2 className="font-semibold text-white">My Collection</h2>
            <span className="text-xs text-white/40 ml-auto">{(liked.length + saved.length)} items</span>
          </div>
          {liked.length > 0 && (
            <div className="mb-3">
              <div className="flex items-center gap-1.5 mb-2">
                <Heart className="h-3 w-3 text-rose-400" />
                <span className="text-xs font-medium text-white/60">Liked</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {liked.slice(0, 8).map((c) => {
                  const DomainIcon = DOMAIN_ICONS[c.domain] || Film;
                  return (
                    <div key={c.id} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-white/[0.06] border border-white/10" data-testid={`collection-liked-${c.id}`}>
                      <DomainIcon className="h-3 w-3 text-white/40 shrink-0" />
                      <span className="text-xs text-white/80 truncate max-w-[120px]">{c.item.title}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {saved.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <Bookmark className="h-3 w-3 text-amber-400" />
                <span className="text-xs font-medium text-white/60">Saved</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {saved.slice(0, 8).map((c) => {
                  const DomainIcon = DOMAIN_ICONS[c.domain] || Film;
                  return (
                    <div key={c.id} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-white/[0.06] border border-white/10" data-testid={`collection-saved-${c.id}`}>
                      <DomainIcon className="h-3 w-3 text-white/40 shrink-0" />
                      <span className="text-xs text-white/80 truncate max-w-[120px]">{c.item.title}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      );
    },

    "taste-dna": () => (
      <div className={cn(GLASS_BASE, glassClass, "p-5")} data-testid="section-taste-dna">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="h-4 w-4 text-white/80" />
          <h2 className="font-semibold text-white">Taste DNA</h2>
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

    "gallery": () => (
      <div className={cn(GLASS_BASE, glassClass, "p-5")} data-testid="section-gallery">
        <div className="flex items-center gap-2 mb-4">
          <ImageIcon className="h-4 w-4 text-white/80" />
          <h2 className="font-semibold text-white">Gallery <span className="text-white/50 font-normal">(Hobby Tags)</span></h2>
        </div>
        <div className="grid grid-cols-3 gap-2 mb-3">
          {topHobbies.slice(0, 3).map((hobby) => {
            const img = getHobbyImage(hobby.title);
            return (
              <div key={hobby.id} className="relative aspect-square rounded-md overflow-hidden bg-white/5">
                {img ? (
                  <img src={img} alt={hobby.title} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <ImageIcon className="h-8 w-8 text-white/20" />
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                <div className="absolute bottom-1.5 left-2 right-2">
                  <span className="text-[10px] text-white font-medium drop-shadow-sm">{hobby.title}</span>
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {topHobbies.map((hobby) => {
            const img = getHobbyImage(hobby.title);
            const scoreColor = hobby.matchScore >= 75 ? "green" : hobby.matchScore >= 50 ? "yellow" : "grey";
            const colorClasses = {
              green: "bg-emerald-500/20 text-emerald-300 border-emerald-400/30",
              yellow: "bg-amber-500/20 text-amber-300 border-amber-400/30",
              grey: "bg-zinc-500/20 text-zinc-300 border-zinc-400/30",
            };
            return (
              <div key={hobby.id} className="flex-shrink-0 w-28">
                <div className="relative aspect-[9/16] rounded-md overflow-hidden bg-white/5">
                  {img ? (
                    <img src={img} alt={hobby.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Film className="h-6 w-6 text-white/20" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                  <div className="absolute bottom-2 left-2 right-2 space-y-1">
                    <span className="text-[10px] text-white font-semibold drop-shadow-sm block">{hobby.title}</span>
                    <div className="flex flex-wrap gap-0.5">
                      {hobby.tags?.slice(0, 2).map((tag) => (
                        <span
                          key={tag}
                          className={cn("text-[8px] px-1 py-0.5 rounded border font-medium", colorClasses[scoreColor])}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    ),
  };

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
              src={coverImage}
              alt="Profile cover"
              className="w-full h-full object-cover"
              data-testid="img-profile-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
          </div>

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

        {settingsOpen && (
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
              <AvatarImage src={user?.profileImageUrl ?? undefined} />
              <AvatarFallback className="text-2xl font-bold bg-white/10 text-white backdrop-blur-sm">
                {(user?.firstName?.[0] ?? "?").toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="text-center sm:text-left flex-1 pb-1">
              <h1 className="text-2xl font-bold tracking-tight text-white drop-shadow-lg" data-testid="text-profile-name">
                {user?.firstName} {user?.lastName}
              </h1>
              {profile?.topClusters && profile.topClusters.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-1.5 justify-center sm:justify-start">
                  {profile.topClusters.map((cluster) => (
                    <Badge key={cluster} variant="secondary" className="text-xs bg-white/15 text-white/80 border-white/10 backdrop-blur-sm">
                      {cluster}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>

          {editingLayout && (
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
            {sections.filter((s) => s.visible).map((sec) => {
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
