import itemInterstellar from "@/assets/images/item-interstellar.jpg";
import itemDarkKnight from "@/assets/images/item-dark-knight.jpg";
import itemSpiritedAway from "@/assets/images/item-spirited-away.jpg";
import itemInception from "@/assets/images/item-inception.jpg";
import itemGrandBudapest from "@/assets/images/item-grand-budapest.jpg";
import itemParasite from "@/assets/images/item-parasite.jpg";
import itemLotr from "@/assets/images/item-lotr.jpg";
import itemPulpFiction from "@/assets/images/item-pulp-fiction.jpg";
import itemMatrix from "@/assets/images/item-matrix.jpg";
import itemUp from "@/assets/images/item-up.jpg";
import itemMadMax from "@/assets/images/item-mad-max.jpg";
import itemLaLaLand from "@/assets/images/item-la-la-land.jpg";
import itemAvengers from "@/assets/images/item-avengers.jpg";
import itemBladeRunner from "@/assets/images/item-blade-runner.jpg";
import itemEverythingEverywhere from "@/assets/images/item-everything-everywhere.jpg";
import itemShawshank from "@/assets/images/item-shawshank.jpg";

import itemIndie from "@/assets/images/item-indie.jpg";
import itemEdm from "@/assets/images/item-edm.jpg";
import itemClassical from "@/assets/images/item-classical.jpg";
import itemJazz from "@/assets/images/item-jazz.jpg";
import itemLofi from "@/assets/images/item-lofi.jpg";
import itemHiphop from "@/assets/images/item-hiphop.jpg";
import itemRock from "@/assets/images/item-rock.jpg";
import itemPop from "@/assets/images/item-pop.jpg";
import itemRnb from "@/assets/images/item-rnb.jpg";
import itemKpop from "@/assets/images/item-kpop.jpg";
import itemCountry from "@/assets/images/item-country.jpg";
import itemReggae from "@/assets/images/item-reggae.jpg";
import itemSynthwave from "@/assets/images/item-synthwave.jpg";
import itemLatin from "@/assets/images/item-latin.jpg";
import itemFilmScores from "@/assets/images/item-film-scores.jpg";
import itemPunk from "@/assets/images/item-punk.jpg";

import itemRpg from "@/assets/images/item-rpg.jpg";
import itemFps from "@/assets/images/item-fps.jpg";
import itemStrategy from "@/assets/images/item-strategy.jpg";
import itemCozySims from "@/assets/images/item-cozy-sims.jpg";
import itemIndiePuzzle from "@/assets/images/item-indie-puzzle.jpg";
import itemSurvival from "@/assets/images/item-survival.jpg";
import itemBattleRoyale from "@/assets/images/item-battle-royale.jpg";
import itemNarrative from "@/assets/images/item-narrative.jpg";
import itemRacing from "@/assets/images/item-racing.jpg";
import itemRetroArcade from "@/assets/images/item-retro-arcade.jpg";
import itemMmo from "@/assets/images/item-mmo.jpg";
import itemSandbox from "@/assets/images/item-sandbox.jpg";
import itemHorror from "@/assets/images/item-horror.jpg";
import itemParty from "@/assets/images/item-party.jpg";

import itemJapanese from "@/assets/images/item-japanese.jpg";
import itemItalian from "@/assets/images/item-italian.jpg";
import itemSpicyThai from "@/assets/images/item-spicy-thai.jpg";
import itemStreetFood from "@/assets/images/item-street-food.jpg";
import itemVegan from "@/assets/images/item-vegan.jpg";
import itemBbq from "@/assets/images/item-bbq.jpg";
import itemKorean from "@/assets/images/item-korean.jpg";
import itemBakery from "@/assets/images/item-bakery.jpg";
import itemFrench from "@/assets/images/item-french.jpg";
import itemMexican from "@/assets/images/item-mexican.jpg";
import itemMediterranean from "@/assets/images/item-mediterranean.jpg";
import itemSushi from "@/assets/images/item-sushi.jpg";
import itemChinese from "@/assets/images/item-chinese.jpg";
import itemBrunch from "@/assets/images/item-brunch.jpg";

const ITEM_IMAGES: Record<string, string> = {
  "Interstellar": itemInterstellar,
  "The Dark Knight": itemDarkKnight,
  "Spirited Away": itemSpiritedAway,
  "Inception": itemInception,
  "The Grand Budapest Hotel": itemGrandBudapest,
  "Parasite": itemParasite,
  "Lord of the Rings": itemLotr,
  "Pulp Fiction": itemPulpFiction,
  "The Matrix": itemMatrix,
  "Up": itemUp,
  "Mad Max: Fury Road": itemMadMax,
  "La La Land": itemLaLaLand,
  "Avengers: Endgame": itemAvengers,
  "Blade Runner 2049": itemBladeRunner,
  "Everything Everywhere All at Once": itemEverythingEverywhere,
  "The Shawshank Redemption": itemShawshank,

  "Indie / Alternative": itemIndie,
  "Electronic / EDM": itemEdm,
  "Classical / Orchestral": itemClassical,
  "Jazz / Blues": itemJazz,
  "Lo-fi / Ambient": itemLofi,
  "Hip Hop / Rap": itemHiphop,
  "Rock / Metal": itemRock,
  "Pop / Top 40": itemPop,
  "R&B / Soul": itemRnb,
  "K-Pop": itemKpop,
  "Country / Folk": itemCountry,
  "Reggae / Dancehall": itemReggae,
  "Synthwave / Retrowave": itemSynthwave,
  "Latin / Reggaeton": itemLatin,
  "Film Scores / Soundtracks": itemFilmScores,
  "Punk / Ska": itemPunk,

  "Open World RPGs": itemRpg,
  "Competitive FPS": itemFps,
  "Strategy / 4X": itemStrategy,
  "Cozy Sims": itemCozySims,
  "Indie / Puzzle": itemIndiePuzzle,
  "Survival / Crafting": itemSurvival,
  "Battle Royale": itemBattleRoyale,
  "Story-Driven / Narrative": itemNarrative,
  "Racing / Sports": itemRacing,
  "Retro / Classic Arcade": itemRetroArcade,
  "MMO / Social RPG": itemMmo,
  "Sandbox / Creative": itemSandbox,
  "Horror / Thriller": itemHorror,
  "Party / Co-op": itemParty,

  "Japanese Cuisine": itemJapanese,
  "Italian Comfort": itemItalian,
  "Spicy Thai / Indian": itemSpicyThai,
  "Street Food Culture": itemStreetFood,
  "Plant-Based / Vegan": itemVegan,
  "BBQ & Grilling": itemBbq,
  "Korean Food": itemKorean,
  "Bakery & Pastry": itemBakery,
  "French Fine Dining": itemFrench,
  "Mexican / Tex-Mex": itemMexican,
  "Mediterranean": itemMediterranean,
  "Sushi & Sashimi": itemSushi,
  "Chinese Cuisine": itemChinese,
  "Brunch & Breakfast": itemBrunch,
};

export function getItemImage(title: string): string | undefined {
  return ITEM_IMAGES[title];
}
