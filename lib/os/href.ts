import type { Route } from "next";

export function routeHref(path: string) {
  return path as Route;
}
