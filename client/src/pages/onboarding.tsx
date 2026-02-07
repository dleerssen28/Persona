import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { Sparkles, ArrowRight, ArrowLeft, Check } from "lucide-react";

interface QuizQuestion {
  id: string;
  question: string;
  trait: string;
  options: { label: string; value: number }[];
}

const QUIZ_QUESTIONS: QuizQuestion[] = [
  {
    id: "q1",
    question: "It's Friday night. You'd rather...",
    trait: "social",
    options: [
      { label: "Stay in with a good book or game", value: 0.2 },
      { label: "Hang with a couple close friends", value: 0.5 },
      { label: "Hit up a party or big group hangout", value: 0.85 },
    ],
  },
  {
    id: "q2",
    question: "When trying a new restaurant, you go for...",
    trait: "novelty",
    options: [
      { label: "My usual go-to order every time", value: 0.15 },
      { label: "Something I've heard is good", value: 0.5 },
      { label: "The weirdest thing on the menu", value: 0.9 },
    ],
  },
  {
    id: "q3",
    question: "Your ideal vacation involves...",
    trait: "adventure",
    options: [
      { label: "A cozy cabin, no plans", value: 0.15 },
      { label: "Exploring a new city at my own pace", value: 0.55 },
      { label: "Skydiving, scuba diving, the works", value: 0.9 },
    ],
  },
  {
    id: "q4",
    question: "In games or puzzles, you enjoy...",
    trait: "strategy",
    options: [
      { label: "Just vibing, no pressure", value: 0.15 },
      { label: "A good challenge that makes me think", value: 0.6 },
      { label: "Min-maxing and optimizing everything", value: 0.9 },
    ],
  },
  {
    id: "q5",
    question: "Your creative side comes out when...",
    trait: "creativity",
    options: [
      { label: "I appreciate others' creativity more", value: 0.2 },
      { label: "I dabble in creative hobbies sometimes", value: 0.55 },
      { label: "I'm always making, designing, or building", value: 0.9 },
    ],
  },
  {
    id: "q6",
    question: "When it comes to thrills and intensity...",
    trait: "intensity",
    options: [
      { label: "I like things calm and peaceful", value: 0.15 },
      { label: "A moderate dose of excitement is great", value: 0.5 },
      { label: "I live for the adrenaline rush", value: 0.9 },
    ],
  },
  {
    id: "q7",
    question: "Rainy Sunday afternoon \u2014 you reach for...",
    trait: "cozy",
    options: [
      { label: "Something active to get energy out", value: 0.15 },
      { label: "A movie or podcast, casual chill", value: 0.55 },
      { label: "Blankets, tea, comfort everything", value: 0.9 },
    ],
  },
  {
    id: "q8",
    question: "You feel most connected to...",
    trait: "nostalgia",
    options: [
      { label: "What's new and next, always forward", value: 0.15 },
      { label: "A mix of old favorites and new finds", value: 0.5 },
      { label: "The classics, throwbacks, childhood memories", value: 0.9 },
    ],
  },
];

interface OnboardingProps {
  onComplete: () => void;
}

export default function OnboardingPage({ onComplete }: OnboardingProps) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
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
      onComplete();
    },
    onError: (err) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const currentQ = QUIZ_QUESTIONS[step];
  const totalSteps = QUIZ_QUESTIONS.length;
  const selectedValue = currentQ ? answers[currentQ.trait] : undefined;
  const isLastStep = step === totalSteps - 1;
  const allAnswered = Object.keys(answers).length === totalSteps;

  function selectAnswer(trait: string, value: number) {
    setAnswers((prev) => ({ ...prev, [trait]: value }));
  }

  function handleNext() {
    if (isLastStep && allAnswered) {
      submitMutation.mutate(answers);
    } else if (selectedValue !== undefined) {
      setStep((s) => Math.min(s + 1, totalSteps - 1));
    }
  }

  function handleBack() {
    setStep((s) => Math.max(s - 1, 0));
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="flex items-center gap-2 px-4 py-3 border-b border-border/50">
        <div className="h-7 w-7 rounded-md bg-primary flex items-center justify-center">
          <Sparkles className="h-3.5 w-3.5 text-primary-foreground" />
        </div>
        <span className="font-semibold text-base tracking-tight">Persona</span>
      </header>

      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-lg space-y-6">
          <div className="text-center space-y-2">
            <Badge variant="secondary" className="text-xs">
              {step + 1} of {totalSteps}
            </Badge>
            <h1 className="text-xl font-bold tracking-tight" data-testid="text-quiz-title">Quick Taste Quiz</h1>
            <p className="text-sm text-muted-foreground">
              Answer 8 quick questions to build your Taste DNA
            </p>
          </div>

          <div className="w-full h-1.5 bg-muted rounded-md overflow-hidden">
            <div
              className="h-full bg-primary rounded-md transition-all duration-500 ease-out"
              style={{ width: `${((step + 1) / totalSteps) * 100}%` }}
              data-testid="progress-quiz"
            />
          </div>

          <Card className="p-6 space-y-5">
            <h2 className="text-lg font-semibold leading-snug" data-testid="text-quiz-question">
              {currentQ.question}
            </h2>

            <div className="space-y-2">
              {currentQ.options.map((opt, i) => {
                const isSelected = selectedValue === opt.value;
                return (
                  <button
                    key={i}
                    onClick={() => selectAnswer(currentQ.trait, opt.value)}
                    className={cn(
                      "w-full text-left p-3 rounded-md border transition-colors text-sm",
                      isSelected
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border hover-elevate"
                    )}
                    data-testid={`quiz-option-${i}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "h-4 w-4 rounded-full border-2 flex items-center justify-center shrink-0",
                        isSelected ? "border-primary" : "border-muted-foreground/40"
                      )}>
                        {isSelected && <div className="h-2 w-2 rounded-full bg-primary" />}
                      </div>
                      <span>{opt.label}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </Card>

          <div className="flex items-center justify-between gap-3">
            <Button
              variant="outline"
              onClick={handleBack}
              disabled={step === 0}
              data-testid="button-quiz-back"
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Button>

            <Button
              onClick={handleNext}
              disabled={selectedValue === undefined || submitMutation.isPending}
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
    </div>
  );
}
