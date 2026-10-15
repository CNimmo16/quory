export const CONNECTION_COLOURS = [
  "teal",
  "blue",
  "indigo",
  "violet",
  "pink",
  "red",
  "orange",
  "amber",
  "green",
  "slate",
] as const;
export type ConnectionColour = (typeof CONNECTION_COLOURS)[number];
