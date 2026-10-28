// DEV ONLY: rows (item | text) of the real Apron SOC and of a draft around an item number.
// Run: node --import ./test/register.mjs .scratch/soc-builder/dev/around.ts <item e.g. ๔.๑๐.๘> [before] [after]
import { copyFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { normalItem } from "@/lib/soc-major-items";
import { readSocTable } from "@/lib/soc-table";

const D = "C:/Phusit/Claude Project/ICN Apps/Example SOC+TOR+Datasheet/4. DOAXXX_Apron_ท่าอากาศยานสุราษฎร์ธานี (Re-bidding)/Proposal A/2. ตารางเปรียบเทียบคุณลักษณะเฉพาะทางเทคนิค (Compliance Threshold)";
const short = path.resolve(".scratch/soc-builder/dev/_around.docx");
copyFileSync(`\\\\?\\${path.resolve(D, "(1)06 G1-04-T2 Technical Compliance Comparison Table Surat CASRI-0923 - v2 (Word) - fixed.docx")}`, short);
const [target, before = "4", after = "14"] = process.argv.slice(2);
for (const [label, bytes] of [["REAL", readFileSync(short)], ["DRAFT", readFileSync("C:/Phusit/soc-builder-samples/_draft-template-apron.docx")]] as const) {
  const rows = readSocTable(bytes).rows;
  const at = rows.findIndex((r) => normalItem(r.item) === normalItem(target));
  console.log(`=== ${label}: ${rows.length} rows, ${target} at row ${at + 1}`);
  rows.slice(Math.max(0, at - Number(before)), at + Number(after)).forEach((r, i) => console.log(`${Math.max(0, at - Number(before)) + i + 1}\t${r.item}\t${r.tor.slice(0, Number(process.env.W ?? 85))}`));
}
