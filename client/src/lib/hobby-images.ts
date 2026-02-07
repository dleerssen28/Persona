import goKarting from "@/assets/images/hobby-gokarting.jpg";
import surfing from "@/assets/images/hobby-surfing.jpg";
import rockClimbing from "@/assets/images/hobby-rock-climbing.jpg";
import skateboarding from "@/assets/images/hobby-skateboarding.jpg";
import dronePhotography from "@/assets/images/hobby-drone.jpg";
import scubaDiving from "@/assets/images/hobby-scuba-diving.jpg";
import cooking from "@/assets/images/hobby-cooking.jpg";
import trailRunning from "@/assets/images/hobby-trail-running.jpg";
import boardGames from "@/assets/images/hobby-board-games.jpg";
import mountainBiking from "@/assets/images/hobby-mountain-biking.jpg";
import photography from "@/assets/images/hobby-photography.jpg";
import podcasting from "@/assets/images/hobby-podcasting.jpg";
import snowboarding from "@/assets/images/hobby-snowboarding.jpg";
import pottery from "@/assets/images/hobby-pottery.jpg";
import escapeRooms from "@/assets/images/hobby-escape-rooms.jpg";
import camping from "@/assets/images/hobby-camping.jpg";

const HOBBY_IMAGES: Record<string, string> = {
  "Go-Karting": goKarting,
  "Surfing": surfing,
  "Rock Climbing": rockClimbing,
  "Skateboarding": skateboarding,
  "Drone Photography": dronePhotography,
  "Scuba Diving": scubaDiving,
  "Cooking Competitions": cooking,
  "Trail Running": trailRunning,
  "Board Game Nights": boardGames,
  "Mountain Biking": mountainBiking,
  "Photography Walks": photography,
  "Podcasting": podcasting,
  "Snowboarding": snowboarding,
  "Pottery & Ceramics": pottery,
  "Escape Rooms": escapeRooms,
  "Camping & Backpacking": camping,
};

export function getHobbyImage(title: string): string | undefined {
  return HOBBY_IMAGES[title];
}
