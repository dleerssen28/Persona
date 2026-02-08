import eventBasketball from "@/assets/images/event-basketball.jpg";
import eventConcert from "@/assets/images/event-concert.jpg";
import eventClub from "@/assets/images/event-club.jpg";
import eventMovienight from "@/assets/images/event-movienight.jpg";
import eventPickleball from "@/assets/images/event-pickleball.jpg";
import eventHackathon from "@/assets/images/event-hackathon.jpg";
import eventGamenight from "@/assets/images/event-gamenight.jpg";
import eventFestival from "@/assets/images/event-festival.jpg";

const EVENT_IMAGE_MAP: Record<string, string> = {
  "/event-basketball": eventBasketball,
  "/event-concert": eventConcert,
  "/event-club": eventClub,
  "/event-movienight": eventMovienight,
  "/event-pickleball": eventPickleball,
  "/event-hackathon": eventHackathon,
  "/event-gamenight": eventGamenight,
  "/event-festival": eventFestival,
};

export function getEventImage(imageUrl: string | null): string {
  if (!imageUrl) return eventFestival;
  return EVENT_IMAGE_MAP[imageUrl] || eventFestival;
}
