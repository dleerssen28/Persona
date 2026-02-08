import { useLocation } from "wouter";
import { ArrowLeft, Quote, FlaskConical, Cpu, Binary, Gauge, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import personaDnaVisual from "@/assets/images/persona-dna-visual.png";

const RESEARCH_LINKS = [
  {
    traits: "Novelty / Adventure / Creativity",
    description: "Linked to Openness to Experience and Sensation Seeking, which predict preference for novel, exploratory, and creative activity environments",
    citations: [
      { label: "Barrick, Mount & Gupta, 2003", url: "https://www.sitesbysarah.com/mbwp/Pubs/2003_Barrick_Mount_Gupta.pdf" },
      { label: "Zuckerman, 1994", url: "https://psycnet.apa.org/record/1994-97132-000" },
    ],
  },
  {
    traits: "Social Energy / Cozy / Intensity",
    description: "Linked to Extraversion, which predicts preference for socially interactive, group-based, and people-oriented environments",
    citations: [
      { label: "Barrick, Mount & Gupta, 2003", url: "https://www.sitesbysarah.com/mbwp/Pubs/2003_Barrick_Mount_Gupta.pdf" },
      { label: "Lucas & Diener, 2001", url: "https://psycnet.apa.org/record/2001-06609-004" },
    ],
  },
  {
    traits: "Structure vs. Spontaneity / Strategy",
    description: "Linked to Conscientiousness (structured, rule-based preferences) versus Openness (flexibility, spontaneity, tolerance for ambiguity)",
    citations: [
      { label: "Barrick & Mount, 1991", url: "https://psycnet.apa.org/record/1991-30531-001" },
      { label: "McCrae & Costa, 1997", url: "https://psycnet.apa.org/record/1997-30004-004" },
    ],
  },
];

const CODE_SNIPPETS = [
  {
    title: "Embeddings & Representation",
    description: "We use a transformer-based model (MiniLM via @xenova/transformers) to encode user traits, club descriptions, and event details into dense vector representations. This allows Persona to compare users and opportunities based on semantic meaning rather than keywords.",
    code: `const embedding = model.encode(
  'International Cuisine Club: Discover spicy global food!'
);
// Result: Float32Array(384)`,
  },
  {
    title: "Similarity & Matching",
    description: "Persona uses cosine similarity to measure how well a user aligns with an event or club. Higher similarity scores indicate stronger predicted alignment between a student's personality and an opportunity's social and experiential energy.",
    code: `const similarity = cosineSimilarity(userVector, eventVector);
// 0.0 = no match, 1.0 = perfect match`,
  },
  {
    title: "Hybrid Scoring",
    description: "Final recommendations are generated using a hybrid scoring system that blends multiple signals, ensuring matches feel both accurate and intuitive.",
    code: `const finalScore =
  (0.55 * vectorSimilarity) +
  (0.25 * collaborativeFiltering) +
  (0.20 * traitExplanation);`,
  },
  {
    title: "Urgency Modeling",
    description: "Persona accounts for timing by prioritizing opportunities with upcoming meetings or deadlines.",
    code: `const hoursUntil = (eventDate - now) / 3600000;
const urgencyScore =
  hoursUntil < 24 ? 100 :
  hoursUntil < 48 ? 85 :
  hoursUntil < 72 ? 70 : // ...descending`,
  },
];

export default function AboutPage() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-8">
        <div className="flex items-center gap-3">
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setLocation("/")}
            data-testid="button-about-back"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-bold" data-testid="text-about-title">Persona</h1>
        </div>

        <Card data-testid="section-origin-story">
          <CardContent className="pt-6 space-y-4">
            <p className="text-sm text-muted-foreground leading-relaxed">
              When I first came to A&M, knowing it was one of the biggest Universities in the country, I thought finding friends, activities, and clubs to join were going to be easy with so many people and opportunities all around. However, I soon realized a few months into my freshmen year that school and having to manage my own life was feeling overwhelming and I had little energy left to go scourge for events to attend and socialize with strangers. Knowing how hard it is for students to balance their academic and personal lives, our team set out to find a meaningful solution to the problem. And Persona was born.
            </p>
            <div className="flex items-start gap-3 pl-4 border-l-2 border-primary/30">
              <Quote className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <p className="text-sm text-muted-foreground italic">
                Andy C, Persona Co-Founder
              </p>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="section-what-is-persona">
          <CardContent className="pt-6 space-y-5">
            <h2 className="text-lg font-semibold">What is Persona?</h2>

            <div className="pl-4 border-l-2 border-muted-foreground/20">
              <p className="text-sm text-muted-foreground leading-relaxed italic">
                "Everybody is a genius. But if you judge a fish by its ability to climb a tree, it will live its whole life believing that it is stupid."
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                -- Albert Einstein
              </p>
            </div>

            <p className="text-sm text-muted-foreground leading-relaxed">
              Our hobbies are the ultimate reflection of our psychology. There's a mountain of research, but more than that, personal experience from all of us at Persona that shows this. <span className="font-semibold text-foreground">It can't be stated with words how important it is to involve yourself in activities that reflect who you are as a person.</span>
            </p>

            <div>
              <h3 className="text-base font-semibold mb-3">
                So, what's the psychological reason behind finding a club, activity, or group of people that just <em>clicks</em>?
              </h3>
              <div className="space-y-3">
                {RESEARCH_LINKS.map((item) => (
                  <div
                    key={item.traits}
                    className="rounded-md border border-border/50 bg-muted/30 p-4"
                    data-testid={`research-${item.traits.split(" ")[0].toLowerCase()}`}
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <FlaskConical className="h-4 w-4 text-primary shrink-0" />
                      <h4 className="font-semibold text-sm">{item.traits}</h4>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {item.description}
                    </p>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
                      {item.citations.map((c) => (
                        <a
                          key={c.label}
                          href={c.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-primary hover:underline flex items-center gap-0.5"
                        >
                          {c.label}
                          <ChevronRight className="h-3 w-3" />
                        </a>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-border/50 pt-5 space-y-3">
              <h3 className="text-base font-semibold">
                Persona maps the most important aspects of your personality and helps you find exactly the clubs, events, and friends that will click for you
              </h3>

              <div className="rounded-md overflow-hidden border border-primary/20">
                <img
                  src={personaDnaVisual}
                  alt="Persona DNA visualization"
                  className="w-full h-auto"
                  data-testid="img-persona-dna-visual"
                />
                <div className="bg-primary/5 p-4">
                  <p className="text-sm font-semibold text-primary tracking-wide">Persona DNA</p>
                </div>
              </div>

              <p className="text-sm text-muted-foreground leading-relaxed">
                The first thing every user does when they join Persona is take a short, psychologically optimized test for the 8 most important aspects of a person's passion personality. The context and foundation of Persona is built on this map of every single user's preferences.
              </p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Persona leverages your DNA to match you with clubs, people, and events. Users get the chance to scroll through social networks that are perfectly personalized to their personality and connect with others who share the same psychologically.
              </p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Persona DNA is also evolving. Every like, skip, event joined, club meeting attended, and friend made changes your DNA.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="section-technicals">
          <CardContent className="pt-6 space-y-5">
            <div className="flex items-center gap-2">
              <Cpu className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold">The technicals</h2>
            </div>

            <p className="text-sm text-muted-foreground leading-relaxed">
              Persona is powered by a hybrid AI recommendation system that models students, clubs, and events in the same semantic space. Persona computes alignment using transformer embeddings, behavioral signals, and psychologically grounded traits.
            </p>

            <div className="space-y-4">
              {CODE_SNIPPETS.map((snippet) => (
                <div
                  key={snippet.title}
                  className="rounded-md border border-border/50 bg-muted/30 p-4 space-y-2"
                  data-testid={`code-${snippet.title.toLowerCase().replace(/[^a-z]/g, "-")}`}
                >
                  <div className="flex items-center gap-2">
                    <Binary className="h-4 w-4 text-primary shrink-0" />
                    <h4 className="font-semibold text-sm">{snippet.title}</h4>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">{snippet.description}</p>
                  <pre className="bg-zinc-950 dark:bg-black/50 text-emerald-400 text-xs p-3 rounded-md overflow-x-auto font-mono">
                    <code>{snippet.code}</code>
                  </pre>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card data-testid="section-whats-next">
          <CardContent className="pt-6 space-y-4">
            <div className="flex items-center gap-2">
              <Gauge className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold">What's Next</h2>
            </div>

            <p className="text-sm text-muted-foreground leading-relaxed">
              Persona is so exciting for us as a team because it really has the ability to make a positive impact on many, many students' lives and beyond. Today more than ever, young people make do with hundreds of shallow connections and very few meaningful, close friendships. Social media is designed to make breadth of interaction rather than depth. (<a href="https://www.sciencedirect.com/science/article/pii/S2451958822000513" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Scot et al</a>). All of us at Persona are so excited to keep working on a product that fights for the opposite.
            </p>

            <div className="flex items-start gap-3 pl-4 border-l-2 border-primary/30">
              <Quote className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <p className="text-sm text-muted-foreground italic">
                Signed the Persona team: Andy, Colin, Devon, and Garv.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
