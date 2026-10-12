import { NextResponse } from "next/server";
import { authorizeSocJob, socErrorStatus } from "@/lib/soc";
import { jobSocDocument, readJobSoc } from "@/lib/soc-import";

export const runtime = "nodejs";

// The image in the TOR cell of an Image Row (`row`, with `?item=` as the
// review page has them), read out of the job's stored SOC file for the review
// page (soc-image-rows ticket 06). Whoever may open the job may see it.
// A row that isn't an Image Row answers 404 and an image a browser can't show
// 415, each with a Thai message the page shows.
// Not audited per image: looking at the SOC while reviewing isn't a download.
export async function GET(request: Request, context: { params: Promise<{ id: string; row: string }> }) {
  try {
    const { id, row } = await context.params;
    await authorizeSocJob(id);
    const item = new URL(request.url).searchParams.get("item") ?? "";
    const soc = /^\d{1,6}$/.test(row) ? await readJobSoc(await jobSocDocument(id)) : null;
    const image = soc?.rowImage(Number(row), item);
    if (!image) return NextResponse.json({ error: "ไม่พบรูปของแถวนี้ในไฟล์ SOC" }, { status: 404 });
    if (!image.mimeType) return NextResponse.json({ error: `รูปของแถวนี้ (${image.name}) เป็นชนิดที่แสดงบนเว็บไม่ได้ กรุณาเปิดไฟล์ SOC เพื่อดูรูป` }, { status: 415 });
    return new NextResponse(Buffer.from(image.data), {
      headers: {
        "Content-Type": image.mimeType,
        // The stored SOC never changes; private keeps the image off shared
        // caches, and 5 minutes bounds how long a revoked user still sees it.
        "Cache-Control": "private, max-age=300",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const status = socErrorStatus(error instanceof Error ? error.message : "");
    if (status === 401) return NextResponse.json({ error: "กรุณาเข้าสู่ระบบ" }, { status });
    if (status === 403) return NextResponse.json({ error: "ไม่มีสิทธิ์ใช้งาน SOC" }, { status });
    if (status === 404) return NextResponse.json({ error: "ไม่พบงานตรวจ" }, { status });
    return NextResponse.json({ error: "แสดงรูปไม่สำเร็จ" }, { status: 500 });
  }
}
