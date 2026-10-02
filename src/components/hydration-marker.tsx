"use client";

import { useEffect } from "react";

/** Marque le document une fois React hydraté (utilisé par les tests E2E pour éviter les clics prématurés). */
export function HydrationMarker() {
  useEffect(() => {
    document.documentElement.dataset.hydrated = "1";
  }, []);
  return null;
}
