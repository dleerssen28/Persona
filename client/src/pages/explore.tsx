import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MatchPill, MatchGlow } from "@/components/match-pill";
import { cn } from "@/lib/utils";
import { Compass, ExternalLink, Users, Sparkles, ArrowRight } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { Hobby } from "@shared/schema";

interface HobbyWithMatch extends Hobby {
  matchScore: number;
  whyItFits: string;
  usersDoingIt: number;
}

export default function ExplorePage() {
  const { data: hobbies, isLoading } = useQuery<HobbyWithMatch[]>({
    queryKey: ["/api/explore/hobbies"],
  });

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-44 rounded-md" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-explore-title">
          Explore Hobbies
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Discover new activities that match your personality and taste.
        </p>
      </div>

      {!hobbies || hobbies.length === 0 ? (
        <Card className="p-8 text-center">
          <div className="text-muted-foreground space-y-2">
            <Compass className="h-10 w-10 mx-auto opacity-30" />
            <p className="text-sm">Complete your onboarding to get hobby recommendations.</p>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {hobbies.map((hobby) => (
            <MatchGlow key={hobby.id} score={hobby.matchScore}>
              <Card className="p-4 space-y-3 overflow-visible h-full flex flex-col">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold" data-testid={`text-hobby-title-${hobby.id}`}>
                      {hobby.title}
                    </h3>
                    {hobby.tags && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {hobby.tags.slice(0, 4).map((tag) => (
                          <Badge key={tag} variant="secondary" className="text-[10px] px-1.5">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <MatchPill score={hobby.matchScore} size="sm" />
                </div>

                {hobby.description && (
                  <p className="text-xs text-muted-foreground leading-relaxed flex-1">
                    {hobby.description}
                  </p>
                )}

                <div className="flex items-start gap-1.5 text-xs">
                  <Sparkles className="h-3 w-3 text-primary mt-0.5 shrink-0" />
                  <span className="text-muted-foreground">{hobby.whyItFits}</span>
                </div>

                <div className="flex items-center justify-between gap-2 pt-1">
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Users className="h-3 w-3" />
                    <span>{hobby.usersDoingIt} exploring</span>
                  </div>

                  <Dialog>
                    <DialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        data-testid={`button-hobby-detail-${hobby.id}`}
                      >
                        Learn More
                        <ArrowRight className="h-3 w-3 ml-1" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-lg">
                      <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                          {hobby.title}
                          <MatchPill score={hobby.matchScore} size="sm" />
                        </DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4 pt-2">
                        <p className="text-sm text-muted-foreground leading-relaxed">
                          {hobby.description}
                        </p>

                        <div className="space-y-2">
                          <h4 className="text-sm font-semibold flex items-center gap-1.5">
                            <Sparkles className="h-3.5 w-3.5 text-primary" />
                            Why it fits you
                          </h4>
                          <p className="text-sm text-muted-foreground">{hobby.whyItFits}</p>
                        </div>

                        {hobby.tags && (
                          <div className="flex flex-wrap gap-1.5">
                            {hobby.tags.map((tag) => (
                              <Badge key={tag} variant="secondary">
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        )}

                        {hobby.starterLinks && hobby.starterLinks.length > 0 && (
                          <div className="space-y-2">
                            <h4 className="text-sm font-semibold">Get Started</h4>
                            <div className="space-y-1.5">
                              {hobby.starterLinks.map((link, i) => (
                                <a
                                  key={i}
                                  href={link}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-2 text-sm text-primary hover:underline"
                                >
                                  <ExternalLink className="h-3 w-3" />
                                  {link}
                                </a>
                              ))}
                            </div>
                          </div>
                        )}
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
