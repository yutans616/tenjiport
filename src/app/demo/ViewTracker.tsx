"use client";

import { useEffect } from "react";
import { track } from "./track";

export function ViewTracker() {
  useEffect(() => {
    track("demo_lp_view");
  }, []);
  return null;
}
