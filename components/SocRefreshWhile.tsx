"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Refreshes the server-rendered page every few seconds while `active` (a read
// going on in the background), so its progress shows without a reload.
export default function SocRefreshWhile({ active, every = 5000 }: { active: boolean; every?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => router.refresh(), every);
    return () => window.clearInterval(timer);
  }, [active, every, router]);
  return null;
}
