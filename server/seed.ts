import { storage } from "./storage";
import { db, pool } from "./db";
import { users } from "@shared/models/auth";
import type { InsertItem, InsertHobby, InsertTasteProfile, InsertEvent } from "@shared/schema";
import type { UpsertUser } from "@shared/models/auth";
import { eq, sql } from "drizzle-orm";
import { items, hobbies, events } from "@shared/schema";
import { buildEmbeddingText, generateBatchEmbeddings, generateEmbedding, storeEmbedding, computeWeightedAverageEmbedding } from "./embeddings";

const SEED_USERS: { user: UpsertUser; profile: InsertTasteProfile }[] = [
  {
    user: { id: "seed-colin", email: "colin.weis@tamu.edu", firstName: "Colin", lastName: "Weis", profileImageUrl: null },
    profile: {
      userId: "seed-colin",
      traitNovelty: 0.45, traitIntensity: 0.85, traitCozy: 0.3,
      traitStrategy: 0.9, traitSocial: 0.55, traitCreativity: 0.4,
      traitNostalgia: 0.25, traitAdventure: 0.75,
      topClusters: ["Engineering Leader", "Competitive Athlete", "Strategy Gamer"],
      onboardingComplete: true,
    },
  },
  {
    user: { id: "seed-andy", email: "andy.chen@tamu.edu", firstName: "Andy", lastName: "Chen", profileImageUrl: null },
    profile: {
      userId: "seed-andy",
      traitNovelty: 0.8, traitIntensity: 0.5, traitCozy: 0.55,
      traitStrategy: 0.65, traitSocial: 0.7, traitCreativity: 0.85,
      traitNostalgia: 0.45, traitAdventure: 0.7,
      topClusters: ["Creative Builder", "Startup Founder", "Community Organizer"],
      onboardingComplete: true,
    },
  },
  {
    user: { id: "seed-devon", email: "devon.leerssen@tamu.edu", firstName: "Devon", lastName: "Leerssen", profileImageUrl: null },
    profile: {
      userId: "seed-devon",
      traitNovelty: 0.35, traitIntensity: 0.3, traitCozy: 0.85,
      traitStrategy: 0.4, traitSocial: 0.8, traitCreativity: 0.6,
      traitNostalgia: 0.75, traitAdventure: 0.3,
      topClusters: ["Service Leader", "Social Connector", "Campus Tradition Keeper"],
      onboardingComplete: true,
    },
  },
];

const GARV_PROFILE: Omit<InsertTasteProfile, "userId"> = {
  traitNovelty: 0.75, traitIntensity: 0.65, traitCozy: 0.4,
  traitStrategy: 0.7, traitSocial: 0.6, traitCreativity: 0.8,
  traitNostalgia: 0.35, traitAdventure: 0.85,
  topClusters: ["Tech Innovator", "Hackathon Builder", "Research Explorer", "Leadership Track"],
  onboardingComplete: true,
};

export { GARV_PROFILE };

const now = new Date();
function daysFromNow(days: number, hour: number = 18): Date {
  const d = new Date(now);
  d.setDate(d.getDate() + days);
  d.setHours(hour, 0, 0, 0);
  return d;
}

const TAMU_LAT = 30.6187;
const TAMU_LNG = -96.3365;

