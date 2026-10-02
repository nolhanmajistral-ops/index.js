"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function useRedirectOnSuccess(state: { redirectTo?: string }) {
  const router = useRouter();
  useEffect(() => {
    if (state.redirectTo) router.push(state.redirectTo);
  }, [state, router]);
}
