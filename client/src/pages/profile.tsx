import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { RadarChart } from "@/components/radar-chart";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { TRAIT_AXES, type TasteProfile, type Item } from "@shared/schema";
import { Sparkles, TrendingUp, Grip, ChevronUp, ChevronDown, Image as ImageIcon, Film, Music, Gamepad2, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";
import profileCover from "@/assets/images/profile-cover.jpg";
import { getHobbyImage } from "@/lib/hobby-images";

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
  { id: "taste-dna", title: "Taste DNA Radar", visible: true },
  { id: "personal-images", title: "Personal Images", visible: true },
  { id: "reels", title: "Reels & Hobby Tags", visible: true },
];

interface HobbyWithMatch {
  id: string;
  title: string;
  matchScore: number;
  tags: string[] | null;
  whyItFits: string;
}

export default function ProfilePage() {
  const { user } = useAuth();
  const [sections, setSections] = useState<ProfileSection[]>(DEFAULT_SECTIONS);
  const [editing, setEditing] = useState(false);

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

  if (isLoading) {
    return (
      <div className="p-6 space-y-6 max-w-3xl mx-auto">
        <Skeleton className="h-48 w-full rounded-md" />
        <Skeleton className="h-32 w-full rounded-md" />
        <Skeleton className="h-64 w-full rounded-md" />
      </div>
    );
  }

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

  const topHobbies = hobbies?.slice(0, 3) ?? [];

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
      <Card className="p-5" data-testid="section-top-traits">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="h-4 w-4 text-primary" />
          <h2 className="font-semibold">Top 3 Traits</h2>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {topTraits.map(([key, val], idx) => {
            const color = getTraitColor(val);
            return (
              <div
                key={key}
                className="p-3 rounded-md bg-muted/50 text-center space-y-1"
              >
                <span className={cn("text-xs font-bold tabular-nums", color.text)}>#{idx + 1}</span>
                <div className="text-xs font-medium text-muted-foreground">{TRAIT_LABELS[key]}</div>
                <div className={cn("text-xl font-bold tabular-nums", color.text)}>
                  {Math.round(val * 100)}%
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    ),

    "mydna-top3": () => (
      <Card className="p-5" data-testid="section-mydna-top3">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="h-4 w-4 text-primary" />
          <h2 className="font-semibold">myDNA Top 3</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {topMovie && (
            <div className="p-3 rounded-md bg-muted/50 space-y-1">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Film className="h-3 w-3" />
                <span>Top Movie</span>
              </div>
              <div className="font-semibold text-sm">{topMovie.title}</div>
              <Badge variant="secondary" className="text-[10px]">{topMovie.matchScore}% match</Badge>
            </div>
          )}
          {topSong && (
            <div className="p-3 rounded-md bg-muted/50 space-y-1">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Music className="h-3 w-3" />
                <span>Top Music</span>
              </div>
              <div className="font-semibold text-sm">{topSong.title}</div>
              <Badge variant="secondary" className="text-[10px]">{topSong.matchScore}% match</Badge>
            </div>
          )}
          {topGame && (
            <div className="p-3 rounded-md bg-muted/50 space-y-1">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Gamepad2 className="h-3 w-3" />
                <span>Top Game</span>
              </div>
              <div className="font-semibold text-sm">{topGame.title}</div>
              <Badge variant="secondary" className="text-[10px]">{topGame.matchScore}% match</Badge>
            </div>
          )}
        </div>
      </Card>
    ),

    "taste-dna": () => (
      <Card className="p-5" data-testid="section-taste-dna">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="h-4 w-4 text-primary" />
          <h2 className="font-semibold">Taste DNA</h2>
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
                    <span className="text-[11px] font-medium text-muted-foreground">
                      {TRAIT_LABELS[axis]}
                    </span>
                    <span className={cn("text-[11px] font-semibold tabular-nums", color.text)}>
                      {Math.round(val * 100)}%
                    </span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-md overflow-hidden">
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
      </Card>
    ),

    "personal-images": () => (
      <Card className="p-5" data-testid="section-personal-images">
        <div className="flex items-center gap-2 mb-4">
          <ImageIcon className="h-4 w-4 text-primary" />
          <h2 className="font-semibold">Personal Images</h2>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {topHobbies.slice(0, 3).map((hobby) => {
            const img = getHobbyImage(hobby.title);
            return (
              <div key={hobby.id} className="relative aspect-square rounded-md overflow-hidden bg-muted">
                {img ? (
                  <img src={img} alt={hobby.title} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                    <ImageIcon className="h-8 w-8 opacity-30" />
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
        <p className="text-xs text-muted-foreground mt-3 text-center">
          Your top hobby matches visualized
        </p>
      </Card>
    ),

    "reels": () => (
      <Card className="p-5" data-testid="section-reels">
        <div className="flex items-center gap-2 mb-4">
          <Film className="h-4 w-4 text-primary" />
          <h2 className="font-semibold">Reels & Hobby Tags</h2>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {topHobbies.map((hobby) => {
            const img = getHobbyImage(hobby.title);
            const scoreColor = hobby.matchScore >= 75 ? "green" : hobby.matchScore >= 50 ? "yellow" : "grey";
            const colorClasses = {
              green: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
              yellow: "bg-amber-500/15 text-amber-400 border-amber-500/30",
              grey: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
            };
            return (
              <div key={hobby.id} className="flex-shrink-0 w-28">
                <div className="relative aspect-[9/16] rounded-md overflow-hidden bg-muted">
                  {img ? (
                    <img src={img} alt={hobby.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-muted">
                      <Film className="h-6 w-6 text-muted-foreground opacity-30" />
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
      </Card>
    ),
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="relative h-44 sm:h-52 overflow-hidden">
        <img
          src={profileCover}
          alt="Profile cover"
          className="w-full h-full object-cover"
          data-testid="img-profile-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/30 to-transparent" />
      </div>

      <div className="px-4 sm:px-6 -mt-12 relative z-10 space-y-4">
        <div className="flex flex-col sm:flex-row items-center sm:items-end gap-4">
          <Avatar className="h-24 w-24 ring-4 ring-background">
            <AvatarImage src={user?.profileImageUrl ?? undefined} />
            <AvatarFallback className="text-2xl font-bold bg-primary/10 text-primary">
              {(user?.firstName?.[0] ?? "?").toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="text-center sm:text-left flex-1 pb-1">
            <h1 className="text-2xl font-bold tracking-tight" data-testid="text-profile-name">
              {user?.firstName} {user?.lastName}
            </h1>
            {profile?.topClusters && profile.topClusters.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-1.5 justify-center sm:justify-start">
                {profile.topClusters.map((cluster) => (
                  <Badge key={cluster} variant="secondary" className="text-xs">
                    {cluster}
                  </Badge>
                ))}
              </div>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setEditing(!editing)}
            data-testid="button-edit-profile"
          >
            <Pencil className="h-3.5 w-3.5 mr-1" />
            {editing ? "Done" : "Edit Layout"}
          </Button>
        </div>

        {editing && (
          <Card className="p-4" data-testid="section-editor">
            <p className="text-xs text-muted-foreground mb-3">
              Reorder or toggle sections to customize your profile
            </p>
            <div className="space-y-1.5">
              {sections.map((sec, idx) => (
                <div key={sec.id} className="flex items-center gap-2 p-2 rounded-md bg-muted/50">
                  <Grip className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-sm flex-1">{sec.title}</span>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => moveSection(idx, -1)}
                    disabled={idx === 0}
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => moveSection(idx, 1)}
                    disabled={idx === sections.length - 1}
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
          </Card>
        )}

        <div className="space-y-4 pb-8">
          {sections.filter((s) => s.visible).map((sec) => {
            const renderer = sectionRenderers[sec.id];
            return renderer ? <div key={sec.id}>{renderer()}</div> : null;
          })}
        </div>
      </div>
    </div>
  );
}
