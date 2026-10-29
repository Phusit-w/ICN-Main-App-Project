// What the Proposal file routes (TOR, SOC Versions) answer, shared so they
// refuse and serve the same way.
import { NextResponse } from "next/server";
import { OCR_CONFIRM_REQUIRED, socErrorStatus } from "@/lib/soc";

// An upload route's failure. A scanned file that needs the uploader's OCR
// confirm is answered 409 + needsOcrConfirm (the form asks, then sends again).
// A message for the user is Thai; anything else is a fault, logged and shown plainly.
export function uploadFailure(error: unknown, { what, ocrConfirm, fallback }: { what: string; ocrConfirm: string; fallback: string }) {
  const message = error instanceof Error ? error.message : "";
  if (message === OCR_CONFIRM_REQUIRED) return NextResponse.json({ error: ocrConfirm, needsOcrConfirm: true }, { status: 409 });
  const status = socErrorStatus(message);
  const forUser = /[฀-๿]/.test(message);
  if (status === 400 && !forUser) console.error(`${what} failed`, error);
  return NextResponse.json({ error: status === 404 ? "ไม่พบ Proposal" : forUser ? message : fallback }, { status });
}

// A stored file for the browser. A file picked with its folder is named
// "folder/file.pdf"; the browser gets the file name only.
export function fileResponse(bytes: Uint8Array, { mimeType, name, disposition }: { mimeType: string; name: string; disposition: "inline" | "attachment" }) {
  const safeName = (name.split("/").pop() || "file").replace(/[\r\n"]/g, "_");
  return new NextResponse(bytes as BodyInit, {
    headers: {
      "Content-Type": mimeType,
      "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(safeName)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

// A download route's failure: 401 when signed out, otherwise not found.
export function downloadFailure(error: unknown) {
  const unauthorized = error instanceof Error && error.message === "UNAUTHORIZED";
  return new NextResponse(unauthorized ? "Unauthorized" : "Not found", { status: unauthorized ? 401 : 404 });
}
