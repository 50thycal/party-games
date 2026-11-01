import type { Location } from "./geography";

export type Landmark = Location & {
  id: string;
  region: "us" | "world";
  area: string;
  source: string;
};

export const ORIGINS: Location[] = [
  { name: "Santa Fe, New Mexico", latitude: 35.68698, longitude: -105.9378 },
  { name: "Kansas City, Missouri", latitude: 39.0997, longitude: -94.5786 },
  { name: "New York City", latitude: 40.7128, longitude: -74.006 },
  { name: "London, England", latitude: 51.5074, longitude: -0.1278 },
  { name: "Tokyo, Japan", latitude: 35.6762, longitude: 139.6503 },
  { name: "Sydney, Australia", latitude: -33.8688, longitude: 151.2093 },
];

// Fixed landmark reference points, not city centers. Small differences between
// overlooks/entrances do not materially affect distant bearings. Links expose the
// reference so a later catalog correction is reviewable.
export const LANDMARKS: Landmark[] = [
  { id: "rushmore", name: "Mount Rushmore", area: "South Dakota", latitude: 43.87889, longitude: -103.45917, region: "us", source: "https://www.nps.gov/moru/planyourvisit/gps.htm" },
  { id: "empire-state", name: "Empire State Building", area: "New York City", latitude: 40.7483, longitude: -73.9856, region: "us", source: "https://en.wikipedia.org/wiki/Empire_State_Building" },
  { id: "alamo", name: "The Alamo", area: "San Antonio, Texas", latitude: 29.426031, longitude: -98.486153, region: "us", source: "https://www.nps.gov/subjects/travelspanishmissions/mission-san-antonio-de-valero-the-alamo.htm" },
  { id: "bourbon-street", name: "Bourbon Street", area: "New Orleans, Louisiana", latitude: 29.959021, longitude: -90.065285, region: "us", source: "https://www.latlong.net/place/bourbon-street-new-orleans-la-usa-26245.html" },
  { id: "niagara", name: "Niagara Falls", area: "Horseshoe Falls, US–Canada border", latitude: 43.0772222, longitude: -79.0752778, region: "us", source: "https://geonames.nrcan.gc.ca/search-place-names/unique?id=FBOXL" },
  { id: "golden-gate", name: "Golden Gate Bridge", area: "San Francisco, California", latitude: 37.8199, longitude: -122.4783, region: "us", source: "https://en.wikipedia.org/wiki/Golden_Gate_Bridge" },
  { id: "space-needle", name: "Space Needle", area: "Seattle, Washington", latitude: 47.6205, longitude: -122.3493, region: "us", source: "https://en.wikipedia.org/wiki/Space_Needle" },
  { id: "gateway-arch", name: "Gateway Arch", area: "St. Louis, Missouri", latitude: 38.6247, longitude: -90.1848, region: "us", source: "https://en.wikipedia.org/wiki/Gateway_Arch" },
  { id: "liberty", name: "Statue of Liberty", area: "New York Harbor", latitude: 40.6892, longitude: -74.0445, region: "us", source: "https://en.wikipedia.org/wiki/Statue_of_Liberty" },
  { id: "white-house", name: "The White House", area: "Washington, D.C.", latitude: 38.8977, longitude: -77.0365, region: "us", source: "https://en.wikipedia.org/wiki/White_House" },
  { id: "hollywood", name: "Hollywood Sign", area: "Los Angeles, California", latitude: 34.1341, longitude: -118.3215, region: "us", source: "https://en.wikipedia.org/wiki/Hollywood_Sign" },
  { id: "diamond-head", name: "Diamond Head", area: "Honolulu, Hawaii", latitude: 21.262, longitude: -157.8056, region: "us", source: "https://en.wikipedia.org/wiki/Diamond_Head,_Hawaii" },
  { id: "eiffel", name: "Eiffel Tower", area: "Paris, France", latitude: 48.8584, longitude: 2.2945, region: "world", source: "https://en.wikipedia.org/wiki/Eiffel_Tower" },
  { id: "big-ben", name: "Big Ben", area: "London, England", latitude: 51.5007, longitude: -0.1246, region: "world", source: "https://en.wikipedia.org/wiki/Big_Ben" },
  { id: "colosseum", name: "Colosseum", area: "Rome, Italy", latitude: 41.8902, longitude: 12.4922, region: "world", source: "https://en.wikipedia.org/wiki/Colosseum" },
  { id: "giza", name: "Great Pyramid of Giza", area: "Giza, Egypt", latitude: 29.9792, longitude: 31.1342, region: "world", source: "https://en.wikipedia.org/wiki/Great_Pyramid_of_Giza" },
  { id: "taj-mahal", name: "Taj Mahal", area: "Agra, India", latitude: 27.1751, longitude: 78.0421, region: "world", source: "https://en.wikipedia.org/wiki/Taj_Mahal" },
  { id: "sydney-opera", name: "Sydney Opera House", area: "Sydney, Australia", latitude: -33.8568, longitude: 151.2153, region: "world", source: "https://en.wikipedia.org/wiki/Sydney_Opera_House" },
  { id: "christ-redeemer", name: "Christ the Redeemer", area: "Rio de Janeiro, Brazil", latitude: -22.9519, longitude: -43.2105, region: "world", source: "https://en.wikipedia.org/wiki/Christ_the_Redeemer_(statue)" },
  { id: "machu-picchu", name: "Machu Picchu", area: "Peru", latitude: -13.1631, longitude: -72.545, region: "world", source: "https://en.wikipedia.org/wiki/Machu_Picchu" },
  { id: "fuji", name: "Mount Fuji", area: "Japan", latitude: 35.3606, longitude: 138.7274, region: "world", source: "https://en.wikipedia.org/wiki/Mount_Fuji" },
  { id: "burj-khalifa", name: "Burj Khalifa", area: "Dubai, UAE", latitude: 25.1972, longitude: 55.2744, region: "world", source: "https://en.wikipedia.org/wiki/Burj_Khalifa" },
  { id: "table-mountain", name: "Table Mountain", area: "Cape Town, South Africa", latitude: -33.9628, longitude: 18.4098, region: "world", source: "https://en.wikipedia.org/wiki/Table_Mountain" },
  { id: "sagrada-familia", name: "Sagrada Família", area: "Barcelona, Spain", latitude: 41.4036, longitude: 2.1744, region: "world", source: "https://en.wikipedia.org/wiki/Sagrada_Fam%C3%ADlia" },
];

export function getLandmark(id: string): Landmark | undefined {
  return LANDMARKS.find((place) => place.id === id);
}
