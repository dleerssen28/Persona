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
  { domain: "academic", title: "IEEE @ TAMU", tags: ["career_alignment", "electrical_engineering", "circuits", "industry", "technical"], description: "Institute of Electrical and Electronics Engineers student branch. Hosts technical workshops on PCB design, embedded systems, and robotics. Industry speakers from Texas Instruments, NXP, and Lockheed Martin.", popularity: 420, traitNovelty: 0.6, traitIntensity: 0.5, traitCozy: 0.3, traitStrategy: 0.8, traitSocial: 0.5, traitCreativity: 0.6, traitNostalgia: 0.2, traitAdventure: 0.4, nextMeetingAt: daysFromNow(2, 18), meetingLocation: "ZACH 350", meetingDay: "Wednesdays", meetingTime: "6:00 PM", signupUrl: "https://stuact.tamu.edu/app/organization/ieee-tamu", instagramUrl: "https://instagram.com/ieeetamu", dues: "$25/semester", duesDeadline: daysFromNow(14, 23) },
  { domain: "academic", title: "Aggie Coding Club", tags: ["career_alignment", "software", "competitive_programming", "skills", "tech"], description: "Weekly competitive programming practice, LeetCode sessions, and mock technical interviews. Open to all majors. Regularly sends teams to ICPC regionals.", popularity: 580, traitNovelty: 0.7, traitIntensity: 0.7, traitCozy: 0.2, traitStrategy: 0.9, traitSocial: 0.5, traitCreativity: 0.7, traitNostalgia: 0.1, traitAdventure: 0.5, nextMeetingAt: daysFromNow(1, 19), meetingLocation: "HRBB 124", meetingDay: "Tuesdays", meetingTime: "7:00 PM", signupUrl: "https://stuact.tamu.edu/app/organization/aggie-coding-club", instagramUrl: "https://instagram.com/aggiecodingclub", dues: "Free", duesDeadline: null },
  { domain: "academic", title: "TAMU Cybersecurity Club", tags: ["career_alignment", "cybersecurity", "CTF", "skills", "defense"], description: "Capture-the-flag competitions, penetration testing labs, and security research. Partners with CISA and NSA for scholarship pipelines. Weekly hands-on CTF practice.", popularity: 390, traitNovelty: 0.8, traitIntensity: 0.8, traitCozy: 0.1, traitStrategy: 0.9, traitSocial: 0.4, traitCreativity: 0.6, traitNostalgia: 0.1, traitAdventure: 0.7, nextMeetingAt: daysFromNow(4, 18), meetingLocation: "PETR 113", meetingDay: "Thursdays", meetingTime: "6:00 PM", signupUrl: "https://stuact.tamu.edu/app/organization/tamu-cybersecurity", instagramUrl: "https://instagram.com/tamucyber", dues: "$20/semester", duesDeadline: daysFromNow(21, 23) },
  { domain: "academic", title: "Pre-Med Society", tags: ["career_alignment", "medicine", "MCAT", "vibe", "health"], description: "MCAT study groups, hospital volunteering coordination, and physician shadowing programs. Monthly guest lectures from TAMU Health faculty and practicing physicians.", popularity: 650, traitNovelty: 0.4, traitIntensity: 0.6, traitCozy: 0.4, traitStrategy: 0.7, traitSocial: 0.7, traitCreativity: 0.3, traitNostalgia: 0.3, traitAdventure: 0.4, nextMeetingAt: daysFromNow(3, 17), meetingLocation: "MSC 2401", meetingDay: "Mondays", meetingTime: "5:00 PM", signupUrl: "https://stuact.tamu.edu/app/organization/pre-med-society", instagramUrl: "https://instagram.com/tamupremed", dues: "$30/semester", duesDeadline: daysFromNow(10, 23) },
  { domain: "academic", title: "Undergraduate Research Scholars", tags: ["career_alignment", "research", "thesis", "skills", "academic"], description: "Guided undergraduate research program with faculty mentors. Present at Student Research Week and publish in undergraduate journals. Thesis track available for honors.", popularity: 310, traitNovelty: 0.9, traitIntensity: 0.5, traitCozy: 0.3, traitStrategy: 0.7, traitSocial: 0.4, traitCreativity: 0.9, traitNostalgia: 0.2, traitAdventure: 0.6, nextMeetingAt: daysFromNow(5, 16), meetingLocation: "ILCB 220", meetingDay: "Fridays", meetingTime: "4:00 PM", signupUrl: "https://stuact.tamu.edu/app/organization/undergraduate-research-scholars", instagramUrl: "https://instagram.com/tamuresearchscholars", dues: "Free", duesDeadline: null },
  { domain: "academic", title: "TAMU AI/ML Club", tags: ["career_alignment", "machine_learning", "AI", "skills", "data_science"], description: "Hands-on machine learning projects, Kaggle competitions, and reading groups on latest papers. Members build real models using PyTorch and TensorFlow. Industry partnerships with Amazon and Google.", popularity: 480, traitNovelty: 0.9, traitIntensity: 0.6, traitCozy: 0.2, traitStrategy: 0.8, traitSocial: 0.5, traitCreativity: 0.8, traitNostalgia: 0.1, traitAdventure: 0.6, nextMeetingAt: daysFromNow(2, 19), meetingLocation: "ETB 235", meetingDay: "Wednesdays", meetingTime: "7:00 PM", signupUrl: "https://stuact.tamu.edu/app/organization/tamu-aiml-club", instagramUrl: "https://instagram.com/tamuaiml", dues: "$15/semester", duesDeadline: daysFromNow(18, 23) },
  { domain: "academic", title: "Mays Business Fellows", tags: ["career_alignment", "business", "finance", "leadership", "industry"], description: "Selective business leadership program within Mays Business School. Case competitions, corporate treks to NYC and Dallas, and executive mentoring from Fortune 500 alumni.", popularity: 280, traitNovelty: 0.5, traitIntensity: 0.6, traitCozy: 0.3, traitStrategy: 0.85, traitSocial: 0.7, traitCreativity: 0.5, traitNostalgia: 0.2, traitAdventure: 0.5, nextMeetingAt: daysFromNow(1, 18), meetingLocation: "WCBA 101", meetingDay: "Tuesdays", meetingTime: "6:00 PM", signupUrl: "https://stuact.tamu.edu/app/organization/mays-business-fellows", instagramUrl: "https://instagram.com/maysbusinessfellows", dues: "$75/year", duesDeadline: daysFromNow(28, 23) },
  { domain: "academic", title: "Society of Women Engineers", tags: ["career_alignment", "engineering", "diversity", "vibe", "mentorship"], description: "Professional development, mentorship, and community for women in engineering. Annual conference travel, resume workshops, and corporate networking nights with Shell, ExxonMobil, and Boeing.", popularity: 520, traitNovelty: 0.5, traitIntensity: 0.4, traitCozy: 0.5, traitStrategy: 0.6, traitSocial: 0.8, traitCreativity: 0.5, traitNostalgia: 0.3, traitAdventure: 0.4, nextMeetingAt: daysFromNow(3, 18), meetingLocation: "ZACH 102", meetingDay: "Thursdays", meetingTime: "6:00 PM", signupUrl: "https://stuact.tamu.edu/app/organization/swe-tamu", instagramUrl: "https://instagram.com/swetamu", dues: "$35/year", duesDeadline: daysFromNow(15, 23) },
  { domain: "academic", title: "Philosophy Discussion Group", tags: ["vibe", "humanities", "debate", "intellectual", "discussion"], description: "Weekly philosophical discussions on ethics, epistemology, and political philosophy. No philosophy major required. Book club meets monthly. Guest lectures from faculty.", popularity: 120, traitNovelty: 0.7, traitIntensity: 0.3, traitCozy: 0.6, traitStrategy: 0.5, traitSocial: 0.6, traitCreativity: 0.8, traitNostalgia: 0.5, traitAdventure: 0.3, nextMeetingAt: daysFromNow(6, 17), meetingLocation: "YMCA 302", meetingDay: "Mondays", meetingTime: "5:00 PM", signupUrl: "https://stuact.tamu.edu/app/organization/philosophy-discussion-group", instagramUrl: "https://instagram.com/tamuphilosophy", dues: "Free", duesDeadline: null },
  { domain: "academic", title: "TAMU Rocket Engineering", tags: ["career_alignment", "aerospace", "rocketry", "skills", "hands_on"], description: "Design, build, and launch high-powered rockets. Compete at NASA Student Launch and Spaceport America Cup. Machine shop access and mentorship from aerospace engineering faculty.", popularity: 350, traitNovelty: 0.85, traitIntensity: 0.7, traitCozy: 0.1, traitStrategy: 0.8, traitSocial: 0.5, traitCreativity: 0.9, traitNostalgia: 0.2, traitAdventure: 0.9, nextMeetingAt: daysFromNow(7, 19), meetingLocation: "HRBB 301", meetingDay: "Saturdays", meetingTime: "7:00 PM", signupUrl: "https://stuact.tamu.edu/app/organization/tamu-rocket-engineering", instagramUrl: "https://instagram.com/tamurockets", dues: "$40/semester", duesDeadline: daysFromNow(20, 23) },

  // === PROFESSIONAL (10 clubs) ===
  { domain: "professional", title: "Aggie Consulting Group", tags: ["career_alignment", "consulting", "strategy", "industry", "case_prep"], description: "Pro-bono consulting for local businesses and nonprofits. Case interview prep workshops and alumni panels from McKinsey, BCG, and Deloitte. Selective application process.", popularity: 340, traitNovelty: 0.5, traitIntensity: 0.6, traitCozy: 0.2, traitStrategy: 0.95, traitSocial: 0.6, traitCreativity: 0.5, traitNostalgia: 0.1, traitAdventure: 0.4, nextMeetingAt: daysFromNow(1, 19), meetingLocation: "WCBA 220", meetingDay: "Tuesdays", meetingTime: "7:00 PM", signupUrl: "https://stuact.tamu.edu/app/organization/aggie-consulting-group", instagramUrl: "https://instagram.com/aggieconsulting", dues: "$50/semester", duesDeadline: daysFromNow(12, 23) },
  { domain: "professional", title: "TAMU Entrepreneurship Club", tags: ["career_alignment", "startups", "pitch", "skills", "innovation"], description: "Startup weekends, pitch competitions, and founder speaker series. Access to McFerrin Center resources, co-working space, and seed funding opportunities through TAMU ventures.", popularity: 420, traitNovelty: 0.9, traitIntensity: 0.7, traitCozy: 0.2, traitStrategy: 0.7, traitSocial: 0.7, traitCreativity: 0.9, traitNostalgia: 0.1, traitAdventure: 0.8, nextMeetingAt: daysFromNow(3, 18), meetingLocation: "MSC 2406", meetingDay: "Wednesdays", meetingTime: "6:00 PM", signupUrl: "https://stuact.tamu.edu/app/organization/tamu-entrepreneurship", instagramUrl: "https://instagram.com/tamueship", dues: "$25/semester", duesDeadline: daysFromNow(16, 23) },
  { domain: "professional", title: "Finance & Investment Club", tags: ["career_alignment", "finance", "investing", "industry", "markets"], description: "Manage a real student investment fund. Bloomberg Terminal training, equity research presentations, and Wall Street trek. Pipeline to Goldman Sachs, JP Morgan, and Citadel.", popularity: 380, traitNovelty: 0.4, traitIntensity: 0.7, traitCozy: 0.2, traitStrategy: 0.9, traitSocial: 0.5, traitCreativity: 0.3, traitNostalgia: 0.2, traitAdventure: 0.4, nextMeetingAt: daysFromNow(4, 18), meetingLocation: "WCBA 310", meetingDay: "Thursdays", meetingTime: "6:00 PM", signupUrl: "https://stuact.tamu.edu/app/organization/finance-investment-club", instagramUrl: "https://instagram.com/tamufinanceclub", dues: "$40/semester", duesDeadline: daysFromNow(22, 23) },
  { domain: "professional", title: "National Society of Black Engineers", tags: ["career_alignment", "engineering", "diversity", "community", "professional"], description: "Professional development, academic support, and cultural community for Black engineers. National convention travel, corporate partnerships with Boeing, Raytheon, and Microsoft.", popularity: 460, traitNovelty: 0.5, traitIntensity: 0.5, traitCozy: 0.4, traitStrategy: 0.6, traitSocial: 0.85, traitCreativity: 0.5, traitNostalgia: 0.3, traitAdventure: 0.5, nextMeetingAt: daysFromNow(2, 18), meetingLocation: "ZACH 244", meetingDay: "Wednesdays", meetingTime: "6:00 PM", signupUrl: "https://stuact.tamu.edu/app/organization/nsbe-tamu", instagramUrl: "https://instagram.com/nsbetamu", dues: "$35/year", duesDeadline: daysFromNow(25, 23) },
  { domain: "professional", title: "TAMU Product Management Club", tags: ["career_alignment", "product", "tech", "skills", "UX"], description: "Product thinking workshops, mock PM interviews, and real product sprints with local startups. Guest PMs from Google, Meta, and Stripe. Portfolio building program.", popularity: 290, traitNovelty: 0.7, traitIntensity: 0.5, traitCozy: 0.3, traitStrategy: 0.8, traitSocial: 0.6, traitCreativity: 0.8, traitNostalgia: 0.1, traitAdventure: 0.5, nextMeetingAt: daysFromNow(5, 18), meetingLocation: "ETB 140", meetingDay: "Mondays", meetingTime: "6:00 PM", signupUrl: "https://stuact.tamu.edu/app/organization/tamu-product-management", instagramUrl: "https://instagram.com/tamupmclub", dues: "$20/semester", duesDeadline: daysFromNow(14, 23) },
  { domain: "professional", title: "Women in Business", tags: ["career_alignment", "business", "diversity", "networking", "leadership"], description: "Empowering women in business through mentorship, networking, and professional development. Annual conference, corporate site visits, and leadership retreats.", popularity: 380, traitNovelty: 0.4, traitIntensity: 0.4, traitCozy: 0.5, traitStrategy: 0.6, traitSocial: 0.85, traitCreativity: 0.5, traitNostalgia: 0.3, traitAdventure: 0.4, nextMeetingAt: daysFromNow(1, 17), meetingLocation: "WCBA 105", meetingDay: "Tuesdays", meetingTime: "5:00 PM", signupUrl: "https://stuact.tamu.edu/app/organization/women-in-business", instagramUrl: "https://instagram.com/tamuwib", dues: "$30/semester", duesDeadline: daysFromNow(19, 23) },
  { domain: "professional", title: "Design & UX Society", tags: ["career_alignment", "design", "UX", "skills", "creative"], description: "UI/UX design workshops, portfolio reviews, and design sprints. Figma and Adobe Creative Suite workshops. Partnerships with IDEO, frog design, and IBM Design.", popularity: 250, traitNovelty: 0.7, traitIntensity: 0.4, traitCozy: 0.4, traitStrategy: 0.5, traitSocial: 0.6, traitCreativity: 0.95, traitNostalgia: 0.2, traitAdventure: 0.4, nextMeetingAt: daysFromNow(6, 19), meetingLocation: "LAAH 201", meetingDay: "Thursdays", meetingTime: "7:00 PM", signupUrl: "https://stuact.tamu.edu/app/organization/design-ux-society", instagramUrl: "https://instagram.com/tamuuxdesign", dues: "$15/semester", duesDeadline: daysFromNow(11, 23) },
  { domain: "professional", title: "Supply Chain Management Association", tags: ["career_alignment", "supply_chain", "logistics", "industry", "operations"], description: "Supply chain case competitions, plant tours, and industry networking. Partnerships with Amazon Operations, FedEx, and Walmart. Career fair prep workshops.", popularity: 210, traitNovelty: 0.3, traitIntensity: 0.4, traitCozy: 0.3, traitStrategy: 0.8, traitSocial: 0.5, traitCreativity: 0.3, traitNostalgia: 0.2, traitAdventure: 0.3, nextMeetingAt: daysFromNow(3, 17), meetingLocation: "WCBA 415", meetingDay: "Wednesdays", meetingTime: "5:00 PM", signupUrl: "https://stuact.tamu.edu/app/organization/scma-tamu", instagramUrl: "https://instagram.com/tamuscma", dues: "$25/year", duesDeadline: daysFromNow(30, 23) },
  { domain: "professional", title: "Pre-Law Society", tags: ["career_alignment", "law", "debate", "LSAT", "vibe"], description: "LSAT prep groups, mock trial practice, and law school application workshops. Guest speakers from TAMU Law and top Texas firms. Courtroom visits and moot court competitions.", popularity: 280, traitNovelty: 0.4, traitIntensity: 0.5, traitCozy: 0.3, traitStrategy: 0.7, traitSocial: 0.6, traitCreativity: 0.5, traitNostalgia: 0.3, traitAdventure: 0.4, nextMeetingAt: daysFromNow(4, 18), meetingLocation: "ACAD 203", meetingDay: "Tuesdays", meetingTime: "6:00 PM", signupUrl: "https://stuact.tamu.edu/app/organization/pre-law-society", instagramUrl: "https://instagram.com/tamuprelaw", dues: "$20/semester", duesDeadline: daysFromNow(17, 23) },
  { domain: "professional", title: "Data Science Club", tags: ["career_alignment", "data_science", "analytics", "skills", "python"], description: "Hands-on data projects, Kaggle competitions, and industry speaker series. Python, R, and SQL workshops. Partnerships with Capital One, USAA, and SpaceX analytics teams.", popularity: 360, traitNovelty: 0.7, traitIntensity: 0.5, traitCozy: 0.2, traitStrategy: 0.8, traitSocial: 0.5, traitCreativity: 0.7, traitNostalgia: 0.1, traitAdventure: 0.5, nextMeetingAt: daysFromNow(5, 19), meetingLocation: "HRBB 113", meetingDay: "Fridays", meetingTime: "7:00 PM", signupUrl: "https://stuact.tamu.edu/app/organization/data-science-club", instagramUrl: "https://instagram.com/tamudatascience", dues: "Free", duesDeadline: null },

  // === SOCIAL (10 clubs) ===
  { domain: "social", title: "Aggie Film Society", tags: ["vibe", "movies", "cinema", "creative", "discussion"], description: "Weekly film screenings followed by discussions. Student film production workshops, short film festival each semester. Camera equipment available for members.", popularity: 180, traitNovelty: 0.6, traitIntensity: 0.3, traitCozy: 0.7, traitStrategy: 0.3, traitSocial: 0.7, traitCreativity: 0.9, traitNostalgia: 0.6, traitAdventure: 0.3, nextMeetingAt: daysFromNow(5, 19), meetingLocation: "ILCB 111", meetingDay: "Fridays", meetingTime: "7:00 PM", signupUrl: "https://stuact.tamu.edu/app/organization/aggie-film-society", instagramUrl: "https://instagram.com/aggiefilmsociety", dues: "$15/semester", duesDeadline: daysFromNow(13, 23) },
  { domain: "social", title: "Korean Student Association", tags: ["vibe", "culture", "korean", "community", "social"], description: "Korean culture through K-Pop dance, Korean cooking nights, and language exchange. Annual culture show is one of the biggest on campus. All backgrounds welcome.", popularity: 520, traitNovelty: 0.5, traitIntensity: 0.4, traitCozy: 0.6, traitStrategy: 0.2, traitSocial: 0.95, traitCreativity: 0.6, traitNostalgia: 0.5, traitAdventure: 0.4, nextMeetingAt: daysFromNow(6, 18), meetingLocation: "MSC 2401", meetingDay: "Saturdays", meetingTime: "6:00 PM", signupUrl: "https://stuact.tamu.edu/app/organization/korean-student-association", instagramUrl: "https://instagram.com/ksatamu", dues: "$20/semester", duesDeadline: daysFromNow(15, 23) },
  { domain: "social", title: "Aggie Gaming Association", tags: ["vibe", "gaming", "esports", "competitive", "social"], description: "Casual and competitive gaming community. Esports teams in League, Valorant, and Rocket League. LAN parties, tournaments, and gaming lounge access.", popularity: 680, traitNovelty: 0.4, traitIntensity: 0.6, traitCozy: 0.5, traitStrategy: 0.7, traitSocial: 0.8, traitCreativity: 0.3, traitNostalgia: 0.5, traitAdventure: 0.3, nextMeetingAt: daysFromNow(4, 20), meetingLocation: "MSC 1502", meetingDay: "Thursdays", meetingTime: "8:00 PM", signupUrl: "https://stuact.tamu.edu/app/organization/aggie-gaming-association", instagramUrl: "https://instagram.com/aggiegaming", dues: "$15/semester", duesDeadline: daysFromNow(9, 23) },
  { domain: "social", title: "Outdoor Adventures Club", tags: ["vibe", "hiking", "camping", "nature", "adventure"], description: "Weekend camping trips, hiking, kayaking, and rock climbing excursions. Gear rental available. Monthly campfire socials and photography contests.", popularity: 410, traitNovelty: 0.6, traitIntensity: 0.6, traitCozy: 0.3, traitStrategy: 0.3, traitSocial: 0.7, traitCreativity: 0.4, traitNostalgia: 0.4, traitAdventure: 0.95, nextMeetingAt: daysFromNow(2, 18), meetingLocation: "Rec Center 108", meetingDay: "Wednesdays", meetingTime: "6:00 PM", signupUrl: "https://stuact.tamu.edu/app/organization/outdoor-adventures-club", instagramUrl: "https://instagram.com/tamuoutdoors", dues: "$30/semester", duesDeadline: daysFromNow(20, 23) },
  { domain: "social", title: "Aggie Cooking Club", tags: ["vibe", "cooking", "food", "social", "creative"], description: "Learn to cook everything from ramen to beef wellington. Themed cooking nights, potluck dinners, and guest chef demonstrations. Kitchen space provided.", popularity: 340, traitNovelty: 0.5, traitIntensity: 0.3, traitCozy: 0.85, traitStrategy: 0.3, traitSocial: 0.8, traitCreativity: 0.7, traitNostalgia: 0.6, traitAdventure: 0.4, nextMeetingAt: daysFromNow(1, 18), meetingLocation: "Sbisa Dining Hall", meetingDay: "Tuesdays", meetingTime: "6:00 PM", signupUrl: "https://stuact.tamu.edu/app/organization/aggie-cooking-club", instagramUrl: "https://instagram.com/aggiecooking", dues: "$25/semester", duesDeadline: daysFromNow(12, 23) },
  { domain: "social", title: "Board Game & D&D Guild", tags: ["vibe", "strategy", "tabletop", "social", "creative"], description: "Weekly board game nights and ongoing D&D campaigns. 200+ game library including Catan, Wingspan, and Gloomhaven. New player friendly with learn-to-play sessions.", popularity: 290, traitNovelty: 0.5, traitIntensity: 0.3, traitCozy: 0.7, traitStrategy: 0.8, traitSocial: 0.9, traitCreativity: 0.7, traitNostalgia: 0.6, traitAdventure: 0.3, nextMeetingAt: daysFromNow(5, 18), meetingLocation: "MSC 2502", meetingDay: "Fridays", meetingTime: "6:00 PM", signupUrl: "https://stuact.tamu.edu/app/organization/board-game-dnd-guild", instagramUrl: "https://instagram.com/aggietabletop", dues: "Free", duesDeadline: null },
  { domain: "social", title: "South Asian Student Association", tags: ["vibe", "culture", "south_asian", "community", "dance"], description: "Celebrating South Asian culture through Diwali, Holi, and Garba events. Bollywood dance team, cricket matches, and cultural showcases.", popularity: 480, traitNovelty: 0.5, traitIntensity: 0.5, traitCozy: 0.5, traitStrategy: 0.2, traitSocial: 0.9, traitCreativity: 0.6, traitNostalgia: 0.6, traitAdventure: 0.4, nextMeetingAt: daysFromNow(3, 18), meetingLocation: "HRBB 124", meetingDay: "Thursdays", meetingTime: "6:00 PM", signupUrl: "https://stuact.tamu.edu/app/organization/south-asian-student-association", instagramUrl: "https://instagram.com/sasatamu", dues: "$20/year", duesDeadline: daysFromNow(24, 23) },
  { domain: "social", title: "Aggie Music Collective", tags: ["vibe", "music", "performance", "creative", "community"], description: "Open mic nights, jam sessions, and student band formation. Practice rooms available. Produce a semester-end concert at Rudder Auditorium.", popularity: 310, traitNovelty: 0.6, traitIntensity: 0.4, traitCozy: 0.5, traitStrategy: 0.3, traitSocial: 0.8, traitCreativity: 0.95, traitNostalgia: 0.5, traitAdventure: 0.4, nextMeetingAt: daysFromNow(2, 19), meetingLocation: "Rudder Tower 301", meetingDay: "Wednesdays", meetingTime: "7:00 PM", signupUrl: "https://stuact.tamu.edu/app/organization/aggie-music-collective", instagramUrl: "https://instagram.com/aggiemusiccollective", dues: "Free", duesDeadline: null },
  { domain: "social", title: "Photography Club", tags: ["vibe", "photography", "creative", "outdoor", "art"], description: "Photo walks around Bryan-College Station, studio sessions, and editing workshops. Monthly photo contests and end-of-year gallery exhibition.", popularity: 260, traitNovelty: 0.6, traitIntensity: 0.2, traitCozy: 0.5, traitStrategy: 0.3, traitSocial: 0.5, traitCreativity: 0.9, traitNostalgia: 0.5, traitAdventure: 0.5, nextMeetingAt: daysFromNow(7, 17), meetingLocation: "LAAH 107", meetingDay: "Sundays", meetingTime: "5:00 PM", signupUrl: "https://stuact.tamu.edu/app/organization/photography-club", instagramUrl: "https://instagram.com/tamuphotographyclub", dues: "$15/semester", duesDeadline: daysFromNow(10, 23) },
  { domain: "social", title: "Aggie Dance Company", tags: ["vibe", "dance", "performance", "fitness", "creative"], description: "Hip hop, contemporary, K-Pop, and Latin dance teams. Weekly practices and semester showcase performances. No audition required for recreational track.", popularity: 450, traitNovelty: 0.5, traitIntensity: 0.6, traitCozy: 0.3, traitStrategy: 0.3, traitSocial: 0.85, traitCreativity: 0.8, traitNostalgia: 0.3, traitAdventure: 0.5, nextMeetingAt: daysFromNow(1, 20), meetingLocation: "Rec Center Dance Studio", meetingDay: "Mon/Wed", meetingTime: "8:00 PM", signupUrl: "https://stuact.tamu.edu/app/organization/aggie-dance-company", instagramUrl: "https://instagram.com/aggiedancecompany", dues: "$25/semester", duesDeadline: daysFromNow(18, 23) },

  // === SPORTS (10 clubs) ===
  { domain: "sports", title: "Club Soccer", tags: ["commitment", "soccer", "competitive", "fitness", "team"], description: "Competitive club soccer with tryouts each semester. Practice 3x/week, travel to regional tournaments. Men's and women's divisions.", popularity: 380, traitNovelty: 0.3, traitIntensity: 0.8, traitCozy: 0.1, traitStrategy: 0.6, traitSocial: 0.8, traitCreativity: 0.3, traitNostalgia: 0.4, traitAdventure: 0.6, nextMeetingAt: daysFromNow(1, 17), meetingLocation: "Penberthy Intramural Fields", meetingDay: "Tue/Thu", meetingTime: "5:00 PM", signupUrl: "https://stuact.tamu.edu/app/organization/club-soccer", instagramUrl: "https://instagram.com/aggiesoccer_club", dues: "$50/semester", duesDeadline: daysFromNow(8, 23) },
  { domain: "sports", title: "Aggie Climbing Team", tags: ["commitment", "climbing", "bouldering", "fitness", "outdoor"], description: "Indoor bouldering and sport climbing. Weekly practices at the Rec Center climbing wall. Travel to outdoor crags and compete at collegiate climbing nationals.", popularity: 280, traitNovelty: 0.6, traitIntensity: 0.8, traitCozy: 0.1, traitStrategy: 0.6, traitSocial: 0.6, traitCreativity: 0.3, traitNostalgia: 0.1, traitAdventure: 0.95, nextMeetingAt: daysFromNow(3, 19), meetingLocation: "Rec Center Climbing Wall", meetingDay: "Mon/Wed", meetingTime: "7:00 PM", signupUrl: "https://stuact.tamu.edu/app/organization/aggie-climbing-team", instagramUrl: "https://instagram.com/aggieclimbing", dues: "$35/semester", duesDeadline: daysFromNow(14, 23) },
  { domain: "sports", title: "Club Basketball", tags: ["commitment", "basketball", "competitive", "athletic", "team"], description: "Competitive club basketball with structured practices and games against other Texas universities. Open tryouts in August and January.", popularity: 420, traitNovelty: 0.3, traitIntensity: 0.85, traitCozy: 0.1, traitStrategy: 0.6, traitSocial: 0.7, traitCreativity: 0.2, traitNostalgia: 0.4, traitAdventure: 0.5, nextMeetingAt: daysFromNow(2, 20), meetingLocation: "Rec Center Gym B", meetingDay: "Tue/Thu", meetingTime: "8:00 PM", signupUrl: "https://stuact.tamu.edu/app/organization/club-basketball", instagramUrl: "https://instagram.com/aggiebasketball_club", dues: "$45/semester", duesDeadline: daysFromNow(10, 23) },
  { domain: "sports", title: "Aggie Running Club", tags: ["commitment", "running", "fitness", "endurance", "social"], description: "Group runs, 5K training programs, and marathon prep. All paces welcome from beginners to sub-3:00 marathoners. Social runs to local breweries.", popularity: 350, traitNovelty: 0.3, traitIntensity: 0.7, traitCozy: 0.2, traitStrategy: 0.3, traitSocial: 0.7, traitCreativity: 0.2, traitNostalgia: 0.3, traitAdventure: 0.6, nextMeetingAt: daysFromNow(1, 6), meetingLocation: "Kyle Field Gate 1", meetingDay: "Tue/Thu/Sat", meetingTime: "6:00 AM", signupUrl: "https://stuact.tamu.edu/app/organization/aggie-running-club", instagramUrl: "https://instagram.com/aggierunningclub", dues: "Free", duesDeadline: null },
  { domain: "sports", title: "Pickleball Club", tags: ["commitment", "pickleball", "social", "recreational", "fun"], description: "The fastest-growing sport on campus. Open play sessions, round-robin tournaments, and social mixers. Equipment provided for beginners.", popularity: 510, traitNovelty: 0.5, traitIntensity: 0.5, traitCozy: 0.3, traitStrategy: 0.5, traitSocial: 0.9, traitCreativity: 0.2, traitNostalgia: 0.3, traitAdventure: 0.4, nextMeetingAt: daysFromNow(4, 17), meetingLocation: "Rec Center Courts", meetingDay: "Wed/Fri", meetingTime: "5:00 PM", signupUrl: "https://stuact.tamu.edu/app/organization/pickleball-club", instagramUrl: "https://instagram.com/tamupickleball", dues: "$15/semester", duesDeadline: daysFromNow(21, 23) },
  { domain: "sports", title: "Club Volleyball", tags: ["commitment", "volleyball", "competitive", "team", "athletic"], description: "Men's and women's club volleyball. Compete in NIRSA regional and national tournaments. Practice 2-3x/week at the Rec Center.", popularity: 340, traitNovelty: 0.3, traitIntensity: 0.7, traitCozy: 0.1, traitStrategy: 0.6, traitSocial: 0.8, traitCreativity: 0.2, traitNostalgia: 0.3, traitAdventure: 0.5, nextMeetingAt: daysFromNow(2, 19), meetingLocation: "Rec Center Gym A", meetingDay: "Mon/Wed", meetingTime: "7:00 PM", signupUrl: "https://stuact.tamu.edu/app/organization/club-volleyball", instagramUrl: "https://instagram.com/aggievolleyball_club", dues: "$40/semester", duesDeadline: daysFromNow(13, 23) },
  { domain: "sports", title: "Aggie Martial Arts", tags: ["commitment", "martial_arts", "fitness", "discipline", "competitive"], description: "Brazilian Jiu-Jitsu, Muay Thai, and Taekwondo training. Belt progression system, compete at collegiate tournaments. Beginner-friendly.", popularity: 290, traitNovelty: 0.6, traitIntensity: 0.9, traitCozy: 0.05, traitStrategy: 0.7, traitSocial: 0.5, traitCreativity: 0.3, traitNostalgia: 0.2, traitAdventure: 0.7, nextMeetingAt: daysFromNow(1, 18), meetingLocation: "Rec Center Martial Arts Room", meetingDay: "Tue/Thu", meetingTime: "6:00 PM", signupUrl: "https://stuact.tamu.edu/app/organization/aggie-martial-arts", instagramUrl: "https://instagram.com/aggiemartialarts", dues: "$50/semester", duesDeadline: daysFromNow(7, 23) },
  { domain: "sports", title: "Club Tennis", tags: ["commitment", "tennis", "competitive", "social", "fitness"], description: "Competitive and recreational club tennis. Ladder matches, inter-club tournaments, and social doubles nights. Court reservations included.", popularity: 310, traitNovelty: 0.3, traitIntensity: 0.6, traitCozy: 0.2, traitStrategy: 0.6, traitSocial: 0.7, traitCreativity: 0.2, traitNostalgia: 0.4, traitAdventure: 0.4, nextMeetingAt: daysFromNow(6, 16), meetingLocation: "Omar Smith Tennis Center", meetingDay: "Sat/Sun", meetingTime: "4:00 PM", signupUrl: "https://stuact.tamu.edu/app/organization/club-tennis", instagramUrl: "https://instagram.com/aggietennisclub", dues: "$30/semester", duesDeadline: daysFromNow(16, 23) },
  { domain: "sports", title: "Ultimate Frisbee", tags: ["commitment", "frisbee", "social", "outdoor", "competitive"], description: "Spirit of the Game meets competition. Practice 3x/week, travel to sectionals and regionals. Co-ed and single-gender divisions available.", popularity: 260, traitNovelty: 0.5, traitIntensity: 0.6, traitCozy: 0.2, traitStrategy: 0.5, traitSocial: 0.85, traitCreativity: 0.3, traitNostalgia: 0.3, traitAdventure: 0.6, nextMeetingAt: daysFromNow(3, 17), meetingLocation: "Penberthy Intramural Fields", meetingDay: "Mon/Wed/Fri", meetingTime: "5:00 PM", signupUrl: "https://stuact.tamu.edu/app/organization/ultimate-frisbee", instagramUrl: "https://instagram.com/aggieultimate", dues: "$25/semester", duesDeadline: daysFromNow(11, 23) },
  { domain: "sports", title: "Aggie Swim & Dive Club", tags: ["commitment", "swimming", "fitness", "competitive", "water"], description: "Competitive swimming and diving for non-varsity athletes. Practice at the Student Rec Center pool. Compete at club nationals.", popularity: 190, traitNovelty: 0.3, traitIntensity: 0.7, traitCozy: 0.1, traitStrategy: 0.4, traitSocial: 0.5, traitCreativity: 0.2, traitNostalgia: 0.3, traitAdventure: 0.4, nextMeetingAt: daysFromNow(1, 6), meetingLocation: "Rec Center Pool", meetingDay: "Mon/Wed/Fri", meetingTime: "6:00 AM", signupUrl: "https://stuact.tamu.edu/app/organization/aggie-swim-dive", instagramUrl: "https://instagram.com/aggieswimdive", dues: "$35/semester", duesDeadline: daysFromNow(19, 23) },

  // === VOLUNTEERING (10 clubs) ===
  { domain: "volunteering", title: "Aggie Habitat for Humanity", tags: ["commitment", "construction", "community", "hands_on", "service"], description: "Build homes for families in need in the Bryan-College Station area. No construction experience required. Spring Break build trips to other states.", popularity: 480, traitNovelty: 0.4, traitIntensity: 0.5, traitCozy: 0.3, traitStrategy: 0.4, traitSocial: 0.8, traitCreativity: 0.3, traitNostalgia: 0.4, traitAdventure: 0.6, nextMeetingAt: daysFromNow(6, 9), meetingLocation: "MSC 1402", meetingDay: "Saturdays", meetingTime: "9:00 AM", signupUrl: "https://stuact.tamu.edu/app/organization/aggie-habitat", instagramUrl: "https://instagram.com/aggiehabitat", dues: "Free", duesDeadline: null },
  { domain: "volunteering", title: "Big Event", tags: ["commitment", "campus_tradition", "community_service", "teamwork", "Aggie"], description: "Largest one-day, student-run service project in the nation. Over 20,000 Aggies give back to the Brazos Valley community in a single day each spring.", popularity: 890, traitNovelty: 0.3, traitIntensity: 0.5, traitCozy: 0.4, traitStrategy: 0.4, traitSocial: 0.95, traitCreativity: 0.3, traitNostalgia: 0.8, traitAdventure: 0.4, nextMeetingAt: daysFromNow(2, 18), meetingLocation: "MSC 2406", meetingDay: "Wednesdays", meetingTime: "6:00 PM", signupUrl: "https://stuact.tamu.edu/app/organization/big-event", instagramUrl: "https://instagram.com/aggiebig_event", dues: "Free", duesDeadline: null },
  { domain: "volunteering", title: "Camp Kesem TAMU", tags: ["commitment", "children", "cancer_support", "leadership", "camp"], description: "Free summer camp for children affected by a parent's cancer. Year-round fundraising, training, and camp counselor preparation. Life-changing experience.", popularity: 340, traitNovelty: 0.5, traitIntensity: 0.4, traitCozy: 0.6, traitStrategy: 0.4, traitSocial: 0.9, traitCreativity: 0.6, traitNostalgia: 0.5, traitAdventure: 0.4, nextMeetingAt: daysFromNow(7, 17), meetingLocation: "YMCA 405", meetingDay: "Sundays", meetingTime: "5:00 PM", signupUrl: "https://stuact.tamu.edu/app/organization/camp-kesem-tamu", instagramUrl: "https://instagram.com/campkesemtamu", dues: "Free", duesDeadline: null },
  { domain: "volunteering", title: "Aggie Tutoring", tags: ["commitment", "education", "mentorship", "skills", "academic"], description: "Free tutoring for K-12 students in Bryan-College Station schools. Tutors in math, science, reading, and test prep. Flexible scheduling around classes.", popularity: 380, traitNovelty: 0.3, traitIntensity: 0.3, traitCozy: 0.6, traitStrategy: 0.5, traitSocial: 0.7, traitCreativity: 0.4, traitNostalgia: 0.4, traitAdventure: 0.2, nextMeetingAt: daysFromNow(1, 16), meetingLocation: "ILCB 312", meetingDay: "Mon/Wed", meetingTime: "4:00 PM", signupUrl: "https://stuact.tamu.edu/app/organization/aggie-tutoring", instagramUrl: "https://instagram.com/aggietutoring", dues: "Free", duesDeadline: null },
  { domain: "volunteering", title: "Engineers Without Borders", tags: ["commitment", "engineering", "international", "service", "sustainability"], description: "Design and implement sustainable engineering projects in developing communities. Travel teams to Guatemala and Kenya. Technical skills meet real-world impact.", popularity: 320, traitNovelty: 0.7, traitIntensity: 0.5, traitCozy: 0.2, traitStrategy: 0.7, traitSocial: 0.6, traitCreativity: 0.7, traitNostalgia: 0.2, traitAdventure: 0.9, nextMeetingAt: daysFromNow(4, 18), meetingLocation: "ZACH 450", meetingDay: "Thursdays", meetingTime: "6:00 PM", signupUrl: "https://stuact.tamu.edu/app/organization/ewb-tamu", instagramUrl: "https://instagram.com/ewbtamu", dues: "$30/semester", duesDeadline: daysFromNow(22, 23) },
  { domain: "volunteering", title: "Aggies for Animal Rescue", tags: ["commitment", "animals", "shelter", "community", "care"], description: "Volunteer at the Brazos Valley animal shelter. Foster programs, adoption events, and veterinary clinic assistance. Transport animals to forever homes.", popularity: 410, traitNovelty: 0.4, traitIntensity: 0.3, traitCozy: 0.7, traitStrategy: 0.3, traitSocial: 0.6, traitCreativity: 0.3, traitNostalgia: 0.5, traitAdventure: 0.3, nextMeetingAt: daysFromNow(3, 17), meetingLocation: "VET 106", meetingDay: "Tuesdays", meetingTime: "5:00 PM", signupUrl: "https://stuact.tamu.edu/app/organization/aggies-animal-rescue", instagramUrl: "https://instagram.com/aggiesanimalrescue", dues: "Free", duesDeadline: null },
  { domain: "volunteering", title: "Global Health Initiative", tags: ["commitment", "health", "international", "public_health", "service"], description: "Public health outreach in underserved communities locally and internationally. Health education campaigns, clinic volunteering, and global health conferences.", popularity: 280, traitNovelty: 0.6, traitIntensity: 0.4, traitCozy: 0.3, traitStrategy: 0.5, traitSocial: 0.7, traitCreativity: 0.4, traitNostalgia: 0.2, traitAdventure: 0.7, nextMeetingAt: daysFromNow(5, 18), meetingLocation: "MSC 2300", meetingDay: "Mondays", meetingTime: "6:00 PM", signupUrl: "https://stuact.tamu.edu/app/organization/global-health-initiative", instagramUrl: "https://instagram.com/tamughi", dues: "$15/semester", duesDeadline: daysFromNow(26, 23) },
  { domain: "volunteering", title: "Food Recovery Network", tags: ["commitment", "sustainability", "food", "community", "environment"], description: "Recover surplus food from campus dining halls and local restaurants. Distribute to food banks and shelters. Fight food waste and food insecurity simultaneously.", popularity: 260, traitNovelty: 0.5, traitIntensity: 0.3, traitCozy: 0.4, traitStrategy: 0.5, traitSocial: 0.6, traitCreativity: 0.4, traitNostalgia: 0.3, traitAdventure: 0.3, nextMeetingAt: daysFromNow(2, 17), meetingLocation: "AGLS 110", meetingDay: "Wednesdays", meetingTime: "5:00 PM", signupUrl: "https://stuact.tamu.edu/app/organization/food-recovery-network", instagramUrl: "https://instagram.com/tamufoodrecovery", dues: "Free", duesDeadline: null },
  { domain: "volunteering", title: "Aggie THON", tags: ["commitment", "fundraising", "dance_marathon", "children", "Aggie"], description: "Year-round fundraising for Texas Children's Hospital through dance marathons. 24-hour dance marathon is the culminating event. Over $500K raised annually.", popularity: 560, traitNovelty: 0.4, traitIntensity: 0.6, traitCozy: 0.4, traitStrategy: 0.4, traitSocial: 0.95, traitCreativity: 0.5, traitNostalgia: 0.6, traitAdventure: 0.5, nextMeetingAt: daysFromNow(4, 19), meetingLocation: "MSC 2401", meetingDay: "Thursdays", meetingTime: "7:00 PM", signupUrl: "https://stuact.tamu.edu/app/organization/aggie-thon", instagramUrl: "https://instagram.com/aggiethon", dues: "$20/year", duesDeadline: daysFromNow(27, 23) },
  { domain: "volunteering", title: "TAMU Sustainability Club", tags: ["commitment", "environment", "sustainability", "green", "advocacy"], description: "Campus sustainability initiatives, community garden maintenance, recycling drives, and environmental advocacy. Partner with TAMU Office of Sustainability.", popularity: 230, traitNovelty: 0.6, traitIntensity: 0.3, traitCozy: 0.4, traitStrategy: 0.5, traitSocial: 0.6, traitCreativity: 0.5, traitNostalgia: 0.3, traitAdventure: 0.4, nextMeetingAt: daysFromNow(1, 17), meetingLocation: "HECC 203", meetingDay: "Mondays", meetingTime: "5:00 PM", signupUrl: "https://stuact.tamu.edu/app/organization/tamu-sustainability", instagramUrl: "https://instagram.com/tamusustainability", dues: "Free", duesDeadline: null },
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
    title: "Northgate Friday Night Party",
    description: "The biggest Friday night on Northgate. Live DJ, $3 drinks before 11pm, and a massive patio setup. 21+ wristbands at the door. Uber from campus recommended.",
    category: "parties",
    location: "Northgate District",
    dateTime: daysFromNow(1, 22),
    imageUrl: "/event-concert",
    tags: ["party", "nightlife", "social", "northgate"],
    organizerName: "Northgate Events",
    creatorName: "Northgate Events",
    contactInfo: null,
    attendeeCount: 250,
    locationLat: 30.6218, locationLng: -96.3407,
    locationDetails: "The Backyard Bar, Northgate",
    cost: "$5 cover",
    priceInfo: "$5 cover, $3 wells before 11pm",
    isDeal: true,
    dealExpiresAt: daysFromNow(1, 23),
    traitNovelty: 0.5, traitIntensity: 0.9, traitCozy: 0.1, traitStrategy: 0.1, traitSocial: 0.95, traitCreativity: 0.3, traitNostalgia: 0.3, traitAdventure: 0.7,
  },
  {
    title: "Raising Cane's Free Combo Thursday",
    description: "Show your student ID for a free Box Combo with any drink purchase. One per student. Available at both College Station locations while supplies last.",
    category: "deals",
    location: "Raising Cane's - University Dr",
    dateTime: daysFromNow(0, 11),
    imageUrl: "/event-festival",
    tags: ["deal", "food", "free", "student_discount"],
    organizerName: "Raising Cane's",
    creatorName: "Raising Cane's College Station",
    contactInfo: null,
    attendeeCount: 400,
    locationLat: 30.6130, locationLng: -96.3310,
    locationDetails: "401 University Dr E",
    cost: "Free combo with drink purchase",
    priceInfo: "Free Box Combo with drink purchase + student ID",
    isDeal: true,
    dealExpiresAt: daysFromNow(0, 22),
    traitNovelty: 0.3, traitIntensity: 0.2, traitCozy: 0.7, traitStrategy: 0.1, traitSocial: 0.5, traitCreativity: 0.1, traitNostalgia: 0.6, traitAdventure: 0.2,
  },
  {
    title: "Top Golf Student Night",
    description: "30% off bay rentals every Wednesday for students. Bring your ID. Groups of 4-6 recommended. Great for hangouts, dates, or just unwinding after class.",
    category: "deals",
    location: "Top Golf College Station",
    dateTime: daysFromNow(2, 17),
    imageUrl: "/event-pickleball",
    tags: ["deal", "sports", "social", "student_discount"],
    organizerName: "Top Golf",
    creatorName: "Top Golf College Station",
    contactInfo: null,
    attendeeCount: 80,
    locationLat: 30.5990, locationLng: -96.3140,
    locationDetails: "1700 General Pkwy, College Station",
    cost: "30% off bays",
    priceInfo: "30% off bay rentals with student ID",
    isDeal: true,
    dealExpiresAt: daysFromNow(2, 23),
    traitNovelty: 0.4, traitIntensity: 0.5, traitCozy: 0.3, traitStrategy: 0.3, traitSocial: 0.8, traitCreativity: 0.2, traitNostalgia: 0.3, traitAdventure: 0.5,
  },
  {
    title: "Study Group - ECEN 350 Midterm Prep",
    description: "Group study session for ECEN 350 midterm. We'll go through past exams and work problems together. Bring your notes and laptop. Snacks provided.",
    category: "study",
    location: "Evans Library",
    dateTime: daysFromNow(1, 14),
    imageUrl: "/event-hackathon",
    tags: ["study", "engineering", "midterm", "campus"],
    organizerName: "Student-organized",
    creatorId: "seed-colin",
    creatorName: "Colin Weis",
    contactInfo: "colin.weis@tamu.edu",
    attendeeCount: 12,
    locationLat: TAMU_LAT, locationLng: TAMU_LNG,
    locationDetails: "Evans Library, Group Study Room 204",
    cost: "free",
    traitNovelty: 0.2, traitIntensity: 0.6, traitCozy: 0.5, traitStrategy: 0.9, traitSocial: 0.6, traitCreativity: 0.3, traitNostalgia: 0.2, traitAdventure: 0.1,
  },
  {
    title: "Aggie Baseball Watch Party",
    description: "Watch the Aggies take on LSU at the big screen setup in the MSC. Free popcorn and drinks. Wear your maroon! Rain or shine, we're inside.",
    category: "campus",
    location: "MSC Flag Room",
    dateTime: daysFromNow(2, 18),
    imageUrl: "/event-basketball",
    tags: ["sports", "watch_party", "aggie", "campus"],
    organizerName: "MSC Student Programs",
    creatorName: "MSC Student Programs",
    contactInfo: "mscprograms@tamu.edu",
    attendeeCount: 120,
    locationLat: TAMU_LAT, locationLng: TAMU_LNG,
    locationDetails: "MSC Flag Room, big screen setup",
    cost: "free",
    traitNovelty: 0.3, traitIntensity: 0.7, traitCozy: 0.4, traitStrategy: 0.2, traitSocial: 0.9, traitCreativity: 0.1, traitNostalgia: 0.8, traitAdventure: 0.4,
  },
  {
    title: "Bryan Amphitheater Indie Concert",
    description: "Local indie bands playing a free outdoor show at the Bryan amphitheater. Food trucks on site. Bring a blanket. Doors open at 6pm, music starts at 7pm.",
    category: "shows",
    location: "Grand Stafford Theater Area",
    dateTime: daysFromNow(3, 19),
    imageUrl: "/event-concert",
    tags: ["concert", "music", "indie", "live_music"],
    organizerName: "Bryan Arts Council",
    creatorName: "Bryan Arts Council",
    contactInfo: "events@bryanarts.org",
    attendeeCount: 200,
    locationLat: 30.6744, locationLng: -96.3700,
    locationDetails: "Downtown Bryan Amphitheater",
    cost: "free",
    traitNovelty: 0.7, traitIntensity: 0.5, traitCozy: 0.4, traitStrategy: 0.1, traitSocial: 0.7, traitCreativity: 0.8, traitNostalgia: 0.5, traitAdventure: 0.6,
  },
  {
    title: "Campus Thrift Pop-Up",
    description: "Student-run thrift sale in the MSC hallway. Clothes, books, dorm decor, and more. All items $1-$10. Proceeds go to Aggie Replant. Bring cash or Venmo.",
    category: "campus",
    location: "MSC Hallway",
    dateTime: daysFromNow(2, 10),
    imageUrl: "/event-festival",
    tags: ["thrift", "shopping", "campus", "sustainable"],
    organizerName: "Aggie Replant",
    creatorId: "seed-devon",
    creatorName: "Devon Leerssen",
    contactInfo: "aggiereplant@tamu.edu",
    attendeeCount: 60,
    locationLat: TAMU_LAT, locationLng: TAMU_LNG,
    locationDetails: "MSC 1st Floor Hallway, near bookstore",
    cost: "$1-$10 items",
    priceInfo: "All items $1-$10",
    traitNovelty: 0.5, traitIntensity: 0.2, traitCozy: 0.6, traitStrategy: 0.2, traitSocial: 0.7, traitCreativity: 0.5, traitNostalgia: 0.4, traitAdventure: 0.3,
  },
  {
    title: "Chipotle BOGO Tuesday",
    description: "Buy one get one free entrees at Chipotle on Texas Ave. Just show this event on your phone at checkout. Valid for dine-in or takeout only.",
    category: "deals",
    location: "Chipotle - Texas Ave",
    dateTime: daysFromNow(1, 11),
    imageUrl: "/event-festival",
    tags: ["deal", "food", "BOGO", "student_discount"],
    organizerName: "Chipotle",
    creatorName: "Chipotle College Station",
    contactInfo: null,
    attendeeCount: 300,
    locationLat: 30.6130, locationLng: -96.3310,
    locationDetails: "840 Texas Ave S",
    cost: "BOGO",
    priceInfo: "Buy one get one free entree",
    isDeal: true,
    dealExpiresAt: daysFromNow(1, 22),
    traitNovelty: 0.2, traitIntensity: 0.2, traitCozy: 0.7, traitStrategy: 0.1, traitSocial: 0.4, traitCreativity: 0.1, traitNostalgia: 0.5, traitAdventure: 0.2,
  },
  {
    title: "Open Mic Night at Sweet Eugene's",
    description: "Perform or watch at the best coffee shop open mic in BCS. Poetry, comedy, acoustic music - all welcome. Sign up starts at 7pm. Free entry with any purchase.",
    category: "shows",
    location: "Sweet Eugene's Coffee",
    dateTime: daysFromNow(4, 19),
    imageUrl: "/event-concert",
    tags: ["music", "comedy", "open_mic", "coffee"],
    organizerName: "Sweet Eugene's",
    creatorName: "Sweet Eugene's Coffee",
    contactInfo: "info@sweeteugenes.com",
    attendeeCount: 45,
    locationLat: 30.6218, locationLng: -96.3407,
    locationDetails: "1702 George Bush Dr",
    cost: "free with purchase",
    priceInfo: "Free entry with any drink purchase",
    traitNovelty: 0.6, traitIntensity: 0.3, traitCozy: 0.7, traitStrategy: 0.1, traitSocial: 0.7, traitCreativity: 0.9, traitNostalgia: 0.5, traitAdventure: 0.4,
  },
  {
    title: "Pickup Basketball at the Rec",
    description: "Drop-in basketball runs every Saturday morning. All skill levels. We divide teams on the spot. Come get some exercise and meet people.",
    category: "campus",
    location: "Student Rec Center",
    dateTime: daysFromNow(3, 10),
    imageUrl: "/event-basketball",
    tags: ["basketball", "sports", "pickup", "fitness"],
    organizerName: "Student-organized",
    creatorId: "seed-colin",
    creatorName: "Colin Weis",
    contactInfo: "colin.weis@tamu.edu",
    attendeeCount: 20,
    locationLat: TAMU_LAT, locationLng: TAMU_LNG,
    locationDetails: "Rec Center, Court 3",
    cost: "free",
    traitNovelty: 0.3, traitIntensity: 0.7, traitCozy: 0.1, traitStrategy: 0.5, traitSocial: 0.8, traitCreativity: 0.2, traitNostalgia: 0.4, traitAdventure: 0.5,
  },
  {
    title: "Taco Tuesday Crawl - Northgate",
    description: "Hit 3 taco spots on Northgate for $2 tacos each. Start at Fuego, then Mad Taco, then El Pollo Loco. Group meets at 6pm. First round on us if you bring 3+ friends.",
    category: "parties",
    location: "Northgate District",
    dateTime: daysFromNow(1, 18),
    imageUrl: "/event-festival",
    tags: ["food", "social", "nightlife", "northgate"],
    organizerName: "Aggie Social Crew",
    creatorId: "seed-andy",
    creatorName: "Andy Chen",
    contactInfo: "andy.chen@tamu.edu",
    attendeeCount: 35,
    locationLat: 30.6218, locationLng: -96.3407,
    locationDetails: "Meet at Fuego, Northgate",
    cost: "$2 tacos",
    priceInfo: "$2 tacos at each stop",
    isDeal: true,
    dealExpiresAt: daysFromNow(1, 23),
    traitNovelty: 0.5, traitIntensity: 0.5, traitCozy: 0.3, traitStrategy: 0.1, traitSocial: 0.9, traitCreativity: 0.3, traitNostalgia: 0.4, traitAdventure: 0.6,
  },
  {
    title: "Study Group - CSCE 221 Data Structures",
    description: "Weekly data structures study session. We work through assignments, review linked lists, trees, and graphs. All welcome. Bring your laptop.",
    category: "study",
    location: "Annenberg Presidential Conference Center",
    dateTime: daysFromNow(2, 15),
    imageUrl: "/event-hackathon",
    tags: ["study", "CS", "data_structures", "campus"],
    organizerName: "Student-organized",
    creatorId: "seed-andy",
    creatorName: "Andy Chen",
    contactInfo: "andy.chen@tamu.edu",
    attendeeCount: 8,
    locationLat: TAMU_LAT, locationLng: TAMU_LNG,
    locationDetails: "APCC, Room 110",
    cost: "free",
    traitNovelty: 0.3, traitIntensity: 0.5, traitCozy: 0.5, traitStrategy: 0.8, traitSocial: 0.5, traitCreativity: 0.4, traitNostalgia: 0.1, traitAdventure: 0.1,
  },
  {
    title: "Aggie Game Day Tailgate",
    description: "Pre-game tailgate before the Aggies football game. BBQ, cornhole, and live music. Starts 4 hours before kickoff. BYOB. Everyone welcome.",
    category: "campus",
    location: "Lot 100 Tailgate Area",
    dateTime: daysFromNow(5, 14),
    imageUrl: "/event-festival",
    tags: ["tailgate", "football", "aggie", "BBQ"],
    organizerName: "Aggie Tailgate Crew",
    creatorName: "Aggie Tailgate Crew",
    contactInfo: null,
    attendeeCount: 300,
    locationLat: TAMU_LAT, locationLng: TAMU_LNG,
    locationDetails: "Lot 100, near Kyle Field",
    cost: "free",
    traitNovelty: 0.3, traitIntensity: 0.8, traitCozy: 0.3, traitStrategy: 0.1, traitSocial: 0.95, traitCreativity: 0.2, traitNostalgia: 0.9, traitAdventure: 0.5,
  },
  {
    title: "Vintage Vinyl Pop-Up Market",
    description: "Local record collectors selling vinyl, cassettes, and vintage band tees. Live DJ spinning funk and soul all afternoon. Cash preferred.",
    category: "shows",
    location: "Downtown Bryan",
    dateTime: daysFromNow(4, 12),
    imageUrl: "/event-concert",
    tags: ["music", "vintage", "shopping", "vinyl"],
    organizerName: "BCS Vinyl Collective",
    creatorName: "BCS Vinyl Collective",
    contactInfo: "bcsvinyl@gmail.com",
    attendeeCount: 75,
    locationLat: 30.6744, locationLng: -96.3700,
    locationDetails: "Downtown Bryan, Main St between 25th and 26th",
    cost: "free entry",
    priceInfo: "Free entry, vinyl $5-$30",
    traitNovelty: 0.7, traitIntensity: 0.3, traitCozy: 0.5, traitStrategy: 0.1, traitSocial: 0.6, traitCreativity: 0.8, traitNostalgia: 0.9, traitAdventure: 0.4,
  },
  {
    title: "Yoga in the Park",
    description: "Free outdoor yoga session at Central Park. All levels welcome. Bring your own mat. Instructor-led flow and meditation. Runs rain or shine under the pavilion.",
    category: "campus",
    location: "Central Park, College Station",
    dateTime: daysFromNow(2, 8),
    imageUrl: "/event-pickleball",
    tags: ["fitness", "yoga", "wellness", "outdoor"],
    organizerName: "BCS Wellness Community",
    creatorName: "BCS Wellness Community",
    contactInfo: "bcswellness@gmail.com",
    attendeeCount: 30,
    locationLat: 30.6187, locationLng: -96.3365,
    locationDetails: "Central Park Pavilion, near playground",
    cost: "free",
    traitNovelty: 0.4, traitIntensity: 0.3, traitCozy: 0.8, traitStrategy: 0.2, traitSocial: 0.5, traitCreativity: 0.3, traitNostalgia: 0.3, traitAdventure: 0.3,
  },
  {
    title: "Karaoke Night at Ozona",
    description: "Wednesday karaoke at Ozona Bar. No cover before 10pm. Half-price apps until 9pm. Sign up for your song when you arrive. Group tables available.",
    category: "parties",
    location: "Ozona Bar & Grill",
    dateTime: daysFromNow(3, 21),
    imageUrl: "/event-concert",
    tags: ["karaoke", "nightlife", "social", "northgate"],
    organizerName: "Ozona Bar & Grill",
    creatorName: "Ozona Bar & Grill",
    contactInfo: null,
    attendeeCount: 65,
    locationLat: 30.6218, locationLng: -96.3407,
    locationDetails: "Ozona, Northgate",
    cost: "no cover before 10pm",
    priceInfo: "No cover before 10pm, half-price apps until 9pm",
    isDeal: true,
    dealExpiresAt: daysFromNow(3, 22),
    traitNovelty: 0.4, traitIntensity: 0.6, traitCozy: 0.3, traitStrategy: 0.1, traitSocial: 0.9, traitCreativity: 0.6, traitNostalgia: 0.5, traitAdventure: 0.5,
  },
  {
    title: "Hackathon Pre-Party + Team Matching",
    description: "Find your hackathon team for TAMUhack this weekend! Pizza, networking, and team formation. Solo hackers welcome. Bring your laptop and ideas.",
    category: "campus",
    location: "Zachry Engineering Building",
    dateTime: daysFromNow(4, 18),
    imageUrl: "/event-hackathon",
    tags: ["hackathon", "tech", "networking", "campus"],
    organizerName: "TAMUhack",
    creatorName: "TAMUhack Organizers",
    contactInfo: "team@tamuhack.com",
    attendeeCount: 90,
    locationLat: TAMU_LAT, locationLng: TAMU_LNG,
    locationDetails: "ZACH 350",
    cost: "free",
    signupDeadline: daysFromNow(3, 23),
    traitNovelty: 0.8, traitIntensity: 0.7, traitCozy: 0.2, traitStrategy: 0.7, traitSocial: 0.8, traitCreativity: 0.9, traitNostalgia: 0.1, traitAdventure: 0.7,
  },
  {
    title: "Sunset Paddleboard at Lake Bryan",
    description: "Paddleboard rental at sunset prices - $10/hour instead of $25. Meet at the marina at 5pm. Life jackets provided. Great for beginners.",
    category: "deals",
    location: "Lake Bryan Marina",
    dateTime: daysFromNow(5, 17),
    imageUrl: "/event-pickleball",
    tags: ["outdoor", "deal", "paddleboard", "adventure"],
    organizerName: "Lake Bryan Marina",
    creatorName: "Lake Bryan Marina",
    contactInfo: null,
    attendeeCount: 15,
    locationLat: 30.7148, locationLng: -96.4326,
    locationDetails: "Lake Bryan Marina, main dock",
    cost: "$10/hour",
    priceInfo: "$10/hour paddleboard rental (reg. $25)",
    isDeal: true,
    dealExpiresAt: daysFromNow(5, 20),
    traitNovelty: 0.6, traitIntensity: 0.5, traitCozy: 0.2, traitStrategy: 0.1, traitSocial: 0.5, traitCreativity: 0.2, traitNostalgia: 0.3, traitAdventure: 0.9,
  },
  {
    title: "BCS Farmers Market",
    description: "Saturday morning farmers market with local produce, baked goods, honey, and handmade crafts. Live acoustic music. Bring your own bags. Cash and card accepted.",
    category: "misc",
    location: "Downtown Bryan",
    dateTime: daysFromNow(0, 8),
    imageUrl: "/event-festival",
    tags: ["farmers_market", "local", "food", "community"],
    organizerName: "BCS Farmers Market Co-op",
    creatorName: "BCS Farmers Market Co-op",
    contactInfo: "farmersmarket@bryan.org",
    attendeeCount: 150,
    locationLat: 30.6744, locationLng: -96.3700,
    locationDetails: "Downtown Bryan, parking lot behind La Salle Hotel",
    cost: "free entry",
    traitNovelty: 0.4, traitIntensity: 0.2, traitCozy: 0.8, traitStrategy: 0.1, traitSocial: 0.6, traitCreativity: 0.5, traitNostalgia: 0.7, traitAdventure: 0.3,
  },
  {
    title: "Fall Festival & Pumpkin Patch",
    description: "Annual fall festival at the Brazos Valley fairgrounds. Pumpkin picking, corn maze, apple cider, hayrides, and pie-eating contest. Fun for the whole squad.",
    category: "misc",
    location: "Brazos Valley Fairgrounds",
    dateTime: daysFromNow(3, 10),
    imageUrl: "/event-festival",
    tags: ["fall", "festival", "pumpkin", "outdoor"],
    organizerName: "Brazos Valley Events",
    creatorName: "Brazos Valley Events",
    contactInfo: "events@bvcounty.org",
    attendeeCount: 500,
    locationLat: 30.6500, locationLng: -96.3800,
    locationDetails: "Brazos Valley Fairgrounds, Gate B",
    cost: "$8 admission",
    priceInfo: "$8 admission, students $5 with ID",
    isDeal: true,
    dealExpiresAt: daysFromNow(3, 20),
    traitNovelty: 0.5, traitIntensity: 0.4, traitCozy: 0.7, traitStrategy: 0.1, traitSocial: 0.8, traitCreativity: 0.4, traitNostalgia: 0.9, traitAdventure: 0.5,
  },
  {
    title: "Movie in the Park - Interstellar",
    description: "Free outdoor screening of Interstellar on a massive inflatable screen. Bring blankets, lawn chairs, and snacks. Popcorn and drinks available for purchase.",
    category: "misc",
    location: "Research Park",
    dateTime: daysFromNow(4, 20),
    imageUrl: "/event-concert",
    tags: ["movie", "outdoor", "free", "social"],
    organizerName: "CS Parks & Rec",
    creatorName: "CS Parks & Rec",
    contactInfo: "parks@cstx.gov",
    attendeeCount: 200,
    locationLat: TAMU_LAT, locationLng: TAMU_LNG,
    locationDetails: "Research Park, main lawn area",
    cost: "free",
    traitNovelty: 0.4, traitIntensity: 0.3, traitCozy: 0.9, traitStrategy: 0.1, traitSocial: 0.7, traitCreativity: 0.5, traitNostalgia: 0.8, traitAdventure: 0.3,
  },
  {
    title: "Aggie Charity 5K Run",
    description: "Annual charity 5K benefiting local food bank. Run or walk. T-shirt included with registration. Post-race pancake breakfast. All fitness levels welcome.",
    category: "misc",
    location: "Kyle Field Parking",
    dateTime: daysFromNow(5, 7),
    imageUrl: "/event-pickleball",
    tags: ["charity", "running", "fitness", "community"],
    organizerName: "Aggies Give Back",
    creatorName: "Aggies Give Back",
    contactInfo: "giveback@tamu.edu",
    attendeeCount: 350,
    locationLat: TAMU_LAT, locationLng: TAMU_LNG,
    locationDetails: "Kyle Field, Lot 74 start line",
    cost: "$25 registration",
    priceInfo: "$25 registration includes t-shirt + pancake breakfast",
    traitNovelty: 0.3, traitIntensity: 0.7, traitCozy: 0.2, traitStrategy: 0.2, traitSocial: 0.8, traitCreativity: 0.2, traitNostalgia: 0.5, traitAdventure: 0.6,
  },
  {
    title: "First Friday Art Walk",
    description: "Monthly art walk through downtown Bryan galleries. Meet local artists, see new exhibitions, enjoy live music and street performers. Wine and cheese at select galleries.",
    category: "misc",
    location: "Downtown Bryan",
    dateTime: daysFromNow(6, 17),
    imageUrl: "/event-concert",
    tags: ["art", "gallery", "culture", "social"],
    organizerName: "Bryan Arts District",
    creatorName: "Bryan Arts District",
    contactInfo: "artwalk@bryanarts.org",
    attendeeCount: 100,
    locationLat: 30.6744, locationLng: -96.3700,
    locationDetails: "Start at Bryan Arts Center, 200 E Villa Maria Rd",
    cost: "free",
    traitNovelty: 0.7, traitIntensity: 0.2, traitCozy: 0.6, traitStrategy: 0.1, traitSocial: 0.6, traitCreativity: 0.95, traitNostalgia: 0.5, traitAdventure: 0.4,
  },
  {
    title: "Bubble Tea & Board Games Pop-Up",
    description: "Free bubble tea tasting from 6 local vendors plus board games. Try taro, matcha, brown sugar boba, and more. Bring friends or meet new ones over Catan and Codenames.",
    category: "misc",
    location: "MSC Flag Room",
    dateTime: daysFromNow(2, 14),
    imageUrl: "/event-festival",
    tags: ["food", "games", "social", "free"],
    organizerName: "TAMU Asian Student Association",
    creatorName: "TAMU Asian Student Association",
    contactInfo: "asa@tamu.edu",
    attendeeCount: 80,
    locationLat: TAMU_LAT, locationLng: TAMU_LNG,
    locationDetails: "MSC Flag Room, 2nd floor",
    cost: "free",
    traitNovelty: 0.6, traitIntensity: 0.2, traitCozy: 0.8, traitStrategy: 0.5, traitSocial: 0.9, traitCreativity: 0.4, traitNostalgia: 0.5, traitAdventure: 0.3,
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
