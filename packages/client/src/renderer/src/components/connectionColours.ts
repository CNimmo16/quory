import type { ConnectionColour } from "../../../shared/connectionColour";

export const connectionColours: Record<
  ConnectionColour,
  { label: string; dot: string; badge: string }
> = {
  teal: {
    label: "Teal",
    dot: "bg-connection-1",
    badge:
      "border-connection-1/30 bg-connection-1/10 text-foreground hover:bg-connection-1/20",
  },
  blue: {
    label: "Blue",
    dot: "bg-connection-2",
    badge:
      "border-connection-2/30 bg-connection-2/10 text-foreground hover:bg-connection-2/20",
  },
  indigo: {
    label: "Indigo",
    dot: "bg-connection-3",
    badge:
      "border-connection-3/30 bg-connection-3/10 text-foreground hover:bg-connection-3/20",
  },
  violet: {
    label: "Violet",
    dot: "bg-connection-4",
    badge:
      "border-connection-4/30 bg-connection-4/10 text-foreground hover:bg-connection-4/20",
  },
  pink: {
    label: "Pink",
    dot: "bg-connection-5",
    badge:
      "border-connection-5/30 bg-connection-5/10 text-foreground hover:bg-connection-5/20",
  },
  red: {
    label: "Red",
    dot: "bg-connection-6",
    badge:
      "border-connection-6/30 bg-connection-6/10 text-foreground hover:bg-connection-6/20",
  },
  orange: {
    label: "Orange",
    dot: "bg-connection-7",
    badge:
      "border-connection-7/30 bg-connection-7/10 text-foreground hover:bg-connection-7/20",
  },
  amber: {
    label: "Amber",
    dot: "bg-connection-8",
    badge:
      "border-connection-8/30 bg-connection-8/10 text-foreground hover:bg-connection-8/20",
  },
  green: {
    label: "Green",
    dot: "bg-connection-9",
    badge:
      "border-connection-9/30 bg-connection-9/10 text-foreground hover:bg-connection-9/20",
  },
  slate: {
    label: "Slate",
    dot: "bg-connection-10",
    badge:
      "border-connection-10/30 bg-connection-10/10 text-foreground hover:bg-connection-10/20",
  },
};
