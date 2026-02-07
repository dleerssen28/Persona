import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { MatchPill, MatchGlow } from "@/components/match-pill";
import { RadarChart } from "@/components/radar-chart";
import { cn } from "@/lib/utils";
import { Users, MessageCircle, MapPin, Globe, Filter } from "lucide-react";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface MatchedUser {
  id: string;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
  matchScore: number;
  explanations: string[];
  traits: Record<string, number>;
  topClusters: string[];
  sharedInterests: string[];
}

export default function SocialPage() {
  const [filter, setFilter] = useState<string>("all");
  const [selectedUser, setSelectedUser] = useState<MatchedUser | null>(null);

  const { data: matchedUsers, isLoading } = useQuery<MatchedUser[]>({
    queryKey: ["/api/social/matches"],
  });

  const filtered = matchedUsers?.filter((u) => {
    if (filter === "green") return u.matchScore >= 75;
    if (filter === "yellow") return u.matchScore >= 50 && u.matchScore < 75;
    return true;
  });

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-social-title">
            Find Your People
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            People whose taste DNA aligns with yours.
          </p>
        </div>

        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-[160px]" data-testid="select-match-filter">
            <Filter className="h-3.5 w-3.5 mr-1.5" />
            <SelectValue placeholder="Filter" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Matches</SelectItem>
            <SelectItem value="green">High Match (75+)</SelectItem>
            <SelectItem value="yellow">Good Match (50+)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-40 rounded-md" />
          ))}
        </div>
      ) : !filtered || filtered.length === 0 ? (
        <Card className="p-8 text-center">
          <div className="text-muted-foreground space-y-2">
            <Users className="h-10 w-10 mx-auto opacity-30" />
            <p className="text-sm">No matches found yet. More users are joining every day.</p>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {filtered.map((matchedUser) => (
            <MatchGlow key={matchedUser.id} score={matchedUser.matchScore}>
              <Card className="p-4 space-y-3 overflow-visible">
                <div className="flex items-start gap-3">
                  <Avatar className="h-12 w-12 border border-border">
                    <AvatarImage src={matchedUser.profileImageUrl ?? undefined} />
                    <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                      {(matchedUser.firstName?.[0] ?? "?").toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-sm" data-testid={`text-match-name-${matchedUser.id}`}>
                        {matchedUser.firstName} {matchedUser.lastName}
                      </h3>
                      <MatchPill score={matchedUser.matchScore} size="sm" />
                    </div>
                    {matchedUser.topClusters.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {matchedUser.topClusters.slice(0, 3).map((c) => (
                          <Badge key={c} variant="secondary" className="text-[10px] px-1.5">
                            {c}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {matchedUser.explanations.length > 0 && (
                  <div className="text-xs text-muted-foreground space-y-0.5 pl-1">
                    {matchedUser.explanations.slice(0, 2).map((exp, i) => (
                      <div key={i} className="flex items-start gap-1.5">
                        <span className="text-primary mt-0.5 shrink-0">
                          <span className="inline-block h-1 w-1 rounded-full bg-primary" />
                        </span>
                        {exp}
                      </div>
                    ))}
                  </div>
                )}

                {matchedUser.sharedInterests.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {matchedUser.sharedInterests.slice(0, 4).map((interest) => (
                      <span
                        key={interest}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium"
                      >
                        {interest}
                      </span>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-2 pt-1">
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedUser(matchedUser)}
                        data-testid={`button-view-profile-${matchedUser.id}`}
                      >
                        View Profile
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-md">
                      <DialogHeader>
                        <DialogTitle className="flex items-center gap-3">
                          <Avatar className="h-10 w-10">
                            <AvatarImage src={matchedUser.profileImageUrl ?? undefined} />
                            <AvatarFallback className="bg-primary/10 text-primary">
                              {(matchedUser.firstName?.[0] ?? "?").toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <div>{matchedUser.firstName} {matchedUser.lastName}</div>
                            <div className="font-normal">
                              <MatchPill score={matchedUser.matchScore} size="sm" />
                            </div>
                          </div>
                        </DialogTitle>
                      </DialogHeader>
                      <div className="flex justify-center py-4">
                        <RadarChart traits={matchedUser.traits} size={220} />
                      </div>
                      <div className="space-y-2">
                        <h4 className="text-sm font-semibold">Why you match</h4>
                        {matchedUser.explanations.map((exp, i) => (
                          <div key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                            <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                            {exp}
                          </div>
                        ))}
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </Card>
            </MatchGlow>
          ))}
        </div>
      )}
    </div>
  );
}
