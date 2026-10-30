"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useConfirmDialog, type Choice } from "@/components/ConfirmDialog";

// Whether the viewer has a SOC Runner of their own: without one, what they ask
// goes to รอคนรับ (ADR 0013). Provided by the job page.
export const ViewerHasRunner = createContext(true);

export const POOL_NOTE = "คำขอนี้จะไปอยู่ที่ รอคนรับ เพื่อนที่มี SOC Runner จะมารับไปตรวจด้วยโควตา Claude ของเขาเอง ยกเลิกได้ทุกเมื่อก่อนเริ่มตรวจ";

export const ASK_OTHERS = "ขอให้คนอื่นตรวจแทน";

type Question = { title: string; message: string; confirmLabel: string };

// The question before AI work is asked: with a Runner of their own the viewer
// may still pick ขอให้คนอื่นตรวจแทน (their quota is out); without one it can
// only go to รอคนรับ. Answers { toPool } or null for cancel.
export function useCheckChoice(): [dialog: ReactNode, decide: (question: Question) => Promise<{ toPool: boolean } | null>] {
  const hasRunner = useContext(ViewerHasRunner);
  const [dialog, confirm, choose] = useConfirmDialog();
  async function decide(question: Question) {
    if (!hasRunner) return (await confirm({ ...question, message: POOL_NOTE, confirmLabel: "ส่งไปรอคนรับ" })) ? { toPool: true } : null;
    const choice: Choice | null = await choose({ ...question, alternateLabel: ASK_OTHERS });
    return choice ? { toPool: choice === "alternate" } : null;
  }
  return [dialog, decide];
}
