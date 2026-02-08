import { useState, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import {
  Sparkles, ArrowRight, ArrowLeft, Check, ChevronDown,
  MoreVertical, RotateCcw, Info,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

type TraitKey = "novelty" | "social" | "strategy" | "cozy" | "creativity" | "intensity" | "nostalgia" | "adventure";

interface Statement {
  text: string;
  trait: TraitKey;
  reverse: boolean;
}

interface QuizBlock {
  id: string;
  statements: Statement[];
}

const QUIZ_BLOCKS: QuizBlock[] = [
  {
    id: "q1",
    statements: [
      { text: "I love trying new experiences even if I'm not sure I'll like them.", trait: "novelty", reverse: false },
      { text: "I'm energized by being around people for long periods.", trait: "social", reverse: false },
      { text: "I like groups with clear plans, structure, and expectations.", trait: "strategy", reverse: false },
      { text: "I'd rather have a few close friendships than lots of casual ones.", trait: "cozy", reverse: false },
    ],
  },
  {
    id: "q2",
    statements: [
      { text: "I prefer activities where I can express myself creatively.", trait: "creativity", reverse: false },
      { text: "Competition motivates me to show up and improve.", trait: "intensity", reverse: false },
      { text: "I'm most fulfilled when I'm doing something meaningful or mission-driven.", trait: "nostalgia", reverse: false },
      { text: "I'm comfortable joining things even when details are uncertain.", trait: "adventure", reverse: false },
    ],
  },
  {
    id: "q3",
    statements: [
      { text: "I get bored doing the same activities repeatedly.", trait: "novelty", reverse: false },
      { text: "I'm happiest when my week includes multiple social plans.", trait: "social", reverse: false },
      { text: "Spontaneous plans are more fun than strict schedules.", trait: "strategy", reverse: true },
      { text: "I prefer drop-in events over long-term communities.", trait: "cozy", reverse: true },
    ],
  },
  {
    id: "q4",
    statements: [
      { text: "I'm drawn to imagination, originality, and creative spaces.", trait: "creativity", reverse: false },
      { text: "I prefer collaborative spaces over competitive ones.", trait: "intensity", reverse: true },
      { text: "I mostly join things for fun, not because they matter.", trait: "nostalgia", reverse: true },
      { text: "If expectations aren't clear, I'd rather not participate.", trait: "adventure", reverse: true },
    ],
  },
  {
    id: "q5",
    statements: [
      { text: "I rarely choose something new if I can choose what I already know.", trait: "novelty", reverse: true },
      { text: "After social events, I usually need a lot of alone time to recover.", trait: "social", reverse: true },
      { text: "Rules and formal structure usually make activities less enjoyable.", trait: "strategy", reverse: true },
      { text: "I'd rather meet lots of new people than invest deeply in a few.", trait: "cozy", reverse: true },
    ],
  },
  {
    id: "q6",
    statements: [
      { text: "I prefer practical activities over expressive or creative ones.", trait: "creativity", reverse: true },
      { text: "I dislike competitive environments, even friendly ones.", trait: "intensity", reverse: true },
      { text: "I'm more likely to commit if a group's mission aligns with my values.", trait: "nostalgia", reverse: false },
      { text: "I can handle ambiguity if the experience might be worth it.", trait: "adventure", reverse: false },
    ],
  },
];

function computeTraits(
  selections: Record<string, { most: number | null; least: number | null }>
): Record<string, number> {
  const scores: Record<TraitKey, number[]> = {
    novelty: [], social: [], strategy: [], cozy: [],
    creativity: [], intensity: [], nostalgia: [], adventure: [],
  };

  for (const block of QUIZ_BLOCKS) {
    const sel = selections[block.id];
    if (!sel) continue;

    block.statements.forEach((stmt, idx) => {
      let raw = 0;
      if (sel.most === idx) raw = 1;
      else if (sel.least === idx) raw = -1;

      const effectiveScore = stmt.reverse ? -raw : raw;
      scores[stmt.trait].push(effectiveScore);
    });
  }

  const result: Record<string, number> = {};
  for (const [trait, vals] of Object.entries(scores)) {
    if (vals.length === 0) {
      result[trait] = 0.5;
      continue;
    }
    const sum = vals.reduce((a, b) => a + b, 0);
    const maxPossible = vals.length;
    result[trait] = Math.max(0.05, Math.min(0.95, (sum + maxPossible) / (2 * maxPossible)));
  }

  return result;
}

interface OnboardingProps {
  onComplete: () => void;
}

export default function OnboardingPage({ onComplete }: OnboardingProps) {
  const [showIntro, setShowIntro] = useState(true);
  const [step, setStep] = useState(0);
  const [selections, setSelections] = useState<
    Record<string, { most: number | null; least: number | null }>
  >({});
  const [showProjectDetails, setShowProjectDetails] = useState(false);
  const { toast } = useToast();

  const submitMutation = useMutation({
    mutationFn: async (traits: Record<string, number>) => {
      await apiRequest("POST", "/api/onboarding", {
        favorites: {},
        traits,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/taste-profile"] });
      queryClient.invalidateQueries({ queryKey: ["/api/recommendations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/social/matches"] });
      queryClient.invalidateQueries({ queryKey: ["/api/events/for-you"] });
      onComplete();
    },
    onError: (err) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const totalSteps = QUIZ_BLOCKS.length;
  const currentBlock = QUIZ_BLOCKS[step];
  const currentSel = selections[currentBlock?.id] || { most: null, least: null };
  const canAdvance = currentSel.most !== null && currentSel.least !== null;
  const isLastStep = step === totalSteps - 1;
  const allComplete = Object.keys(selections).length === totalSteps &&
    Object.values(selections).every(s => s.most !== null && s.least !== null);

  const toggleSelection = useCallback((blockId: string, type: "most" | "least", idx: number) => {
    setSelections(prev => {
      const current = prev[blockId] || { most: null, least: null };
      const other = type === "most" ? "least" : "most";

      if (current[other] === idx) {
        return {
          ...prev,
          [blockId]: { ...current, [other]: null, [type]: idx },
        };
      }

      return {
        ...prev,
        [blockId]: {
          ...current,
          [type]: current[type] === idx ? null : idx,
        },
      };
    });
  }, []);

  function handleNext() {
    if (isLastStep && allComplete) {
      const traits = computeTraits(selections);
      submitMutation.mutate(traits);
    } else if (canAdvance) {
      setStep(s => Math.min(s + 1, totalSteps - 1));
    }
  }

  function handleBack() {
    if (step === 0) {
      setShowIntro(true);
    } else {
      setStep(s => Math.max(s - 1, 0));
    }
  }

  function handleRetake() {
    setStep(0);
    setSelections({});
    setShowIntro(true);
    toast({ title: "Quiz reset", description: "Start fresh!" });
  }

  const progressPercent = ((step + 1) / totalSteps) * 100;

  if (showIntro) {
    return (
      <div className="min-h-screen bg-background flex flex-col" data-testid="onboarding-page">
        <header className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border/50">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-md bg-primary flex items-center justify-center">
              <Sparkles className="h-3.5 w-3.5 text-primary-foreground" />
            </div>
            <span className="font-semibold text-base tracking-tight">Persona</span>
          </div>
        </header>

        <div className="flex-1 flex flex-col items-center justify-center p-4">
          <div className="w-full max-w-md space-y-6 text-center">
            <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-primary/10 mx-auto">
              <Sparkles className="h-8 w-8 text-primary" />
            </div>

            <div className="space-y-2">
              <h1 className="text-2xl font-bold tracking-tight" data-testid="text-quiz-title">
                Persona DNA Quiz
              </h1>
              <p className="text-muted-foreground text-sm">
                6 quick questions to build your campus personality profile
              </p>
            </div>

            <div className="space-y-4 text-left">
              <div className="rounded-md border border-border/60 bg-card p-4 space-y-3">
                <h2 className="text-sm font-semibold">How it works</h2>
                <div className="space-y-2.5">
                  <div className="flex items-start gap-3">
                    <div className="shrink-0 h-6 w-6 rounded-full bg-emerald-500/15 flex items-center justify-center mt-0.5">
                      <Sparkles className="h-3 w-3 text-emerald-400" />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Each card shows 4 statements. Pick the one <span className="font-semibold text-foreground">MOST</span> like you.
                    </p>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="shrink-0 h-6 w-6 rounded-full bg-rose-500/15 flex items-center justify-center mt-0.5">
                      <ChevronDown className="h-3 w-3 text-rose-400" />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Then pick the one <span className="font-semibold text-foreground">LEAST</span> like you.
                    </p>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="shrink-0 h-6 w-6 rounded-full bg-primary/15 flex items-center justify-center mt-0.5">
                      <Check className="h-3 w-3 text-primary" />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      No right or wrong answers. Go with your gut.
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-md border border-border/60 bg-card p-4">
                <h2 className="text-sm font-semibold mb-2">Your 8 Persona Traits</h2>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                  {[
                    "Novelty Seeking", "Social Energy", "Structure & Planning", "Depth & Closeness",
                    "Creative Expression", "Competitive Drive", "Purpose & Mission", "Comfort w/ Uncertainty"
                  ].map(t => (
                    <span key={t} className="text-xs text-muted-foreground">{t}</span>
                  ))}
                </div>
              </div>
            </div>

            <Button
              onClick={() => setShowIntro(false)}
              className="w-full"
              data-testid="button-start-quiz"
            >
              Start Quiz
              <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col" data-testid="onboarding-page">
      <header className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border/50">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-md bg-primary flex items-center justify-center">
            <Sparkles className="h-3.5 w-3.5 text-primary-foreground" />
          </div>
          <span className="font-semibold text-base tracking-tight">Persona</span>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" data-testid="button-quiz-menu">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem
              onClick={() => setShowProjectDetails(true)}
              data-testid="menu-project-details"
            >
              <Info className="h-4 w-4 mr-2" />
              Project Details
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={handleRetake}
              data-testid="menu-retake-quiz"
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Retake Quiz
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <div className="flex-1 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-lg space-y-5">
          <div className="flex items-center gap-3">
            <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-500 ease-out"
                style={{ width: `${progressPercent}%` }}
                data-testid="progress-quiz"
              />
            </div>
            <span className="text-xs text-muted-foreground font-medium tabular-nums shrink-0">
              {step + 1}/{totalSteps}
            </span>
          </div>

          <div className="space-y-2">
            {currentBlock.statements.map((stmt, idx) => {
              const isMost = currentSel.most === idx;
              const isLeast = currentSel.least === idx;
              const isSelected = isMost || isLeast;

              return (
                <div
                  key={idx}
                  className={cn(
                    "flex items-center gap-0 rounded-md border transition-all duration-200",
                    isSelected
                      ? isMost
                        ? "border-emerald-500/60 bg-emerald-500/8"
                        : "border-rose-500/60 bg-rose-500/8"
                      : "border-border/60 bg-card"
                  )}
                  data-testid={`statement-${step}-${idx}`}
                >
                  <button
                    onClick={() => toggleSelection(currentBlock.id, "least", idx)}
                    className={cn(
                      "shrink-0 flex flex-col items-center justify-center w-14 py-3 rounded-l-md transition-all text-[10px] font-semibold uppercase tracking-wider gap-0.5",
                      isLeast
                        ? "bg-rose-500/20 text-rose-400"
                        : "text-muted-foreground/40 hover:text-rose-400/60 hover:bg-rose-500/5"
                    )}
                    data-testid={`button-least-${step}-${idx}`}
                  >
                    <ChevronDown className="h-4 w-4" />
                    <span>Least</span>
                  </button>

                  <div className="flex-1 py-3 px-2 text-sm leading-snug select-none">
                    {stmt.text}
                  </div>

                  <button
                    onClick={() => toggleSelection(currentBlock.id, "most", idx)}
                    className={cn(
                      "shrink-0 flex flex-col items-center justify-center w-14 py-3 rounded-r-md transition-all text-[10px] font-semibold uppercase tracking-wider gap-0.5",
                      isMost
                        ? "bg-emerald-500/20 text-emerald-400"
                        : "text-muted-foreground/40 hover:text-emerald-400/60 hover:bg-emerald-500/5"
                    )}
                    data-testid={`button-most-${step}-${idx}`}
                  >
                    <Sparkles className="h-4 w-4" />
                    <span>Most</span>
                  </button>
                </div>
              );
            })}
          </div>

          {!canAdvance && (
            <p className="text-xs text-muted-foreground text-center">
              Pick one MOST and one LEAST to continue
            </p>
          )}

          <div className="flex items-center justify-between gap-3 pt-1">
            <Button
              variant="outline"
              onClick={handleBack}
              data-testid="button-quiz-back"
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Button>

            <Button
              onClick={handleNext}
              disabled={!canAdvance || submitMutation.isPending}
              data-testid="button-quiz-next"
            >
              {submitMutation.isPending ? (
                "Building DNA..."
              ) : isLastStep ? (
                <>
                  <Check className="h-4 w-4 mr-1" />
                  See My DNA
                </>
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

      <Dialog open={showProjectDetails} onOpenChange={setShowProjectDetails}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>About Persona DNA Quiz</DialogTitle>
            <DialogDescription>
              This quiz uses a Best-Worst Scaling method to estimate your personality profile across 8 dimensions. Each question shows 4 statements. You pick the one that describes you MOST and the one that describes you LEAST. This reduces bias and produces more accurate results than simple agree/disagree scales.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm text-muted-foreground">
            <div>
              <span className="font-medium text-foreground">8 Persona Traits:</span>
              <div className="grid grid-cols-2 gap-1 mt-1.5">
                {[
                  "Novelty Seeking", "Social Energy", "Structure & Planning", "Depth & Closeness",
                  "Creative Expression", "Competitive Drive", "Purpose & Mission", "Comfort w/ Uncertainty"
                ].map(t => (
                  <span key={t} className="text-xs">{t}</span>
                ))}
              </div>
            </div>
            <p className="text-xs">
              Your results power personalized club, event, and friend recommendations using ML-based matching.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