const SEED_ITEMS: InsertItem[] = [
  // === ACADEMIC (10 clubs) ===
  { domain: "academic", title: "IEEE @ TAMU", tags: ["career_alignment", "electrical_engineering", "circuits", "industry", "technical"], description: "Institute of Electrical and Electronics Engineers student branch. Hosts technical workshops on PCB design, embedded systems, and robotics. Industry speakers from Texas Instruments, NXP, and Lockheed Martin.", popularity: 420, traitNovelty: 0.6, traitIntensity: 0.5, traitCozy: 0.3, traitStrategy: 0.8, traitSocial: 0.5, traitCreativity: 0.6, traitNostalgia: 0.2, traitAdventure: 0.4 },
  { domain: "academic", title: "Aggie Coding Club", tags: ["career_alignment", "software", "competitive_programming", "skills", "tech"], description: "Weekly competitive programming practice, LeetCode sessions, and mock technical interviews. Open to all majors. Regularly sends teams to ICPC regionals.", popularity: 580, traitNovelty: 0.7, traitIntensity: 0.7, traitCozy: 0.2, traitStrategy: 0.9, traitSocial: 0.5, traitCreativity: 0.7, traitNostalgia: 0.1, traitAdventure: 0.5 },
  { domain: "academic", title: "TAMU Cybersecurity Club", tags: ["career_alignment", "cybersecurity", "CTF", "skills", "defense"], description: "Capture-the-flag competitions, penetration testing labs, and security research. Partners with CISA and NSA for scholarship pipelines. Weekly hands-on CTF practice.", popularity: 390, traitNovelty: 0.8, traitIntensity: 0.8, traitCozy: 0.1, traitStrategy: 0.9, traitSocial: 0.4, traitCreativity: 0.6, traitNostalgia: 0.1, traitAdventure: 0.7 },
  { domain: "academic", title: "Pre-Med Society", tags: ["career_alignment", "medicine", "MCAT", "vibe", "health"], description: "MCAT study groups, hospital volunteering coordination, and physician shadowing programs. Monthly guest lectures from TAMU Health faculty and practicing physicians.", popularity: 650, traitNovelty: 0.4, traitIntensity: 0.6, traitCozy: 0.4, traitStrategy: 0.7, traitSocial: 0.7, traitCreativity: 0.3, traitNostalgia: 0.3, traitAdventure: 0.4 },
  { domain: "academic", title: "Undergraduate Research Scholars", tags: ["career_alignment", "research", "thesis", "skills", "academic"], description: "Guided undergraduate research program with faculty mentors. Present at Student Research Week and publish in undergraduate journals. Thesis track available for honors.", popularity: 310, traitNovelty: 0.9, traitIntensity: 0.5, traitCozy: 0.3, traitStrategy: 0.7, traitSocial: 0.4, traitCreativity: 0.9, traitNostalgia: 0.2, traitAdventure: 0.6 },
  { domain: "academic", title: "TAMU AI/ML Club", tags: ["career_alignment", "machine_learning", "AI", "skills", "data_science"], description: "Hands-on machine learning projects, Kaggle competitions, and reading groups on latest papers. Members build real models using PyTorch and TensorFlow. Industry partnerships with Amazon and Google.", popularity: 480, traitNovelty: 0.9, traitIntensity: 0.6, traitCozy: 0.2, traitStrategy: 0.8, traitSocial: 0.5, traitCreativity: 0.8, traitNostalgia: 0.1, traitAdventure: 0.6 },
  { domain: "academic", title: "Mays Business Fellows", tags: ["career_alignment", "business", "finance", "leadership", "industry"], description: "Selective business leadership program within Mays Business School. Case competitions, corporate treks to NYC and Dallas, and executive mentoring from Fortune 500 alumni.", popularity: 280, traitNovelty: 0.5, traitIntensity: 0.6, traitCozy: 0.3, traitStrategy: 0.85, traitSocial: 0.7, traitCreativity: 0.5, traitNostalgia: 0.2, traitAdventure: 0.5 },
  { domain: "academic", title: "Society of Women Engineers", tags: ["career_alignment", "engineering", "diversity", "vibe", "mentorship"], description: "Professional development, mentorship, and community for women in engineering. Annual conference travel, resume workshops, and corporate networking nights with Shell, ExxonMobil, and Boeing.", popularity: 520, traitNovelty: 0.5, traitIntensity: 0.4, traitCozy: 0.5, traitStrategy: 0.6, traitSocial: 0.8, traitCreativity: 0.5, traitNostalgia: 0.3, traitAdventure: 0.4 },
  { domain: "academic", title: "Philosophy Discussion Group", tags: ["vibe", "humanities", "debate", "intellectual", "discussion"], description: "Weekly philosophical discussions on ethics, epistemology, and political philosophy. No philosophy major required. Book club meets monthly. Guest lectures from faculty.", popularity: 120, traitNovelty: 0.7, traitIntensity: 0.3, traitCozy: 0.6, traitStrategy: 0.5, traitSocial: 0.6, traitCreativity: 0.8, traitNostalgia: 0.5, traitAdventure: 0.3 },
  { domain: "academic", title: "TAMU Rocket Engineering", tags: ["career_alignment", "aerospace", "rocketry", "skills", "hands_on"], description: "Design, build, and launch high-powered rockets. Compete at NASA Student Launch and Spaceport America Cup. Machine shop access and mentorship from aerospace engineering faculty.", popularity: 350, traitNovelty: 0.85, traitIntensity: 0.7, traitCozy: 0.1, traitStrategy: 0.8, traitSocial: 0.5, traitCreativity: 0.9, traitNostalgia: 0.2, traitAdventure: 0.9 },

  // === PROFESSIONAL (10 clubs) ===
  { domain: "professional", title: "Aggie Consulting Group", tags: ["career_alignment", "consulting", "strategy", "industry", "case_prep"], description: "Pro-bono consulting for local businesses and nonprofits. Case interview prep workshops and alumni panels from McKinsey, BCG, and Deloitte. Selective application process.", popularity: 340, traitNovelty: 0.5, traitIntensity: 0.6, traitCozy: 0.2, traitStrategy: 0.95, traitSocial: 0.6, traitCreativity: 0.5, traitNostalgia: 0.1, traitAdventure: 0.4 },
  { domain: "professional", title: "TAMU Entrepreneurship Club", tags: ["career_alignment", "startups", "pitch", "skills", "innovation"], description: "Startup weekends, pitch competitions, and founder speaker series. Access to McFerrin Center resources, co-working space, and seed funding opportunities through TAMU ventures.", popularity: 420, traitNovelty: 0.9, traitIntensity: 0.7, traitCozy: 0.2, traitStrategy: 0.7, traitSocial: 0.7, traitCreativity: 0.9, traitNostalgia: 0.1, traitAdventure: 0.8 },
  { domain: "professional", title: "Finance & Investment Club", tags: ["career_alignment", "finance", "investing", "industry", "markets"], description: "Manage a real student investment fund. Bloomberg Terminal training, equity research presentations, and Wall Street trek. Pipeline to Goldman Sachs, JP Morgan, and Citadel.", popularity: 380, traitNovelty: 0.4, traitIntensity: 0.7, traitCozy: 0.2, traitStrategy: 0.9, traitSocial: 0.5, traitCreativity: 0.3, traitNostalgia: 0.2, traitAdventure: 0.4 },
  { domain: "professional", title: "National Society of Black Engineers", tags: ["career_alignment", "engineering", "diversity", "community", "professional"], description: "Professional development, academic support, and cultural community for Black engineers. National convention travel, corporate partnerships with Boeing, Raytheon, and Microsoft.", popularity: 460, traitNovelty: 0.5, traitIntensity: 0.5, traitCozy: 0.4, traitStrategy: 0.6, traitSocial: 0.85, traitCreativity: 0.5, traitNostalgia: 0.3, traitAdventure: 0.5 },
  { domain: "professional", title: "TAMU Product Management Club", tags: ["career_alignment", "product", "tech", "skills", "UX"], description: "Product thinking workshops, mock PM interviews, and real product sprints with local startups. Guest PMs from Google, Meta, and Stripe. Portfolio building program.", popularity: 290, traitNovelty: 0.7, traitIntensity: 0.5, traitCozy: 0.3, traitStrategy: 0.8, traitSocial: 0.6, traitCreativity: 0.8, traitNostalgia: 0.1, traitAdventure: 0.5 },
  { domain: "professional", title: "Women in Business", tags: ["career_alignment", "business", "diversity", "networking", "leadership"], description: "Empowering women in business through mentorship, networking, and professional development. Annual conference, corporate site visits, and leadership retreats.", popularity: 380, traitNovelty: 0.4, traitIntensity: 0.4, traitCozy: 0.5, traitStrategy: 0.6, traitSocial: 0.85, traitCreativity: 0.5, traitNostalgia: 0.3, traitAdventure: 0.4 },
  { domain: "professional", title: "Design & UX Society", tags: ["career_alignment", "design", "UX", "skills", "creative"], description: "UI/UX design workshops, portfolio reviews, and design sprints. Figma and Adobe Creative Suite workshops. Partnerships with IDEO, frog design, and IBM Design.", popularity: 250, traitNovelty: 0.7, traitIntensity: 0.4, traitCozy: 0.4, traitStrategy: 0.5, traitSocial: 0.6, traitCreativity: 0.95, traitNostalgia: 0.2, traitAdventure: 0.4 },
  { domain: "professional", title: "Supply Chain Management Association", tags: ["career_alignment", "supply_chain", "logistics", "industry", "operations"], description: "Supply chain case competitions, plant tours, and industry networking. Partnerships with Amazon Operations, FedEx, and Walmart. Career fair prep workshops.", popularity: 210, traitNovelty: 0.3, traitIntensity: 0.4, traitCozy: 0.3, traitStrategy: 0.8, traitSocial: 0.5, traitCreativity: 0.3, traitNostalgia: 0.2, traitAdventure: 0.3 },
  { domain: "professional", title: "Pre-Law Society", tags: ["career_alignment", "law", "debate", "LSAT", "vibe"], description: "LSAT prep groups, mock trial practice, and law school application workshops. Guest speakers from TAMU Law and top Texas firms. Courtroom visits and moot court competitions.", popularity: 280, traitNovelty: 0.4, traitIntensity: 0.5, traitCozy: 0.3, traitStrategy: 0.7, traitSocial: 0.6, traitCreativity: 0.5, traitNostalgia: 0.3, traitAdventure: 0.4 },
  { domain: "professional", title: "Data Science Club", tags: ["career_alignment", "data_science", "analytics", "skills", "python"], description: "Hands-on data projects, Kaggle competitions, and industry speaker series. Python, R, and SQL workshops. Partnerships with Capital One, USAA, and SpaceX analytics teams.", popularity: 360, traitNovelty: 0.7, traitIntensity: 0.5, traitCozy: 0.2, traitStrategy: 0.8, traitSocial: 0.5, traitCreativity: 0.7, traitNostalgia: 0.1, traitAdventure: 0.5 },

  // === SOCIAL (10 clubs) ===
  { domain: "social", title: "Aggie Film Society", tags: ["vibe", "movies", "cinema", "creative", "discussion"], description: "Weekly film screenings followed by discussions. Student film production workshops, short film festival each semester. Camera equipment available for members.", popularity: 180, traitNovelty: 0.6, traitIntensity: 0.3, traitCozy: 0.7, traitStrategy: 0.3, traitSocial: 0.7, traitCreativity: 0.9, traitNostalgia: 0.6, traitAdventure: 0.3 },
  { domain: "social", title: "Korean Student Association", tags: ["vibe", "culture", "korean", "community", "social"], description: "Korean culture through K-Pop dance, Korean cooking nights, and language exchange. Annual culture show is one of the biggest on campus. All backgrounds welcome.", popularity: 520, traitNovelty: 0.5, traitIntensity: 0.4, traitCozy: 0.6, traitStrategy: 0.2, traitSocial: 0.95, traitCreativity: 0.6, traitNostalgia: 0.5, traitAdventure: 0.4 },
  { domain: "social", title: "Aggie Gaming Association", tags: ["vibe", "gaming", "esports", "competitive", "social"], description: "Casual and competitive gaming community. Esports teams in League, Valorant, and Rocket League. LAN parties, tournaments, and gaming lounge access.", popularity: 680, traitNovelty: 0.4, traitIntensity: 0.6, traitCozy: 0.5, traitStrategy: 0.7, traitSocial: 0.8, traitCreativity: 0.3, traitNostalgia: 0.5, traitAdventure: 0.3 },
  { domain: "social", title: "Outdoor Adventures Club", tags: ["vibe", "hiking", "camping", "nature", "adventure"], description: "Weekend camping trips, hiking, kayaking, and rock climbing excursions. Gear rental available. Monthly campfire socials and photography contests.", popularity: 410, traitNovelty: 0.6, traitIntensity: 0.6, traitCozy: 0.3, traitStrategy: 0.3, traitSocial: 0.7, traitCreativity: 0.4, traitNostalgia: 0.4, traitAdventure: 0.95 },
  { domain: "social", title: "Aggie Cooking Club", tags: ["vibe", "cooking", "food", "social", "creative"], description: "Learn to cook everything from ramen to beef wellington. Themed cooking nights, potluck dinners, and guest chef demonstrations. Kitchen space provided.", popularity: 340, traitNovelty: 0.5, traitIntensity: 0.3, traitCozy: 0.85, traitStrategy: 0.3, traitSocial: 0.8, traitCreativity: 0.7, traitNostalgia: 0.6, traitAdventure: 0.4 },
  { domain: "social", title: "Board Game & D&D Guild", tags: ["vibe", "strategy", "tabletop", "social", "creative"], description: "Weekly board game nights and ongoing D&D campaigns. 200+ game library including Catan, Wingspan, and Gloomhaven. New player friendly with learn-to-play sessions.", popularity: 290, traitNovelty: 0.5, traitIntensity: 0.3, traitCozy: 0.7, traitStrategy: 0.8, traitSocial: 0.9, traitCreativity: 0.7, traitNostalgia: 0.6, traitAdventure: 0.3 },
  { domain: "social", title: "South Asian Student Association", tags: ["vibe", "culture", "south_asian", "community", "dance"], description: "Celebrating South Asian culture through Diwali, Holi, and Garba events. Bollywood dance team, cricket matches, and cultural showcases.", popularity: 480, traitNovelty: 0.5, traitIntensity: 0.5, traitCozy: 0.5, traitStrategy: 0.2, traitSocial: 0.9, traitCreativity: 0.6, traitNostalgia: 0.6, traitAdventure: 0.4 },
  { domain: "social", title: "Aggie Music Collective", tags: ["vibe", "music", "performance", "creative", "community"], description: "Open mic nights, jam sessions, and student band formation. Practice rooms available. Produce a semester-end concert at Rudder Auditorium.", popularity: 310, traitNovelty: 0.6, traitIntensity: 0.4, traitCozy: 0.5, traitStrategy: 0.3, traitSocial: 0.8, traitCreativity: 0.95, traitNostalgia: 0.5, traitAdventure: 0.4 },
  { domain: "social", title: "Photography Club", tags: ["vibe", "photography", "creative", "outdoor", "art"], description: "Photo walks around Bryan-College Station, studio sessions, and editing workshops. Monthly photo contests and end-of-year gallery exhibition.", popularity: 260, traitNovelty: 0.6, traitIntensity: 0.2, traitCozy: 0.5, traitStrategy: 0.3, traitSocial: 0.5, traitCreativity: 0.9, traitNostalgia: 0.5, traitAdventure: 0.5 },
  { domain: "social", title: "Aggie Dance Company", tags: ["vibe", "dance", "performance", "fitness", "creative"], description: "Hip hop, contemporary, K-Pop, and Latin dance teams. Weekly practices and semester showcase performances. No audition required for recreational track.", popularity: 450, traitNovelty: 0.5, traitIntensity: 0.6, traitCozy: 0.3, traitStrategy: 0.3, traitSocial: 0.85, traitCreativity: 0.8, traitNostalgia: 0.3, traitAdventure: 0.5 },

  // === SPORTS (10 clubs) ===
  { domain: "sports", title: "Club Soccer", tags: ["commitment", "soccer", "competitive", "fitness", "team"], description: "Competitive club soccer with tryouts each semester. Practice 3x/week, travel to regional tournaments. Men's and women's divisions.", popularity: 380, traitNovelty: 0.3, traitIntensity: 0.8, traitCozy: 0.1, traitStrategy: 0.6, traitSocial: 0.8, traitCreativity: 0.3, traitNostalgia: 0.4, traitAdventure: 0.6 },
  { domain: "sports", title: "Aggie Climbing Team", tags: ["commitment", "climbing", "bouldering", "fitness", "outdoor"], description: "Indoor bouldering and sport climbing. Weekly practices at the Rec Center climbing wall. Travel to outdoor crags and compete at collegiate climbing nationals.", popularity: 280, traitNovelty: 0.6, traitIntensity: 0.8, traitCozy: 0.1, traitStrategy: 0.6, traitSocial: 0.6, traitCreativity: 0.3, traitNostalgia: 0.1, traitAdventure: 0.95 },
  { domain: "sports", title: "Club Basketball", tags: ["commitment", "basketball", "competitive", "athletic", "team"], description: "Competitive club basketball with structured practices and games against other Texas universities. Open tryouts in August and January.", popularity: 420, traitNovelty: 0.3, traitIntensity: 0.85, traitCozy: 0.1, traitStrategy: 0.6, traitSocial: 0.7, traitCreativity: 0.2, traitNostalgia: 0.4, traitAdventure: 0.5 },
  { domain: "sports", title: "Aggie Running Club", tags: ["commitment", "running", "fitness", "endurance", "social"], description: "Group runs, 5K training programs, and marathon prep. All paces welcome from beginners to sub-3:00 marathoners. Social runs to local breweries.", popularity: 350, traitNovelty: 0.3, traitIntensity: 0.7, traitCozy: 0.2, traitStrategy: 0.3, traitSocial: 0.7, traitCreativity: 0.2, traitNostalgia: 0.3, traitAdventure: 0.6 },
  { domain: "sports", title: "Pickleball Club", tags: ["commitment", "pickleball", "social", "recreational", "fun"], description: "The fastest-growing sport on campus. Open play sessions, round-robin tournaments, and social mixers. Equipment provided for beginners.", popularity: 510, traitNovelty: 0.5, traitIntensity: 0.5, traitCozy: 0.3, traitStrategy: 0.5, traitSocial: 0.9, traitCreativity: 0.2, traitNostalgia: 0.3, traitAdventure: 0.4 },
  { domain: "sports", title: "Club Volleyball", tags: ["commitment", "volleyball", "competitive", "team", "athletic"], description: "Men's and women's club volleyball. Compete in NIRSA regional and national tournaments. Practice 2-3x/week at the Rec Center.", popularity: 340, traitNovelty: 0.3, traitIntensity: 0.7, traitCozy: 0.1, traitStrategy: 0.6, traitSocial: 0.8, traitCreativity: 0.2, traitNostalgia: 0.3, traitAdventure: 0.5 },
  { domain: "sports", title: "Aggie Martial Arts", tags: ["commitment", "martial_arts", "fitness", "discipline", "competitive"], description: "Brazilian Jiu-Jitsu, Muay Thai, and Taekwondo training. Belt progression system, compete at collegiate tournaments. Beginner-friendly.", popularity: 290, traitNovelty: 0.6, traitIntensity: 0.9, traitCozy: 0.05, traitStrategy: 0.7, traitSocial: 0.5, traitCreativity: 0.3, traitNostalgia: 0.2, traitAdventure: 0.7 },
  { domain: "sports", title: "Club Tennis", tags: ["commitment", "tennis", "competitive", "social", "fitness"], description: "Competitive and recreational club tennis. Ladder matches, inter-club tournaments, and social doubles nights. Court reservations included.", popularity: 310, traitNovelty: 0.3, traitIntensity: 0.6, traitCozy: 0.2, traitStrategy: 0.6, traitSocial: 0.7, traitCreativity: 0.2, traitNostalgia: 0.4, traitAdventure: 0.4 },
  { domain: "sports", title: "Ultimate Frisbee", tags: ["commitment", "frisbee", "social", "outdoor", "competitive"], description: "Spirit of the Game meets competition. Practice 3x/week, travel to sectionals and regionals. Co-ed and single-gender divisions available.", popularity: 260, traitNovelty: 0.5, traitIntensity: 0.6, traitCozy: 0.2, traitStrategy: 0.5, traitSocial: 0.85, traitCreativity: 0.3, traitNostalgia: 0.3, traitAdventure: 0.6 },
  { domain: "sports", title: "Aggie Swim & Dive Club", tags: ["commitment", "swimming", "fitness", "competitive", "water"], description: "Competitive swimming and diving for non-varsity athletes. Practice at the Student Rec Center pool. Compete at club nationals.", popularity: 190, traitNovelty: 0.3, traitIntensity: 0.7, traitCozy: 0.1, traitStrategy: 0.4, traitSocial: 0.5, traitCreativity: 0.2, traitNostalgia: 0.3, traitAdventure: 0.4 },

  // === VOLUNTEERING (10 clubs) ===
  { domain: "volunteering", title: "Aggie Habitat for Humanity", tags: ["commitment", "construction", "community", "hands_on", "service"], description: "Build homes for families in need in the Bryan-College Station area. No construction experience required. Spring Break build trips to other states.", popularity: 480, traitNovelty: 0.4, traitIntensity: 0.5, traitCozy: 0.3, traitStrategy: 0.4, traitSocial: 0.8, traitCreativity: 0.3, traitNostalgia: 0.4, traitAdventure: 0.6 },
  { domain: "volunteering", title: "Big Event", tags: ["commitment", "campus_tradition", "community_service", "teamwork", "Aggie"], description: "Largest one-day, student-run service project in the nation. Over 20,000 Aggies give back to the Brazos Valley community in a single day each spring.", popularity: 890, traitNovelty: 0.3, traitIntensity: 0.5, traitCozy: 0.4, traitStrategy: 0.4, traitSocial: 0.95, traitCreativity: 0.3, traitNostalgia: 0.8, traitAdventure: 0.4 },
  { domain: "volunteering", title: "Camp Kesem TAMU", tags: ["commitment", "children", "cancer_support", "leadership", "camp"], description: "Free summer camp for children affected by a parent's cancer. Year-round fundraising, training, and camp counselor preparation. Life-changing experience.", popularity: 340, traitNovelty: 0.5, traitIntensity: 0.4, traitCozy: 0.6, traitStrategy: 0.4, traitSocial: 0.9, traitCreativity: 0.6, traitNostalgia: 0.5, traitAdventure: 0.4 },
  { domain: "volunteering", title: "Aggie Tutoring", tags: ["commitment", "education", "mentorship", "skills", "academic"], description: "Free tutoring for K-12 students in Bryan-College Station schools. Tutors in math, science, reading, and test prep. Flexible scheduling around classes.", popularity: 380, traitNovelty: 0.3, traitIntensity: 0.3, traitCozy: 0.6, traitStrategy: 0.5, traitSocial: 0.7, traitCreativity: 0.4, traitNostalgia: 0.4, traitAdventure: 0.2 },
  { domain: "volunteering", title: "Engineers Without Borders", tags: ["commitment", "engineering", "international", "service", "sustainability"], description: "Design and implement sustainable engineering projects in developing communities. Travel teams to Guatemala and Kenya. Technical skills meet real-world impact.", popularity: 320, traitNovelty: 0.7, traitIntensity: 0.5, traitCozy: 0.2, traitStrategy: 0.7, traitSocial: 0.6, traitCreativity: 0.7, traitNostalgia: 0.2, traitAdventure: 0.9 },
  { domain: "volunteering", title: "Aggies for Animal Rescue", tags: ["commitment", "animals", "shelter", "community", "care"], description: "Volunteer at the Brazos Valley animal shelter. Foster programs, adoption events, and veterinary clinic assistance. Transport animals to forever homes.", popularity: 410, traitNovelty: 0.4, traitIntensity: 0.3, traitCozy: 0.7, traitStrategy: 0.3, traitSocial: 0.6, traitCreativity: 0.3, traitNostalgia: 0.5, traitAdventure: 0.3 },
  { domain: "volunteering", title: "Global Health Initiative", tags: ["commitment", "health", "international", "public_health", "service"], description: "Public health outreach in underserved communities locally and internationally. Health education campaigns, clinic volunteering, and global health conferences.", popularity: 280, traitNovelty: 0.6, traitIntensity: 0.4, traitCozy: 0.3, traitStrategy: 0.5, traitSocial: 0.7, traitCreativity: 0.4, traitNostalgia: 0.2, traitAdventure: 0.7 },
  { domain: "volunteering", title: "Food Recovery Network", tags: ["commitment", "sustainability", "food", "community", "environment"], description: "Recover surplus food from campus dining halls and local restaurants. Distribute to food banks and shelters. Fight food waste and food insecurity simultaneously.", popularity: 260, traitNovelty: 0.5, traitIntensity: 0.3, traitCozy: 0.4, traitStrategy: 0.5, traitSocial: 0.6, traitCreativity: 0.4, traitNostalgia: 0.3, traitAdventure: 0.3 },
  { domain: "volunteering", title: "Aggie THON", tags: ["commitment", "fundraising", "dance_marathon", "children", "Aggie"], description: "Year-round fundraising for Texas Children's Hospital through dance marathons. 24-hour dance marathon is the culminating event. Over $500K raised annually.", popularity: 560, traitNovelty: 0.4, traitIntensity: 0.6, traitCozy: 0.4, traitStrategy: 0.4, traitSocial: 0.95, traitCreativity: 0.5, traitNostalgia: 0.6, traitAdventure: 0.5 },
  { domain: "volunteering", title: "TAMU Sustainability Club", tags: ["commitment", "environment", "sustainability", "green", "advocacy"], description: "Campus sustainability initiatives, community garden maintenance, recycling drives, and environmental advocacy. Partner with TAMU Office of Sustainability.", popularity: 230, traitNovelty: 0.6, traitIntensity: 0.3, traitCozy: 0.4, traitStrategy: 0.5, traitSocial: 0.6, traitCreativity: 0.5, traitNostalgia: 0.3, traitAdventure: 0.4 },
];

