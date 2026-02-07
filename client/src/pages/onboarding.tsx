import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { DOMAINS, type Domain } from "@shared/schema";
import {
  Film, Music, Gamepad2, UtensilsCrossed, Compass,
  ArrowRight, ArrowLeft, Sparkles, Check
} from "lucide-react";

const DOMAIN_CONFIG: Record<Domain, { icon: typeof Film; label: string; color: string }> = {
  movies: { icon: Film, label: "Movies & TV", color: "text-blue-400" },
  music: { icon: Music, label: "Music", color: "text-purple-400" },
  games: { icon: Gamepad2, label: "Gaming", color: "text-green-400" },
  food: { icon: UtensilsCrossed, label: "Food & Cuisine", color: "text-orange-400" },
  hobbies: { icon: Compass, label: "Hobbies", color: "text-pink-400" },
};

const DOMAIN_ITEMS: Record<Domain, { id: string; title: string; tags: string[] }[]> = {
  movies: [
    { id: "m1", title: "Interstellar", tags: ["sci-fi", "space", "emotional"] },
    { id: "m2", title: "The Dark Knight", tags: ["action", "thriller", "dark"] },
    { id: "m3", title: "Spirited Away", tags: ["anime", "fantasy", "magical"] },
    { id: "m4", title: "Inception", tags: ["sci-fi", "thriller", "mind-bending"] },
    { id: "m5", title: "The Grand Budapest Hotel", tags: ["comedy", "quirky", "artistic"] },
    { id: "m6", title: "Parasite", tags: ["thriller", "social", "dark-comedy"] },
    { id: "m7", title: "Lord of the Rings", tags: ["fantasy", "epic", "adventure"] },
    { id: "m8", title: "Pulp Fiction", tags: ["crime", "dialogue", "nonlinear"] },
    { id: "m9", title: "The Matrix", tags: ["sci-fi", "action", "philosophical"] },
    { id: "m10", title: "Studio Ghibli Films", tags: ["anime", "cozy", "nature"] },
    { id: "m11", title: "Marvel Universe", tags: ["superhero", "action", "fun"] },
    { id: "m12", title: "Horror Classics", tags: ["horror", "intense", "suspense"] },
  ],
  music: [
    { id: "mu1", title: "Indie / Alternative", tags: ["indie", "creative", "mellow"] },
    { id: "mu2", title: "Electronic / EDM", tags: ["electronic", "energy", "beats"] },
    { id: "mu3", title: "Hip Hop / Rap", tags: ["hip-hop", "rhythm", "lyrical"] },
    { id: "mu4", title: "Classical / Orchestral", tags: ["classical", "elegant", "complex"] },
    { id: "mu5", title: "Jazz / Blues", tags: ["jazz", "soulful", "improvisation"] },
    { id: "mu6", title: "Rock / Metal", tags: ["rock", "intense", "guitar"] },
    { id: "mu7", title: "Pop / Top 40", tags: ["pop", "catchy", "mainstream"] },
    { id: "mu8", title: "R&B / Soul", tags: ["rnb", "smooth", "emotional"] },
    { id: "mu9", title: "Lo-fi / Ambient", tags: ["lofi", "chill", "atmospheric"] },
    { id: "mu10", title: "K-Pop / J-Pop", tags: ["kpop", "energetic", "visual"] },
    { id: "mu11", title: "Country / Folk", tags: ["country", "storytelling", "acoustic"] },
    { id: "mu12", title: "Reggae / Dancehall", tags: ["reggae", "chill", "groove"] },
  ],
  games: [
    { id: "g1", title: "Open World RPGs", tags: ["rpg", "exploration", "story"] },
    { id: "g2", title: "Competitive FPS", tags: ["fps", "competitive", "reaction"] },
    { id: "g3", title: "Strategy / 4X", tags: ["strategy", "planning", "complex"] },
    { id: "g4", title: "Indie / Puzzle", tags: ["indie", "creative", "puzzle"] },
    { id: "g5", title: "Cozy Sims", tags: ["simulation", "cozy", "relaxing"] },
    { id: "g6", title: "Fighting Games", tags: ["fighting", "competitive", "skill"] },
    { id: "g7", title: "MMORPGs", tags: ["mmo", "social", "grinding"] },
    { id: "g8", title: "Survival / Crafting", tags: ["survival", "crafting", "intense"] },
    { id: "g9", title: "Story-Driven", tags: ["narrative", "emotional", "cinematic"] },
    { id: "g10", title: "Battle Royale", tags: ["competitive", "action", "multiplayer"] },
    { id: "g11", title: "Racing / Sports", tags: ["racing", "sports", "fast"] },
    { id: "g12", title: "Retro / Classic", tags: ["retro", "nostalgic", "arcade"] },
  ],
  food: [
    { id: "f1", title: "Japanese Cuisine", tags: ["japanese", "umami", "precise"] },
    { id: "f2", title: "Italian Comfort", tags: ["italian", "comfort", "classic"] },
    { id: "f3", title: "Spicy Thai / Indian", tags: ["spicy", "bold", "aromatic"] },
    { id: "f4", title: "Street Food Culture", tags: ["street-food", "casual", "diverse"] },
    { id: "f5", title: "Plant-Based / Vegan", tags: ["vegan", "health", "creative"] },
    { id: "f6", title: "BBQ & Grilling", tags: ["bbq", "smoky", "hearty"] },
    { id: "f7", title: "French Fine Dining", tags: ["french", "elegant", "refined"] },
    { id: "f8", title: "Mexican / Latin", tags: ["mexican", "vibrant", "spicy"] },
    { id: "f9", title: "Korean Food", tags: ["korean", "fermented", "bold"] },
    { id: "f10", title: "Mediterranean", tags: ["mediterranean", "fresh", "healthy"] },
    { id: "f11", title: "Bakery & Pastry", tags: ["baking", "sweet", "artisan"] },
    { id: "f12", title: "Comfort / Fast Food", tags: ["comfort", "nostalgic", "quick"] },
  ],
  hobbies: [
    { id: "h1", title: "Photography", tags: ["visual", "creative", "outdoor"] },
    { id: "h2", title: "Hiking & Outdoors", tags: ["adventure", "nature", "fitness"] },
    { id: "h3", title: "Cooking & Baking", tags: ["cooking", "creative", "cozy"] },
    { id: "h4", title: "Drawing & Art", tags: ["art", "creative", "visual"] },
    { id: "h5", title: "Board Games", tags: ["strategy", "social", "fun"] },
    { id: "h6", title: "Reading / Books", tags: ["reading", "intellectual", "solitary"] },
    { id: "h7", title: "Fitness & Gym", tags: ["fitness", "discipline", "health"] },
    { id: "h8", title: "Music Production", tags: ["music", "creative", "technical"] },
    { id: "h9", title: "Gardening", tags: ["nature", "cozy", "patient"] },
    { id: "h10", title: "Travel & Exploring", tags: ["adventure", "culture", "social"] },
    { id: "h11", title: "DIY & Crafting", tags: ["crafting", "creative", "hands-on"] },
    { id: "h12", title: "Coding / Tech", tags: ["tech", "problem-solving", "logical"] },
  ],
};

