import eventNorthgateParty from "@/assets/images/event-northgate-party.jpg";
import eventCanesDeal from "@/assets/images/event-canes-deal.jpg";
import eventTopgolf from "@/assets/images/event-topgolf.jpg";
import eventStudyGroup from "@/assets/images/event-study-group.jpg";
import eventWatchParty from "@/assets/images/event-watch-party.jpg";
import eventIndieConcert from "@/assets/images/event-indie-concert.jpg";
import eventThrift from "@/assets/images/event-thrift.jpg";
import eventChipotle from "@/assets/images/event-chipotle.jpg";
import eventOpenMic from "@/assets/images/event-open-mic.jpg";
import eventPickupBasketball from "@/assets/images/event-pickup-basketball.jpg";
import eventTacoCrawl from "@/assets/images/event-taco-crawl.jpg";
import eventStudyCs from "@/assets/images/event-study-cs.jpg";
import eventTailgate from "@/assets/images/event-tailgate.jpg";
import eventVinylMarket from "@/assets/images/event-vinyl-market.jpg";
import eventYogaPark from "@/assets/images/event-yoga-park.jpg";
import eventKaraoke from "@/assets/images/event-karaoke.jpg";
import eventHackathonParty from "@/assets/images/event-hackathon-party.jpg";
import eventPaddleboard from "@/assets/images/event-paddleboard.jpg";
import eventFarmersMarket from "@/assets/images/event-farmers-market.jpg";
import eventFallFestival from "@/assets/images/event-fall-festival.jpg";
import eventMoviePark from "@/assets/images/event-movie-park.jpg";
import event5kRun from "@/assets/images/event-5k-run.jpg";
import eventArtWalk from "@/assets/images/event-art-walk.jpg";
import eventBobaGames from "@/assets/images/event-boba-games.jpg";

const EVENT_IMAGE_MAP: Record<string, string> = {
  "/event-northgate-party": eventNorthgateParty,
  "/event-canes-deal": eventCanesDeal,
  "/event-topgolf": eventTopgolf,
  "/event-study-group": eventStudyGroup,
  "/event-watch-party": eventWatchParty,
  "/event-indie-concert": eventIndieConcert,
  "/event-thrift": eventThrift,
  "/event-chipotle": eventChipotle,
  "/event-open-mic": eventOpenMic,
  "/event-pickup-basketball": eventPickupBasketball,
  "/event-taco-crawl": eventTacoCrawl,
  "/event-study-cs": eventStudyCs,
  "/event-tailgate": eventTailgate,
  "/event-vinyl-market": eventVinylMarket,
  "/event-yoga-park": eventYogaPark,
  "/event-karaoke": eventKaraoke,
  "/event-hackathon-party": eventHackathonParty,
  "/event-paddleboard": eventPaddleboard,
  "/event-farmers-market": eventFarmersMarket,
  "/event-fall-festival": eventFallFestival,
  "/event-movie-park": eventMoviePark,
  "/event-5k-run": event5kRun,
  "/event-art-walk": eventArtWalk,
  "/event-boba-games": eventBobaGames,
};

export function getEventImage(imageUrl: string | null): string {
  if (!imageUrl) return eventFallFestival;
  return EVENT_IMAGE_MAP[imageUrl] || eventFallFestival;
}
