import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

/**
 * Locale-bevidste navigation-API'er. Brug `Link` herfra i stedet for
 * next/link — så tilføjes sprogpræfikset automatisk, og `usePathname`
 * returnerer stien UDEN præfikset (praktisk til active-states og
 * sprogskift, der bevarer den aktuelle side).
 */
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);