const SEED_HOBBIES: InsertHobby[] = [
  { title: "Intramural Sports", tags: ["sports", "social", "competitive", "campus"], description: "Join intramural leagues in flag football, soccer, volleyball, and more. Great way to stay active and meet people.", starterLinks: [], traitNovelty: 0.3, traitIntensity: 0.6, traitCozy: 0.2, traitStrategy: 0.5, traitSocial: 0.9, traitCreativity: 0.2, traitNostalgia: 0.4, traitAdventure: 0.5 },
  { title: "Hackathon Building", tags: ["tech", "creative", "competitive", "coding"], description: "Build projects in 24-48 hours at hackathons. Learn new technologies, meet collaborators, and win prizes.", starterLinks: [], traitNovelty: 0.9, traitIntensity: 0.8, traitCozy: 0.1, traitStrategy: 0.7, traitSocial: 0.6, traitCreativity: 0.9, traitNostalgia: 0.1, traitAdventure: 0.7 },
  { title: "Campus Photography", tags: ["creative", "outdoor", "art", "campus"], description: "Capture campus life, Aggie traditions, and Bryan-College Station through your lens.", starterLinks: [], traitNovelty: 0.6, traitIntensity: 0.2, traitCozy: 0.5, traitStrategy: 0.3, traitSocial: 0.4, traitCreativity: 0.9, traitNostalgia: 0.5, traitAdventure: 0.5 },
  { title: "Study Group Leading", tags: ["academic", "social", "leadership", "teaching"], description: "Organize study groups for tough courses. Teach concepts to solidify your own understanding.", starterLinks: [], traitNovelty: 0.3, traitIntensity: 0.4, traitCozy: 0.5, traitStrategy: 0.6, traitSocial: 0.8, traitCreativity: 0.4, traitNostalgia: 0.3, traitAdventure: 0.2 },
  { title: "Disc Golf", tags: ["outdoor", "social", "recreational", "nature"], description: "Play the disc golf course at Veterans Park. Low-cost, social, and a great study break.", starterLinks: [], traitNovelty: 0.5, traitIntensity: 0.3, traitCozy: 0.4, traitStrategy: 0.4, traitSocial: 0.7, traitCreativity: 0.3, traitNostalgia: 0.4, traitAdventure: 0.5 },
  { title: "Cooking for Friends", tags: ["cooking", "social", "creative", "cozy"], description: "Host dinner parties and learn to cook for a crowd. Perfect excuse to try new recipes.", starterLinks: [], traitNovelty: 0.5, traitIntensity: 0.3, traitCozy: 0.8, traitStrategy: 0.3, traitSocial: 0.8, traitCreativity: 0.7, traitNostalgia: 0.5, traitAdventure: 0.4 },
  { title: "Thrift Shopping", tags: ["fashion", "social", "creative", "sustainable"], description: "Explore thrift stores in BCS for unique finds. Sustainable fashion on a college budget.", starterLinks: [], traitNovelty: 0.6, traitIntensity: 0.2, traitCozy: 0.5, traitStrategy: 0.3, traitSocial: 0.6, traitCreativity: 0.7, traitNostalgia: 0.6, traitAdventure: 0.4 },
  { title: "Weekend Camping", tags: ["outdoor", "adventure", "nature", "social"], description: "Camp at Lake Bryan, Somerville, or drive to Big Bend. Escape campus for a night under the stars.", starterLinks: [], traitNovelty: 0.5, traitIntensity: 0.5, traitCozy: 0.3, traitStrategy: 0.3, traitSocial: 0.6, traitCreativity: 0.3, traitNostalgia: 0.4, traitAdventure: 0.9 },
  { title: "Podcast Listening Club", tags: ["intellectual", "social", "discussion", "media"], description: "Listen to podcasts together and discuss. Topics from true crime to tech to philosophy.", starterLinks: [], traitNovelty: 0.5, traitIntensity: 0.2, traitCozy: 0.7, traitStrategy: 0.4, traitSocial: 0.6, traitCreativity: 0.5, traitNostalgia: 0.3, traitAdventure: 0.3 },
  { title: "Open Source Contributing", tags: ["tech", "coding", "community", "skills"], description: "Contribute to open source projects on GitHub. Build your portfolio while helping the community.", starterLinks: [], traitNovelty: 0.7, traitIntensity: 0.4, traitCozy: 0.3, traitStrategy: 0.6, traitSocial: 0.4, traitCreativity: 0.7, traitNostalgia: 0.1, traitAdventure: 0.5 },
  { title: "Coffee Shop Studying", tags: ["cozy", "academic", "social", "chill"], description: "Find the best study spots in BCS. Sweet Eugene's, Harvest, and 1541 are local favorites.", starterLinks: [], traitNovelty: 0.3, traitIntensity: 0.1, traitCozy: 0.9, traitStrategy: 0.4, traitSocial: 0.4, traitCreativity: 0.3, traitNostalgia: 0.5, traitAdventure: 0.2 },
  { title: "Night Biking", tags: ["fitness", "adventure", "outdoor", "nightlife"], description: "Bike around campus and BCS at night. The campus is beautiful and quiet after dark.", starterLinks: [], traitNovelty: 0.5, traitIntensity: 0.4, traitCozy: 0.2, traitStrategy: 0.2, traitSocial: 0.4, traitCreativity: 0.3, traitNostalgia: 0.3, traitAdventure: 0.7 },
  { title: "Aggie Football Tailgating", tags: ["sports", "social", "tradition", "Aggie"], description: "Set up before home games at Kyle Field. Grilling, yard games, and the 12th Man experience.", starterLinks: [], traitNovelty: 0.2, traitIntensity: 0.7, traitCozy: 0.4, traitStrategy: 0.2, traitSocial: 0.95, traitCreativity: 0.2, traitNostalgia: 0.9, traitAdventure: 0.4 },
  { title: "Board Game Nights", tags: ["strategy", "social", "indoor", "fun"], description: "Host game nights with Catan, Codenames, and Ticket to Ride. Perfect for meeting people in a low-pressure setting.", starterLinks: [], traitNovelty: 0.4, traitIntensity: 0.3, traitCozy: 0.7, traitStrategy: 0.8, traitSocial: 0.9, traitCreativity: 0.5, traitNostalgia: 0.6, traitAdventure: 0.2 },
  { title: "YouTube / Content Creation", tags: ["creative", "tech", "media", "social"], description: "Create content about campus life, study tips, or your interests. Build an audience while building skills.", starterLinks: [], traitNovelty: 0.7, traitIntensity: 0.4, traitCozy: 0.3, traitStrategy: 0.5, traitSocial: 0.6, traitCreativity: 0.9, traitNostalgia: 0.2, traitAdventure: 0.4 },
  { title: "Volunteering Locally", tags: ["service", "community", "social", "giving_back"], description: "Find drop-in volunteer opportunities at food banks, animal shelters, and community centers in BCS.", starterLinks: [], traitNovelty: 0.4, traitIntensity: 0.3, traitCozy: 0.5, traitStrategy: 0.3, traitSocial: 0.7, traitCreativity: 0.3, traitNostalgia: 0.4, traitAdventure: 0.3 },
];

