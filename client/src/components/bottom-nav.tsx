import { useLocation, Link } from "wouter";
import { User, BarChart3, Users } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { title: "My DNA", href: "/", icon: User },
  { title: "For You", href: "/recommendations", icon: BarChart3 },
  { title: "Friends", href: "/social", icon: Users },
];

export function BottomNav() {
  const [location] = useLocation();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border/50 bg-background/95 backdrop-blur-xl safe-area-bottom" data-testid="bottom-nav">
      <div className="flex items-stretch justify-around max-w-lg mx-auto">
        {navItems.map((item) => {
          const isActive = location === item.href;
          return (
            <Link key={item.href} href={item.href}>
              <button
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 py-2 px-3 min-w-[64px] transition-colors",
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground"
                )}
                data-testid={`nav-${item.title.toLowerCase().replace(/\s/g, "-")}`}
              >
                <item.icon className={cn("h-5 w-5", isActive && "text-primary")} />
                <span className={cn("text-[10px] font-medium", isActive && "text-primary")}>{item.title}</span>
              </button>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
