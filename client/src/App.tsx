import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { useAuth } from "@/hooks/use-auth";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import type { TasteProfile } from "@shared/schema";
import { useState, useEffect, useRef } from "react";

import LandingPage from "@/pages/landing";
import ProfilePage from "@/pages/profile";
import RecommendationsPage from "@/pages/recommendations";
import SocialPage from "@/pages/social";
import ExplorePage from "@/pages/explore";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={ProfilePage} />
      <Route path="/recommendations" component={RecommendationsPage} />
      <Route path="/social" component={SocialPage} />
      <Route path="/explore" component={ExplorePage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AuthenticatedApp() {
  const { data: profile, isLoading: profileLoading } = useQuery<TasteProfile | null>({
    queryKey: ["/api/taste-profile"],
  });
  const [bootstrapping, setBootstrapping] = useState(false);
  const bootstrapAttempted = useRef(false);

  useEffect(() => {
    if (!profileLoading && !profile?.onboardingComplete && !bootstrapAttempted.current) {
      bootstrapAttempted.current = true;
      setBootstrapping(true);
      fetch("/api/demo/bootstrap", { method: "POST", credentials: "include" })
        .then((r) => r.json())
        .then(() => {
          queryClient.invalidateQueries({ queryKey: ["/api/taste-profile"] });
          setBootstrapping(false);
        })
        .catch(() => setBootstrapping(false));
    }
  }, [profileLoading, profile]);

  if (profileLoading || bootstrapping) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="space-y-4 text-center">
          <Skeleton className="h-12 w-12 mx-auto rounded-md" />
          <Skeleton className="h-4 w-32 mx-auto" />
          <p className="text-sm text-muted-foreground">Building your Taste DNA...</p>
        </div>
      </div>
    );
  }

  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar />
        <div className="flex flex-col flex-1 min-w-0">
          <header className="flex items-center justify-between gap-4 px-4 py-2 border-b border-border/50 h-14 shrink-0 sticky top-0 z-40 bg-background/80 backdrop-blur-xl">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
            <ThemeToggle />
          </header>
          <main className="flex-1 overflow-y-auto">
            <Router />
          </main>
        </div>
      </div>
    </SidebarProvider>
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