const SEED_EVENTS: InsertEvent[] = [
  {
    title: "Aggie Coding Club - Fall Kickoff",
    description: "First meeting of the semester! Meet the officers, hear about upcoming competitions, and join a team for the semester project. Free pizza and drinks.",
    category: "organized",
    location: "Zachry Engineering Building",
    dateTime: daysFromNow(2, 18),
    imageUrl: "/event-club",
    tags: ["tech", "coding", "kickoff", "social"],
    clubName: "Aggie Coding Club",
    creatorName: "Aggie Coding Club",
    contactInfo: "codingclub@tamu.edu",
    attendeeCount: 85,
    locationLat: TAMU_LAT, locationLng: TAMU_LNG,
    locationDetails: "ZACH 350",
    cost: "free",
    signupDeadline: daysFromNow(1, 23),
    traitNovelty: 0.6, traitIntensity: 0.4, traitCozy: 0.4, traitStrategy: 0.7, traitSocial: 0.8, traitCreativity: 0.6, traitNostalgia: 0.2, traitAdventure: 0.4,
  },
  {
    title: "TAMU Cybersecurity CTF Night",
    description: "Capture the Flag competition for all skill levels. Prizes for top 3 teams. Bring your laptop and a competitive spirit. Snacks provided.",
    category: "organized",
    location: "Peterson Building",
    dateTime: daysFromNow(3, 19),
    imageUrl: "/event-hackathon",
    tags: ["cybersecurity", "CTF", "competition", "tech"],
    clubName: "TAMU Cybersecurity Club",
    creatorName: "TAMU Cybersecurity Club",
    contactInfo: "cybersec@tamu.edu",
    attendeeCount: 45,
    locationLat: TAMU_LAT, locationLng: TAMU_LNG,
    locationDetails: "PETR 200",
    cost: "free",
    traitNovelty: 0.8, traitIntensity: 0.7, traitCozy: 0.1, traitStrategy: 0.9, traitSocial: 0.5, traitCreativity: 0.6, traitNostalgia: 0.1, traitAdventure: 0.7,
  },
  {
    title: "Aggie Consulting - Case Workshop",
    description: "Practice case interviews with real consultants from McKinsey and BCG. Get feedback on your casing skills. Business casual dress code.",
    category: "organized",
    location: "Wehner Building",
    dateTime: daysFromNow(4, 17),
    imageUrl: "/event-club",
    tags: ["consulting", "career", "interview_prep", "professional"],
    clubName: "Aggie Consulting Group",
    creatorName: "Aggie Consulting Group",
    contactInfo: "consulting@tamu.edu",
    attendeeCount: 35,
    locationLat: TAMU_LAT, locationLng: TAMU_LNG,
    locationDetails: "WHNG 143",
    cost: "free",
    signupDeadline: daysFromNow(3, 17),
    rsvpLimit: 40,
    traitNovelty: 0.5, traitIntensity: 0.5, traitCozy: 0.3, traitStrategy: 0.9, traitSocial: 0.6, traitCreativity: 0.4, traitNostalgia: 0.1, traitAdventure: 0.3,
  },
  {
    title: "KSA Korean Cooking Night",
    description: "Learn to make authentic Korean bibimbap and kimchi jjigae! All ingredients provided. Vegetarian options available. Limited spots!",
    category: "custom",
    location: "Southside Commons Kitchen",
    dateTime: daysFromNow(5, 18),
    imageUrl: "/event-club",
    tags: ["korean", "cooking", "cultural", "social"],
    clubName: "Korean Student Association",
    creatorId: "seed-devon",
    creatorName: "Devon Leerssen",
    contactInfo: "ksa@tamu.edu",
    attendeeCount: 25,
    locationLat: TAMU_LAT, locationLng: TAMU_LNG,
    locationDetails: "Southside Commons, Kitchen Area",
    cost: "$5 for ingredients",
    rsvpLimit: 30,
    signupDeadline: daysFromNow(4, 18),
    traitNovelty: 0.5, traitIntensity: 0.3, traitCozy: 0.8, traitStrategy: 0.2, traitSocial: 0.9, traitCreativity: 0.6, traitNostalgia: 0.5, traitAdventure: 0.4,
  },
  {
    title: "AI/ML Club - Paper Reading: Attention Is All You Need",
    description: "Deep dive into the Transformer architecture paper. Bring questions and your understanding of linear algebra. Whiteboard walkthrough included.",
    category: "organized",
    location: "Bright Building",
    dateTime: daysFromNow(6, 17),
    imageUrl: "/event-club",
    tags: ["AI", "machine_learning", "research", "academic"],
    clubName: "TAMU AI/ML Club",
    creatorName: "TAMU AI/ML Club",
    contactInfo: "aiml@tamu.edu",
    attendeeCount: 30,
    locationLat: TAMU_LAT, locationLng: TAMU_LNG,
    locationDetails: "BRHT 121",
    cost: "free",
    traitNovelty: 0.9, traitIntensity: 0.5, traitCozy: 0.3, traitStrategy: 0.8, traitSocial: 0.5, traitCreativity: 0.7, traitNostalgia: 0.1, traitAdventure: 0.5,
  },
  {
    title: "Pickleball Open Play + Social",
    description: "Casual pickleball followed by hangout at Dixie Chicken. All skill levels welcome. Paddles and balls provided.",
    category: "custom",
    location: "Student Rec Center",
    dateTime: daysFromNow(1, 16),
    imageUrl: "/event-pickleball",
    tags: ["pickleball", "social", "fitness", "fun"],
    clubName: "Pickleball Club",
    creatorId: "seed-andy",
    creatorName: "Andy Chen",
    contactInfo: "pickleball@tamu.edu",
    attendeeCount: 20,
    locationLat: TAMU_LAT, locationLng: TAMU_LNG,
    locationDetails: "Rec Center Courts 5-6",
    cost: "free",
    traitNovelty: 0.4, traitIntensity: 0.5, traitCozy: 0.3, traitStrategy: 0.4, traitSocial: 0.9, traitCreativity: 0.2, traitNostalgia: 0.3, traitAdventure: 0.4,
  },
  {
    title: "Entrepreneurship Club - Pitch Night",
    description: "5 student teams pitch their startup ideas to a panel of local investors and alumni. Open to watch or pitch! Register to pitch by deadline.",
    category: "organized",
    location: "McFerrin Center for Entrepreneurship",
    dateTime: daysFromNow(7, 18),
    imageUrl: "/event-club",
    tags: ["startup", "pitch", "entrepreneurship", "innovation"],
    clubName: "TAMU Entrepreneurship Club",
    creatorName: "TAMU Entrepreneurship Club",
    contactInfo: "eclub@tamu.edu",
    attendeeCount: 60,
    locationLat: TAMU_LAT, locationLng: TAMU_LNG,
    locationDetails: "McFerrin Center, Main Hall",
    cost: "free",
    signupDeadline: daysFromNow(5, 23),
    rsvpLimit: 80,
    traitNovelty: 0.8, traitIntensity: 0.6, traitCozy: 0.2, traitStrategy: 0.7, traitSocial: 0.8, traitCreativity: 0.9, traitNostalgia: 0.1, traitAdventure: 0.7,
  },
  {
    title: "Outdoor Adventures - Lake Bryan Kayaking",
    description: "Kayaking trip to Lake Bryan! Equipment provided. Carpool from campus. Bring sunscreen and water. Beginners welcome.",
    category: "custom",
    location: "Lake Bryan",
    dateTime: daysFromNow(8, 10),
    imageUrl: "/event-club",
    tags: ["outdoor", "kayaking", "adventure", "nature"],
    clubName: "Outdoor Adventures Club",
    creatorId: "seed-andy",
    creatorName: "Andy Chen",
    contactInfo: "outdoors@tamu.edu",
    attendeeCount: 15,
    locationLat: 30.7148, locationLng: -96.4326,
    locationDetails: "Lake Bryan Marina, meet at main parking lot",
    cost: "$10 for equipment rental",
    rsvpLimit: 20,
    signupDeadline: daysFromNow(6, 23),
    traitNovelty: 0.6, traitIntensity: 0.6, traitCozy: 0.2, traitStrategy: 0.3, traitSocial: 0.7, traitCreativity: 0.3, traitNostalgia: 0.3, traitAdventure: 0.95,
  },
  {
    title: "Finance Club - Bloomberg Terminal Training",
    description: "Hands-on Bloomberg Terminal workshop. Learn equity screening, portfolio analysis, and fixed income tools. Mays students get priority.",
    category: "organized",
    location: "Wehner Building",
    dateTime: daysFromNow(9, 15),
    imageUrl: "/event-club",
    tags: ["finance", "investing", "career", "tools"],
    clubName: "Finance & Investment Club",
    creatorName: "Finance & Investment Club",
    contactInfo: "finance@tamu.edu",
    attendeeCount: 25,
    locationLat: TAMU_LAT, locationLng: TAMU_LNG,
    locationDetails: "WHNG Bloomberg Lab",
    cost: "free",
    rsvpLimit: 30,
    signupDeadline: daysFromNow(7, 23),
    traitNovelty: 0.4, traitIntensity: 0.5, traitCozy: 0.2, traitStrategy: 0.9, traitSocial: 0.4, traitCreativity: 0.3, traitNostalgia: 0.1, traitAdventure: 0.3,
  },
  {
    title: "Board Game & D&D - New Campaign Launch",
    description: "Starting a brand new D&D 5e campaign! Session zero to build characters. Also open board game tables for non-D&D folks. Snacks welcome.",
    category: "custom",
    location: "MSC Flagroom",
    dateTime: daysFromNow(2, 19),
    imageUrl: "/event-gamenight",
    tags: ["tabletop", "D&D", "social", "strategy"],
    clubName: "Board Game & D&D Guild",
    creatorId: "seed-colin",
    creatorName: "Colin Weis",
    contactInfo: "boardgames@tamu.edu",
    attendeeCount: 18,
    locationLat: TAMU_LAT, locationLng: TAMU_LNG,
    locationDetails: "MSC Room 2401",
    cost: "free",
    traitNovelty: 0.5, traitIntensity: 0.3, traitCozy: 0.7, traitStrategy: 0.8, traitSocial: 0.9, traitCreativity: 0.7, traitNostalgia: 0.6, traitAdventure: 0.4,
  },
  {
    title: "Big Event - Volunteer Training",
    description: "Mandatory training session for Big Event team leaders. Learn your site assignments, safety protocols, and team management tips.",
    category: "organized",
    location: "Rudder Theatre",
    dateTime: daysFromNow(10, 18),
    imageUrl: "/event-club",
    tags: ["volunteering", "training", "Big_Event", "leadership"],
    clubName: "Big Event",
    creatorName: "Big Event Committee",
    contactInfo: "bigevent@tamu.edu",
    attendeeCount: 200,
    locationLat: TAMU_LAT, locationLng: TAMU_LNG,
    locationDetails: "Rudder Theatre, all seats",
    cost: "free",
    signupDeadline: daysFromNow(9, 23),
    traitNovelty: 0.3, traitIntensity: 0.4, traitCozy: 0.4, traitStrategy: 0.5, traitSocial: 0.9, traitCreativity: 0.3, traitNostalgia: 0.7, traitAdventure: 0.3,
  },
  {
    title: "SWE Resume Review Night",
    description: "Get your resume reviewed by SWE officers and industry mentors from Shell and Boeing. Bring 2 printed copies. Walk-ins welcome.",
    category: "organized",
    location: "Zachry Engineering Building",
    dateTime: daysFromNow(3, 17),
    imageUrl: "/event-club",
    tags: ["career", "resume", "engineering", "professional"],
    clubName: "Society of Women Engineers",
    creatorName: "Society of Women Engineers",
    contactInfo: "swe@tamu.edu",
    attendeeCount: 40,
    locationLat: TAMU_LAT, locationLng: TAMU_LNG,
    locationDetails: "ZACH 244",
    cost: "free",
    traitNovelty: 0.3, traitIntensity: 0.3, traitCozy: 0.4, traitStrategy: 0.6, traitSocial: 0.7, traitCreativity: 0.3, traitNostalgia: 0.2, traitAdventure: 0.2,
  },
  {
    title: "Aggie THON Fundraiser Kickoff",
    description: "Kick off fundraising season for the 24-hour dance marathon benefiting Texas Children's Hospital. Learn about fundraising goals and team registration.",
    category: "organized",
    location: "Reed Arena",
    dateTime: daysFromNow(11, 18),
    imageUrl: "/event-club",
    tags: ["fundraising", "dance_marathon", "charity", "social"],
    clubName: "Aggie THON",
    creatorName: "Aggie THON Executive Board",
    contactInfo: "aggiethon@tamu.edu",
    attendeeCount: 150,
    locationLat: TAMU_LAT, locationLng: TAMU_LNG,
    locationDetails: "Reed Arena, Floor Level",
    cost: "free",
    duesDeadline: daysFromNow(20, 23),
    traitNovelty: 0.4, traitIntensity: 0.5, traitCozy: 0.4, traitStrategy: 0.4, traitSocial: 0.95, traitCreativity: 0.5, traitNostalgia: 0.6, traitAdventure: 0.4,
  },
  {
    title: "Rocket Engineering - Build Night",
    description: "Hands-on build session for the Spaceport America Cup rocket. Help with avionics, composites, or propulsion. Safety glasses required.",
    category: "organized",
    location: "Bright Building Workshop",
    dateTime: daysFromNow(4, 18),
    imageUrl: "/event-hackathon",
    tags: ["aerospace", "engineering", "hands_on", "rockets"],
    clubName: "TAMU Rocket Engineering",
    creatorName: "TAMU Rocket Engineering",
    contactInfo: "rockets@tamu.edu",
    attendeeCount: 22,
    locationLat: TAMU_LAT, locationLng: TAMU_LNG,
    locationDetails: "Bright Building, Room B104 Workshop",
    cost: "free",
    traitNovelty: 0.85, traitIntensity: 0.6, traitCozy: 0.1, traitStrategy: 0.8, traitSocial: 0.5, traitCreativity: 0.9, traitNostalgia: 0.1, traitAdventure: 0.8,
  },
  {
    title: "Club Soccer - Pickup Game",
    description: "Open pickup game at Penberthy Rec Fields. All skill levels. Bring shin guards and water. We'll divide teams on arrival.",
    category: "custom",
    location: "Penberthy Rec Sports Fields",
    dateTime: daysFromNow(1, 17),
    imageUrl: "/event-club",
    tags: ["soccer", "sports", "casual", "fitness"],
    clubName: "Club Soccer",
    creatorId: "seed-colin",
    creatorName: "Colin Weis",
    contactInfo: "soccer@tamu.edu",
    attendeeCount: 22,
    locationLat: TAMU_LAT, locationLng: TAMU_LNG,
    locationDetails: "Penberthy Fields, Field #3",
    cost: "free",
    traitNovelty: 0.3, traitIntensity: 0.7, traitCozy: 0.1, traitStrategy: 0.5, traitSocial: 0.8, traitCreativity: 0.2, traitNostalgia: 0.4, traitAdventure: 0.5,
  },
  {
    title: "Habitat for Humanity - Weekend Build",
    description: "Saturday build day for a family home in Bryan. No experience needed. Tools and training provided. Bring closed-toe shoes.",
    category: "organized",
    location: "Bryan, TX (Carpool from MSC)",
    dateTime: daysFromNow(6, 8),
    imageUrl: "/event-club",
    tags: ["volunteering", "construction", "community", "service"],
    clubName: "Aggie Habitat for Humanity",
    creatorName: "Aggie Habitat for Humanity",
    contactInfo: "habitat@tamu.edu",
    attendeeCount: 30,
    locationLat: 30.6744, locationLng: -96.3700,
    locationDetails: "Meet at MSC Circle at 7:30 AM for carpool",
    cost: "free",
    signupDeadline: daysFromNow(4, 23),
    rsvpLimit: 35,
    traitNovelty: 0.4, traitIntensity: 0.5, traitCozy: 0.3, traitStrategy: 0.3, traitSocial: 0.8, traitCreativity: 0.3, traitNostalgia: 0.4, traitAdventure: 0.5,
  },
];

