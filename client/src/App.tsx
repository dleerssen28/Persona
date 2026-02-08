import { Switch, Route, useLocation, Link } from "wouter";
import { queryClient, apiRequest } from "./lib/queryClient";
import { QueryClientProvider, useQuery, useMutation } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { useAuth } from "@/hooks/use-auth";
import { BottomNav } from "@/components/bottom-nav";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { TasteProfile } from "@shared/schema";
import { Sparkles, Info, RotateCcw, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";

import LandingPage from "@/pages/landing";
import OnboardingPage from "@/pages/onboarding";
import ProfilePage from "@/pages/profile";
import RecommendationsPage from "@/pages/recommendations";
import SocialPage from "@/pages/social";
import EventsPage from "@/pages/events";
import ExplorePage from "@/pages/explore";
import AboutPage from "@/pages/about";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={ProfilePage} />
      <Route path="/profile/:userId" component={ProfilePage} />
      <Route path="/recommendations" component={RecommendationsPage} />
      <Route path="/explore" component={ExplorePage} />
      <Route path="/events" component={EventsPage} />
      <Route path="/social" component={SocialPage} />
      <Route path="/about" component={AboutPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AuthenticatedApp() {
  const [location, setLocation] = useLocation();
  const isProfilePage = location === "/" || location.startsWith("/profile/");
  const isExplorePage = location === "/explore";
  const { logout } = useAuth();
  const { data: profile, isLoading: profileLoading } = useQuery<TasteProfile | null>({
    queryKey: ["/api/taste-profile"],
  });

  const resetOnboarding = useMutation({
    mutationFn: () => apiRequest("POST", "/api/onboarding/reset"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/taste-profile"] });
    },
  });

  if (profileLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="space-y-4 text-center">
          <Skeleton className="h-12 w-12 mx-auto rounded-md" />
          <Skeleton className="h-4 w-32 mx-auto" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!profile?.onboardingComplete) {
    return (
      <OnboardingPage
        onComplete={() => {
          queryClient.invalidateQueries({ queryKey: ["/api/taste-profile"] });
          queryClient.invalidateQueries({ queryKey: ["/api/recommendations"] });
          queryClient.invalidateQueries({ queryKey: ["/api/explore/hobbies"] });
          queryClient.invalidateQueries({ queryKey: ["/api/social/matches"] });
          queryClient.invalidateQueries({ queryKey: ["/api/events/for-you"] });
        }}
      />
    );
  }

  return (
    <div className={`min-h-screen flex flex-col ${isProfilePage ? "" : "bg-background"}`}>
      <header className={`flex items-center justify-between gap-4 px-4 py-2 border-b border-border/50 h-14 shrink-0 sticky top-0 z-40 ${isProfilePage ? "bg-black/30 backdrop-blur-xl border-white/10" : "bg-background/80 backdrop-blur-xl"}`}>
        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-2 cursor-pointer outline-none" data-testid="button-persona-menu">
            <div className="h-7 w-7 rounded-md bg-primary flex items-center justify-center">
              <Sparkles className="h-3.5 w-3.5 text-primary-foreground" />
            </div>
            <span className={`font-semibold text-base tracking-tight ${isProfilePage ? "text-white" : ""}`}>Persona</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            <DropdownMenuItem
              onClick={() => setLocation("/about")}
              data-testid="menu-item-about"
            >
              <Info className="h-4 w-4 mr-2" />
              About Persona
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => resetOnboarding.mutate()}
              disabled={resetOnboarding.isPending}
              data-testid="menu-item-retake-quiz"
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Retake Quiz
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => logout()}
              data-testid="menu-item-logout"
            >
              <LogOut className="h-4 w-4 mr-2" />
              Log Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <ThemeToggle />
      </header>
      <main className={cn("flex-1", isExplorePage ? "pb-14 overflow-hidden" : "pb-20")}>
        <Router />
      </main>
      <BottomNav />
    </div>
  );
}

function AppContent() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="space-y-4 text-center">
          <Skeleton className="h-12 w-12 mx-auto rounded-md" />
          <Skeleton className="h-4 w-32 mx-auto" />
        </div>
      </div>
    );
  }

  if (!user) {
    return <LandingPage />;
  }

  return <AuthenticatedApp />;
}

function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <AppContent />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
