import { subjectsColors } from "@/constants";
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export const getSubjectColor = (subject: string) => {
  return subjectsColors[subject as keyof typeof subjectsColors];
};

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
