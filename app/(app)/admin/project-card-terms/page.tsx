import { prisma } from "@/lib/prisma";
import AdminProjectCardTerms, { type AdminTerm } from "@/components/AdminProjectCardTerms";
import { isTermKind } from "@/lib/project-card-taxonomy";

// Admin Center: the Category/Tag and Work Type lists Project Cards are
// classified from (ProjectCardTerm). The admin layout already restricts
// this page to ADMIN; the actions check again.
export default async function AdminProjectCardTermsPage() {
  const terms = await prisma.projectCardTerm.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true, kind: true, value: true, en: true, th: true },
  });
  // How many cards use each entry (as Category or Tag / as a Work Type), so
  // an admin sees what a rename will touch.
  const cards = await prisma.projectCard.findMany({ select: { category: true, tags: true, workTypes: true } });
  const uses = new Map<string, number>();
  const bump = (key: string) => uses.set(key, (uses.get(key) ?? 0) + 1);
  for (const c of cards) {
    for (const v of new Set([c.category, ...c.tags].filter((v): v is string => v !== null))) bump(`category:${v}`);
    for (const v of c.workTypes) bump(`workType:${v}`);
  }
  const rows: AdminTerm[] = terms.flatMap((t) =>
    isTermKind(t.kind) ? [{ ...t, kind: t.kind, cardCount: uses.get(`${t.kind}:${t.value}`) ?? 0 }] : [],
  );

  return (
    <section className="space-y-2">
      <h2 className="font-display text-xl font-bold">หมวดหมู่และลักษณะงานของโครงการ</h2>
      <p className="text-sm text-muted">
        รายการที่ใช้จัดกลุ่มการ์ดในหน้าค้นหาโครงการ เพิ่มหรือแก้ชื่อได้ — ลบไม่ได้ เพื่อไม่ให้การ์ดที่ใช้อยู่กลายเป็นไม่มีหมวด
        แก้ชื่อแล้วการ์ดทุกใบที่ใช้รายการนั้นจะแสดงชื่อใหม่ทันที
      </p>
      <p className="text-sm text-muted">
        ช่องค้นหาจับคำจากชื่อทั้งสองภาษา — แก้ชื่อแล้วคำที่ใช้ค้นเจอจะเปลี่ยนตาม (เช่น ลักษณะงาน &quot;MA&quot; ค้นด้วยคำว่า MA
        เพราะมีคำนี้อยู่ในชื่อภาษาอังกฤษ)
      </p>
      <AdminProjectCardTerms terms={rows} />
    </section>
  );
}
