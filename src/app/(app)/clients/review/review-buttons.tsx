"use client";

import { useTransition } from "react";
import { decideReviewAction } from "../actions";

export function ReviewButtons({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <div className="mt-4 flex gap-2">
      <button disabled={pending} className="btn-primary" onClick={() => start(() => void decideReviewAction(id, "MERGE"))}>Fusionner</button>
      <button disabled={pending} className="btn-ghost" onClick={() => start(() => void decideReviewAction(id, "IGNORE"))}>Ignorer</button>
    </div>
  );
}
