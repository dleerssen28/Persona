import clubIeee from "@/assets/images/club-ieee.jpg";
import clubCoding from "@/assets/images/club-coding.jpg";
import clubCybersecurity from "@/assets/images/club-cybersecurity.jpg";
import clubPremed from "@/assets/images/club-premed.jpg";
import clubResearch from "@/assets/images/club-research.jpg";
import clubAiml from "@/assets/images/club-aiml.jpg";
import clubBusiness from "@/assets/images/club-business.jpg";
import clubSwe from "@/assets/images/club-swe.jpg";
import clubPhilosophy from "@/assets/images/club-philosophy.jpg";
import clubRocketry from "@/assets/images/club-rocketry.jpg";
import clubConsulting from "@/assets/images/club-consulting.jpg";
import clubEntrepreneurship from "@/assets/images/club-entrepreneurship.jpg";
import clubFinance from "@/assets/images/club-finance.jpg";
import clubNsbe from "@/assets/images/club-nsbe.jpg";
import clubProduct from "@/assets/images/club-product.jpg";
import clubWib from "@/assets/images/club-wib.jpg";
import clubDesign from "@/assets/images/club-design.jpg";
import clubSupplychain from "@/assets/images/club-supplychain.jpg";
import clubPrelaw from "@/assets/images/club-prelaw.jpg";
import clubDatscience from "@/assets/images/club-datascience.jpg";
import clubFilm from "@/assets/images/club-film.jpg";
import clubKorean from "@/assets/images/club-korean.jpg";
import clubGaming from "@/assets/images/club-gaming.jpg";
import clubOutdoors from "@/assets/images/club-outdoors.jpg";
import clubCooking from "@/assets/images/club-cooking.jpg";
import clubBoardgames from "@/assets/images/club-boardgames.jpg";
import clubSouthasian from "@/assets/images/club-southasian.jpg";
import clubMusic from "@/assets/images/club-music.jpg";
import clubPhotography from "@/assets/images/club-photography.jpg";
import clubDance from "@/assets/images/club-dance.jpg";
import clubSoccer from "@/assets/images/club-soccer.jpg";
import clubClimbing from "@/assets/images/club-climbing.jpg";
import clubBasketball from "@/assets/images/club-basketball.jpg";
import clubRunning from "@/assets/images/club-running.jpg";
import clubPickleball from "@/assets/images/club-pickleball.jpg";
import clubVolleyball from "@/assets/images/club-volleyball.jpg";
import clubMartialarts from "@/assets/images/club-martialarts.jpg";
import clubTennis from "@/assets/images/club-tennis.jpg";
import clubFrisbee from "@/assets/images/club-frisbee.jpg";
import clubSwimming from "@/assets/images/club-swimming.jpg";
import clubHabitat from "@/assets/images/club-habitat.jpg";
import clubBigevent from "@/assets/images/club-bigevent.jpg";
import clubCampkesem from "@/assets/images/club-campkesem.jpg";
import clubTutoring from "@/assets/images/club-tutoring.jpg";
import clubEwb from "@/assets/images/club-ewb.jpg";
import clubAnimalrescue from "@/assets/images/club-animalrescue.jpg";
import clubGlobalhealth from "@/assets/images/club-globalhealth.jpg";
import clubFoodrecovery from "@/assets/images/club-foodrecovery.jpg";
import clubThon from "@/assets/images/club-thon.jpg";
import clubSustainability from "@/assets/images/club-sustainability.jpg";

const CLUB_IMAGE_MAP: Record<string, string> = {
  "/club-ieee": clubIeee,
  "/club-coding": clubCoding,
  "/club-cybersecurity": clubCybersecurity,
  "/club-premed": clubPremed,
  "/club-research": clubResearch,
  "/club-aiml": clubAiml,
  "/club-business": clubBusiness,
  "/club-swe": clubSwe,
  "/club-philosophy": clubPhilosophy,
  "/club-rocketry": clubRocketry,
  "/club-consulting": clubConsulting,
  "/club-entrepreneurship": clubEntrepreneurship,
  "/club-finance": clubFinance,
  "/club-nsbe": clubNsbe,
  "/club-product": clubProduct,
  "/club-wib": clubWib,
  "/club-design": clubDesign,
  "/club-supplychain": clubSupplychain,
  "/club-prelaw": clubPrelaw,
  "/club-datascience": clubDatscience,
  "/club-film": clubFilm,
  "/club-korean": clubKorean,
  "/club-gaming": clubGaming,
  "/club-outdoors": clubOutdoors,
  "/club-cooking": clubCooking,
  "/club-boardgames": clubBoardgames,
  "/club-southasian": clubSouthasian,
  "/club-music": clubMusic,
  "/club-photography": clubPhotography,
  "/club-dance": clubDance,
  "/club-soccer": clubSoccer,
  "/club-climbing": clubClimbing,
  "/club-basketball": clubBasketball,
  "/club-running": clubRunning,
  "/club-pickleball": clubPickleball,
  "/club-volleyball": clubVolleyball,
  "/club-martialarts": clubMartialarts,
  "/club-tennis": clubTennis,
  "/club-frisbee": clubFrisbee,
  "/club-swimming": clubSwimming,
  "/club-habitat": clubHabitat,
  "/club-bigevent": clubBigevent,
  "/club-campkesem": clubCampkesem,
  "/club-tutoring": clubTutoring,
  "/club-ewb": clubEwb,
  "/club-animalrescue": clubAnimalrescue,
  "/club-globalhealth": clubGlobalhealth,
  "/club-foodrecovery": clubFoodrecovery,
  "/club-thon": clubThon,
  "/club-sustainability": clubSustainability,
};

export function getClubImage(imageUrl: string | null): string {
  if (!imageUrl) return clubCoding;
  return CLUB_IMAGE_MAP[imageUrl] || clubCoding;
}