const TRAIT_QUESTIONS = [
  { trait: "novelty", label: "How much do you seek new, unfamiliar experiences?", low: "Comfort zone", high: "Always exploring" },
  { trait: "intensity", label: "Do you prefer intense or relaxed experiences?", low: "Calm & peaceful", high: "Thrilling & intense" },
  { trait: "social", label: "Do you prefer solo or social activities?", low: "Solo time", high: "Social butterfly" },
  { trait: "creativity", label: "How important is creative expression to you?", low: "Practical", high: "Highly creative" },
];

interface OnboardingProps {
  onComplete: () => void;
}

export default function OnboardingPage({ onComplete }: OnboardingProps) {
  const [step, setStep] = useState(0);
  const [selections, setSelections] = useState<Record<string, Set<string>>>({
    movies: new Set(),
    music: new Set(),
    games: new Set(),
    food: new Set(),
    hobbies: new Set(),
  });
  const [traitValues, setTraitValues] = useState<Record<string, number>>({
    novelty: 0.5,
    intensity: 0.5,
    social: 0.5,
    creativity: 0.5,
  });
  const { toast } = useToast();

  const totalSteps = DOMAINS.length + 1;
  const progress = ((step + 1) / (totalSteps + 1)) * 100;

  const submitMutation = useMutation({
    mutationFn: async () => {
      const favorites: Record<string, string[]> = {};
      for (const domain of DOMAINS) {
        favorites[domain] = Array.from(selections[domain]);
      }
      const res = await apiRequest("POST", "/api/onboarding", {
        favorites,
        traits: traitValues,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/taste-profile"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      onComplete();
    },
    onError: (err) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const currentDomain = step < DOMAINS.length ? DOMAINS[step] : null;

  function toggleItem(domain: string, itemId: string) {
    setSelections((prev) => {
      const next = { ...prev };
      const set = new Set(prev[domain]);
      if (set.has(itemId)) set.delete(itemId);
      else set.add(itemId);
      next[domain] = set;
      return next;
    });
  }

  function handleNext() {
    if (step < totalSteps) setStep(step + 1);
    else submitMutation.mutate();
  }

  function handleBack() {
    if (step > 0) setStep(step - 1);
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border/50 px-4 sm:px-6 py-3">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="font-semibold text-sm">Build Your Taste DNA</span>
            </div>
            <span className="text-xs text-muted-foreground">
              Step {step + 1} of {totalSteps + 1}
            </span>
          </div>
          <Progress value={progress} className="h-1.5" data-testid="progress-onboarding" />
        </div>
      </div>

      <div className="flex-1 px-4 sm:px-6 py-8">
        <div className="max-w-2xl mx-auto">
          {currentDomain ? (
            <DomainStep
              domain={currentDomain as Domain}
              selections={selections[currentDomain]}
              onToggle={(id) => toggleItem(currentDomain, id)}
            />
          ) : step === DOMAINS.length ? (
            <TraitStep
              values={traitValues}
              onChange={(trait, val) =>
                setTraitValues((prev) => ({ ...prev, [trait]: val }))
              }
            />
          ) : null}
        </div>
      </div>

      <div className="sticky bottom-0 bg-background/80 backdrop-blur-xl border-t border-border/50 px-4 sm:px-6 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-4">
          <Button
            variant="ghost"
            onClick={handleBack}
            disabled={step === 0}
            data-testid="button-onboarding-back"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <Button
            onClick={handleNext}
            disabled={submitMutation.isPending}
            data-testid="button-onboarding-next"
          >
            {step === totalSteps ? (
              submitMutation.isPending ? "Building DNA..." : "Complete Setup"
            ) : (
              <>
                Next
                <ArrowRight className="h-4 w-4 ml-1" />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

function DomainStep({
  domain,
  selections,
  onToggle,
}: {
  domain: Domain;
  selections: Set<string>;
  onToggle: (id: string) => void;
}) {
  const config = DOMAIN_CONFIG[domain];
  const Icon = config.icon;
  const items = DOMAIN_ITEMS[domain];

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <div className={cn("inline-flex items-center justify-center h-12 w-12 rounded-md bg-card", config.color)}>
          <Icon className="h-6 w-6" />
        </div>
        <h2 className="text-2xl font-bold tracking-tight">Pick your {config.label}</h2>
        <p className="text-muted-foreground text-sm">
          Select everything that resonates with you. Pick at least 2.
        </p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {items.map((item) => {
          const selected = selections.has(item.id);
          return (
            <button
              key={item.id}
              onClick={() => onToggle(item.id)}
              className={cn(
                "relative p-4 rounded-md border text-left transition-all duration-200",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                selected
                  ? "border-primary/50 bg-primary/10"
                  : "border-border/60 bg-card hover-elevate"
              )}
              data-testid={`button-item-${item.id}`}
            >
              {selected && (
                <div className="absolute top-2 right-2 h-5 w-5 rounded-md bg-primary flex items-center justify-center">
                  <Check className="h-3 w-3 text-primary-foreground" />
                </div>
              )}
              <div className="font-medium text-sm leading-tight">{item.title}</div>
              <div className="flex flex-wrap gap-1 mt-2">
                {item.tags.slice(0, 2).map((tag) => (
                  <span
                    key={tag}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </button>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground text-center">
        {selections.size} selected
      </p>
    </div>
  );
}

function TraitStep({
  values,
  onChange,
}: {
  values: Record<string, number>;
  onChange: (trait: string, val: number) => void;
}) {
  return (
    <div className="space-y-8">
      <div className="text-center space-y-2">
        <div className="inline-flex items-center justify-center h-12 w-12 rounded-md bg-card text-primary">
          <Sparkles className="h-6 w-6" />
        </div>
        <h2 className="text-2xl font-bold tracking-tight">Fine-tune Your Traits</h2>
        <p className="text-muted-foreground text-sm">
          Help us understand your personality better. Slide to match your vibe.
        </p>
      </div>
      <div className="space-y-8">
        {TRAIT_QUESTIONS.map((q) => (
          <Card key={q.trait} className="p-5 space-y-4">
            <p className="font-medium text-sm">{q.label}</p>
            <Slider
              value={[values[q.trait] * 100]}
              onValueChange={([v]) => onChange(q.trait, v / 100)}
              max={100}
              step={1}
              className="w-full"
              data-testid={`slider-trait-${q.trait}`}
            />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{q.low}</span>
              <span className="font-medium text-foreground tabular-nums">
                {Math.round(values[q.trait] * 100)}%
              </span>
              <span>{q.high}</span>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
