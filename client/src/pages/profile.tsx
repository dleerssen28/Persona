import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { RadarChart } from "@/components/radar-chart";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { TRAIT_AXES, type TasteProfile } from "@shared/schema";
import { Sparkles, TrendingUp } from "lucide-react";

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

export default function ProfilePage() {
  const { user } = useAuth();

  const { data: profile, isLoading } = useQuery<TasteProfile>({
    queryKey: ["/api/taste-profile"],
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-6 max-w-3xl mx-auto">
        <Skeleton className="h-32 w-full rounded-md" />
        <Skeleton className="h-64 w-64 mx-auto rounded-md" />
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-20 rounded-md" />
          ))}
        </div>
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

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-3xl mx-auto">
      <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5">
        <Avatar className="h-20 w-20 border-2 border-primary/20">
          <AvatarImage src={user?.profileImageUrl ?? undefined} />
          <AvatarFallback className="text-xl font-bold bg-primary/10 text-primary">
            {(user?.firstName?.[0] ?? "?").toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="text-center sm:text-left space-y-1.5">
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-profile-name">
            {user?.firstName} {user?.lastName}
          </h1>
          <p className="text-sm text-muted-foreground" data-testid="text-profile-email">
            {user?.email}
          </p>
          {profile?.topClusters && profile.topClusters.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1 justify-center sm:justify-start">
              {profile.topClusters.map((cluster) => (
                <Badge key={cluster} variant="secondary" className="text-xs">
                  {cluster}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </div>

      <Card className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="h-4 w-4 text-primary" />
          <h2 className="font-semibold">Your Taste DNA</h2>
        </div>
        <div className="flex flex-col sm:flex-row items-center gap-6">
          <RadarChart traits={traits} size={260} />
          <div className="flex-1 space-y-3 w-full">
            {TRAIT_AXES.map((axis) => {
              const val = traits[axis] ?? 0.5;
              return (
                <div key={axis} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">
                      {TRAIT_LABELS[axis]}
                    </span>
                    <span className="text-xs font-semibold tabular-nums">
                      {Math.round(val * 100)}%
                    </span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-md overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-md transition-all duration-700 ease-out"
                      style={{ width: `${val * 100}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="h-4 w-4 text-primary" />
          <h2 className="font-semibold">Top Traits</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {topTraits.map(([key, val], idx) => (
            <div
              key={key}
              className="p-4 rounded-md bg-muted/50 space-y-1"
            >
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-primary tabular-nums">#{idx + 1}</span>
                <span className="text-sm font-medium">{TRAIT_LABELS[key]}</span>
              </div>
              <div className="text-2xl font-bold tabular-nums text-primary">
                {Math.round(val * 100)}%
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
