import { Clerk } from "@clerk/clerk-js";
import { clerkDarkTheme } from "./clerk-dark-theme.js";
import { VITE_CLERK_PUBLISHABLE_KEY } from "../config/constants.js";

const clerk = new Clerk(VITE_CLERK_PUBLISHABLE_KEY);

export async function initClerk() {
  await clerk.load({
    appearance: clerkDarkTheme,
  });
  return clerk;
}

export function getClerk() {
    return clerk;
}