async function seedEmbeddings() {
  const missingItemEmbeddings = await pool.query(
    "SELECT id, title, tags, description FROM items WHERE embedding IS NULL"
  );
  if (missingItemEmbeddings.rows.length > 0) {
    console.log(`Generating embeddings for ${missingItemEmbeddings.rows.length} items...`);
    const texts = missingItemEmbeddings.rows.map(row => buildEmbeddingText({
      title: row.title,
      tags: row.tags,
      description: row.description,
    }));
    const embeddings = await generateBatchEmbeddings(texts);
    for (let i = 0; i < missingItemEmbeddings.rows.length; i++) {
      await storeEmbedding("items", missingItemEmbeddings.rows[i].id, embeddings[i]);
    }
    console.log("Item embeddings complete.");
  }

  const missingHobbyEmbeddings = await pool.query(
    "SELECT id, title, tags, description FROM hobbies WHERE embedding IS NULL"
  );
  if (missingHobbyEmbeddings.rows.length > 0) {
    console.log(`Generating embeddings for ${missingHobbyEmbeddings.rows.length} hobbies...`);
    const texts = missingHobbyEmbeddings.rows.map(row => buildEmbeddingText({
      title: row.title,
      tags: row.tags,
      description: row.description,
    }));
    const embeddings = await generateBatchEmbeddings(texts);
    for (let i = 0; i < missingHobbyEmbeddings.rows.length; i++) {
      await storeEmbedding("hobbies", missingHobbyEmbeddings.rows[i].id, embeddings[i]);
    }
    console.log("Hobby embeddings complete.");
  }

  const missingEventEmbeddings = await pool.query(
    "SELECT id, title, tags, description FROM events WHERE embedding IS NULL"
  );
  if (missingEventEmbeddings.rows.length > 0) {
    console.log(`Generating embeddings for ${missingEventEmbeddings.rows.length} events...`);
    const texts = missingEventEmbeddings.rows.map(row => buildEmbeddingText({
      title: row.title,
      tags: row.tags,
      description: row.description,
    }));
    const embeddings = await generateBatchEmbeddings(texts);
    for (let i = 0; i < missingEventEmbeddings.rows.length; i++) {
      await storeEmbedding("events", missingEventEmbeddings.rows[i].id, embeddings[i]);
    }
    console.log("Event embeddings complete.");
  }

  const missingProfileEmbeddings = await pool.query(
    `SELECT tp.id, tp.user_id, u.first_name, u.last_name
     FROM taste_profiles tp
     JOIN users u ON tp.user_id = u.id
     WHERE tp.embedding IS NULL AND tp.onboarding_complete = true`
  );
  if (missingProfileEmbeddings.rows.length > 0) {
    console.log(`Generating embeddings for ${missingProfileEmbeddings.rows.length} seed user profiles...`);
    for (const row of missingProfileEmbeddings.rows) {
      const profileItems = await pool.query(
        `SELECT embedding FROM items WHERE embedding IS NOT NULL ORDER BY random() LIMIT 10`
      );
      if (profileItems.rows.length > 0) {
        const itemEmbeddings = profileItems.rows.map(r => {
          if (typeof r.embedding === "string") {
            return r.embedding.replace(/[\[\]]/g, "").split(",").map(Number);
          }
          return r.embedding;
        });
        const weights = itemEmbeddings.map(() => 1.0);
        const profileEmbedding = computeWeightedAverageEmbedding(itemEmbeddings, weights);
        await storeEmbedding("taste_profiles", row.id, profileEmbedding);
        console.log(`  Embedding for ${row.first_name} ${row.last_name}`);
      }
    }
    console.log("Profile embeddings complete.");
  }
}

