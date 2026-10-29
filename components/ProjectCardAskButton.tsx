"use client";

import { useFormStatus } from "react-dom";
import Button from "@/components/ui/Button";

// ถามด้วยประโยค's submit button: while the question is being translated
// (about 5–10 s) it says so and can't be pressed again.
export default function ProjectCardAskButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="dark" className="h-[52px]" disabled={pending} aria-busy={pending}>
      {pending ? "กำลังแปลคำถาม…" : label}
    </Button>
  );
}
