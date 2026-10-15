import type { ConnectionColour } from "../../../shared/connectionColour";

export const connectionColours: Record<
  ConnectionColour,
  { label: string; dot: string; badge: string }
> = {
  teal: {
    label: "Teal",
    dot: "bg-teal-500",
    badge: "border-teal-200 bg-teal-50 text-teal-800 hover:bg-teal-100",
  },
  blue: {
    label: "Blue",
    dot: "bg-blue-500",
    badge: "border-blue-200 bg-blue-50 text-blue-800 hover:bg-blue-100",
  },
  indigo: {
    label: "Indigo",
    dot: "bg-indigo-500",
    badge: "border-indigo-200 bg-indigo-50 text-indigo-800 hover:bg-indigo-100",
  },
  violet: {
    label: "Violet",
    dot: "bg-violet-500",
    badge: "border-violet-200 bg-violet-50 text-violet-800 hover:bg-violet-100",
  },
  pink: {
    label: "Pink",
    dot: "bg-pink-500",
    badge: "border-pink-200 bg-pink-50 text-pink-800 hover:bg-pink-100",
  },
  red: {
    label: "Red",
    dot: "bg-red-500",
    badge: "border-red-200 bg-red-50 text-red-800 hover:bg-red-100",
  },
  orange: {
    label: "Orange",
    dot: "bg-orange-500",
    badge: "border-orange-200 bg-orange-50 text-orange-800 hover:bg-orange-100",
  },
  amber: {
    label: "Amber",
    dot: "bg-amber-500",
    badge: "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100",
  },
  green: {
    label: "Green",
    dot: "bg-green-500",
    badge: "border-green-200 bg-green-50 text-green-800 hover:bg-green-100",
  },
  slate: {
    label: "Slate",
    dot: "bg-slate-500",
    badge: "border-slate-200 bg-slate-50 text-slate-800 hover:bg-slate-100",
  },
};
