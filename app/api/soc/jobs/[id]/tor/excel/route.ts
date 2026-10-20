import { socExcelResponse } from "@/lib/soc-excel-response";
import { downloadTorMatchExcel } from "@/lib/soc-tor-excel";

export const runtime = "nodejs";

// The job's TOR Match as Excel: the counts per outcome, then every line but
// ตรง. Any user who may open the job may download it; every download is
// audited. 409 while no TOR is attached or it is still being read.
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  return socExcelResponse(context, downloadTorMatchExcel);
}