export async function seedDatabase() {
  const [itemCountResult] = await db.select({ count: sql<number>`count(*)` }).from(items);
  const itemCount = Number(itemCountResult.count);

  if (itemCount < SEED_ITEMS.length) {
    if (itemCount > 0) {
      await db.delete(items);
      console.log("Cleared old items for re-seed...");
    }
    console.log("Seeding database with clubs...");
    for (const item of SEED_ITEMS) {
      await storage.createItem(item);
    }
    console.log(`Seeded ${SEED_ITEMS.length} clubs.`);
  }

  const [hobbyCountResult] = await db.select({ count: sql<number>`count(*)` }).from(hobbies);
  const hobbyCount = Number(hobbyCountResult.count);

  if (hobbyCount < SEED_HOBBIES.length) {
    if (hobbyCount > 0) {
      await db.delete(hobbies);
      console.log("Cleared old hobbies for re-seed...");
    }
    console.log("Seeding hobbies...");
    for (const hobby of SEED_HOBBIES) {
      await storage.createHobby(hobby);
    }
    console.log(`Seeded ${SEED_HOBBIES.length} hobbies.`);
  }

  const [seedUserCheck] = await db.select().from(users).where(eq(users.id, "seed-colin"));
  if (!seedUserCheck) {
    console.log("Seeding campus user profiles...");
    for (const { user, profile } of SEED_USERS) {
      await db.insert(users).values(user);
      await storage.upsertTasteProfile(profile);
      console.log(`  Created user: ${user.firstName} ${user.lastName}`);
    }
    console.log("Seed users complete.");
  }

  const eventCount = await storage.getEventCount();
  if (eventCount < SEED_EVENTS.length) {
    if (eventCount > 0) {
      await db.delete(events);
      console.log("Cleared old events for re-seed...");
    }
    console.log("Seeding events...");
    for (const event of SEED_EVENTS) {
      await storage.createEvent(event);
    }
    console.log(`Seeded ${SEED_EVENTS.length} events.`);
  }

  try {
    await seedEmbeddings();
  } catch (error) {
    console.error("Error generating embeddings (non-fatal):", error);
  }

  const missingItems = await pool.query("SELECT COUNT(*) as count FROM items WHERE embedding IS NULL");
  const missingEvents = await pool.query("SELECT COUNT(*) as count FROM events WHERE embedding IS NULL");
  const missingHobbies = await pool.query("SELECT COUNT(*) as count FROM hobbies WHERE embedding IS NULL");
  const mi = parseInt(missingItems.rows[0].count);
  const me = parseInt(missingEvents.rows[0].count);
  const mh = parseInt(missingHobbies.rows[0].count);
  if (mi > 0 || me > 0 || mh > 0) {
    console.warn(`[EMBEDDING WARNING] Missing embeddings: ${mi} items, ${me} events, ${mh} hobbies. Scoring will use trait_fallback mode. Run POST /api/admin/backfill-embeddings to fix.`);
  } else {
    console.log("[EMBEDDING OK] All clubs, events, and hobbies have embeddings. ML-first scoring active.");
  }
}
