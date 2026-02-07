import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ThemeToggle } from "@/components/theme-toggle";
import { RadarChart } from "@/components/radar-chart";
import { MatchPill } from "@/components/match-pill";
import { Sparkles, Users, Compass, Zap, ArrowRight, Brain } from "lucide-react";

const sampleTraits = {
  novelty: 0.82,
  intensity: 0.65,
  cozy: 0.35,
  strategy: 0.78,
  social: 0.55,
  creativity: 0.88,
  nostalgia: 0.42,
  adventure: 0.91,
};

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border/50 backdrop-blur-xl bg-background/80">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-md bg-primary flex items-center justify-center">
              <Sparkles className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-semibold text-lg tracking-tight" data-testid="text-app-name">Persona</span>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <a href="/api/login">
              <Button data-testid="button-login-nav">Sign In</Button>
            </a>
          </div>
        </div>
      </nav>

      <section className="pt-28 pb-20 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            <div className="space-y-6">
              <div className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-sm text-muted-foreground">
                <Brain className="h-3.5 w-3.5 text-primary" />
                <span>AI-Powered Taste Intelligence</span>
              </div>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.1]">
                Discover Your
                <span className="block text-primary mt-1">Taste DNA</span>
              </h1>
              <p className="text-lg text-muted-foreground max-w-lg leading-relaxed">
                Persona maps your preferences across movies, music, games, food, and hobbies into a unique profile that connects you with truly compatible people and experiences.
              </p>
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <a href="/api/login">
                  <Button size="lg" data-testid="button-get-started">
                    Get Started
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </a>
              </div>
              <div className="flex items-center gap-4 text-sm text-muted-foreground pt-2">
                <div className="flex items-center gap-1.5">
                  <Zap className="h-3.5 w-3.5 text-primary" />
                  <span>Instant matching</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Brain className="h-3.5 w-3.5 text-primary" />
                  <span>8-trait taste engine</span>
                </div>
              </div>
            </div>

            <div className="relative flex items-center justify-center">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/5 rounded-2xl" />
              <div className="relative">
                <RadarChart traits={sampleTraits} size={300} />
                <div className="absolute -top-2 -right-2">
                  <MatchPill score={92} size="lg" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-20 px-4 sm:px-6 border-t border-border/50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">How it works</h2>
            <p className="text-muted-foreground mt-3 max-w-lg mx-auto">
              Three steps to understanding yourself better and finding your people.
            </p>
          </div>
          <div className="grid sm:grid-cols-3 gap-6">
            <Card className="p-6 space-y-3">
              <div className="h-10 w-10 rounded-md bg-primary/10 flex items-center justify-center">
                <Sparkles className="h-5 w-5 text-primary" />
              </div>
              <h3 className="font-semibold text-lg">Build Your DNA</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Pick your favorites across movies, music, games, food, and hobbies. Our engine maps your taste into a unique multi-dimensional profile.
              </p>
            </Card>
            <Card className="p-6 space-y-3">
              <div className="h-10 w-10 rounded-md bg-primary/10 flex items-center justify-center">
                <Users className="h-5 w-5 text-primary" />
              </div>
              <h3 className="font-semibold text-lg">Find Your People</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                See compatibility scores with others explained by shared taste patterns, not just surface-level overlap. High match, low overlap is the magic.
              </p>
            </Card>
            <Card className="p-6 space-y-3">
              <div className="h-10 w-10 rounded-md bg-primary/10 flex items-center justify-center">
                <Compass className="h-5 w-5 text-primary" />
              </div>
              <h3 className="font-semibold text-lg">Explore New Worlds</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Discover hobbies and content that fit your personality. Every recommendation comes with a "why" so you understand the connection.
              </p>
            </Card>
          </div>
        </div>
      </section>

      <footer className="border-t border-border/50 py-8 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            <span>Persona</span>
          </div>
          <p>Built with taste intelligence</p>
        </div>
      </footer>
    </div>
  );
}
