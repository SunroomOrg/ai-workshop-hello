/**
 * Subset of LEVELS from the main app — only the fields the video needs.
 * Coordinate space matches the world map SVG viewBox of 140 × 60.
 */
export interface VideoLevel {
  id: string;
  number: number;
  era: string;
  location: string;
  short: string;
  x: number;
  y: number;
  accent: string;
}

export const LEVELS: VideoLevel[] = [
  {
    id: "vietnam-1985",
    number: 1,
    era: "1985 – 1992",
    location: "Đồng Nai, Vietnam",
    short: "VIETNAM 1985",
    x: 10,
    y: 46,
    accent: "#7ed957",
  },
  {
    id: "texas-1992",
    number: 2,
    era: "1992 – 2005",
    location: "Texas, USA",
    short: "TEXAS 1992",
    x: 30,
    y: 30,
    accent: "#e8c34a",
  },
  {
    id: "austin-ut-2005",
    number: 3,
    era: "2005 – 2008",
    location: "UT Austin",
    short: "UT AUSTIN 2005",
    x: 48,
    y: 44,
    accent: "#bf5700",
  },
  {
    id: "la-2008",
    number: 4,
    era: "2008 – 2009",
    location: "Los Angeles",
    short: "LOS ANGELES 2008",
    x: 70,
    y: 26,
    accent: "#f29ac0",
  },
  {
    id: "seoul-2010",
    number: 5,
    era: "2010 – 2011",
    location: "Seoul, South Korea",
    short: "SEOUL 2010",
    x: 84,
    y: 14,
    accent: "#5fc6e6",
  },
  {
    id: "houston-2011",
    number: 6,
    era: "2011 – 2014",
    location: "Houston, TX",
    short: "HOUSTON 2011",
    x: 114,
    y: 16,
    accent: "#3a78c4",
  },
  {
    id: "austin-home-2014",
    number: 7,
    era: "2014 – present",
    location: "Austin, TX",
    short: "AUSTIN — FINAL",
    x: 122,
    y: 38,
    accent: "#bf5700",
  },
];
