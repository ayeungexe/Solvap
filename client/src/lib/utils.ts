import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function truncateAddress(address: string, size = 4) {
  if (address.length <= size * 2) return address;
  return `${address.slice(0, size)}…${address.slice(-size)}`;
}

export function formatSol(amount: number) {
  return `${amount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} SOL`;
}

export function formatDate(input: string | number | Date) {
  const date = typeof input === "string" || typeof input === "number"
    ? new Date(input)
    : input;
  return date.toLocaleString(undefined, {
    hour12: false,
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
