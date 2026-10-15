// Builds a minimal Word .docx in memory for tests. Zip entries are stored
// uncompressed unless `deflate` is set (Word itself deflates them).
import { crc32, deflateRawSync } from "node:zlib";

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// A TOR cell that is an image instead of text (an Image Row): `vml` writes it
// the way a .doc saved as .docx has it (w:pict), otherwise as a w:drawing.
export type ImageCell = { image: Uint8Array; name?: string; vml?: boolean };
// A text cell spanning `span` grid columns (w:gridSpan), as MEA Y69's TOR cell does.
export type SpanCell = { text: string; span: number };
export type Cell = string | ImageCell | SpanCell;

// 1 x 1 pixel.
export const PNG = new Uint8Array(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"));

const textRun = (text: string) => `<w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`;
const imageRun = (id: string, vml: boolean) => vml
  ? `<w:r><w:pict><v:shape id="_x0000_i1025" type="#_x0000_t75" style="width:249pt;height:82.5pt"><v:imagedata r:id="${id}" o:title="Screenshot"/></v:shape></w:pict></w:r>`
  : `<w:r><w:drawing><wp:inline><a:graphic><a:graphicData><pic:pic><pic:blipFill><a:blip r:embed="${id}"/></pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;

// `imageId` names the relationship of each image cell, in order.
export function tableXml(rows: Cell[][], imageId: (cell: ImageCell) => string = () => "rId1"): string {
  const cellXml = (cell: Cell) => typeof cell === "string" ? `<w:tc><w:p>${textRun(cell)}</w:p></w:tc>`
    : "span" in cell ? `<w:tc><w:tcPr><w:gridSpan w:val="${cell.span}"/></w:tcPr><w:p>${textRun(cell.text)}</w:p></w:tc>`
    : `<w:tc><w:p>${imageRun(imageId(cell), !!cell.vml)}</w:p></w:tc>`;
  const body = rows.map((cells) => `<w:tr>${cells.map(cellXml).join("")}</w:tr>`).join("");
  return `<w:tbl><w:tblPr/>${body}</w:tbl>`;
}

export function documentXml(bodyXml: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${bodyXml}</w:body></w:document>`;
}

export function buildZip(files: Record<string, string | Uint8Array>, { deflate = false } = {}): Uint8Array<ArrayBuffer> {
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const nameBytes = Buffer.from(name, "utf8");
    const raw = typeof content === "string" ? Buffer.from(content, "utf8") : Buffer.from(content);
    const data = deflate ? deflateRawSync(raw) : raw;
    const method = deflate ? 8 : 0;
    const crc = crc32(raw);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x0800, 6); // UTF-8 names
    header.writeUInt16LE(method, 8);
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(data.length, 18);
    header.writeUInt32LE(raw.length, 22);
    header.writeUInt16LE(nameBytes.length, 26);
    local.push(header, nameBytes, data);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(0x0800, 8);
    entry.writeUInt16LE(method, 10);
    entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(data.length, 20);
    entry.writeUInt32LE(raw.length, 24);
    entry.writeUInt16LE(nameBytes.length, 28);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, nameBytes);
    offset += header.length + nameBytes.length + data.length;
  }
  const centralSize = central.reduce((sum, b) => sum + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...local, ...central, end]));
}

export function buildDocx(bodyXml: string, options?: { deflate?: boolean; parts?: Record<string, string | Uint8Array> }): Uint8Array<ArrayBuffer> {
  return buildZip({
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>`,
    "word/document.xml": documentXml(bodyXml),
    ...options?.parts,
  }, options);
}

// A SOC of one table. Image cells become word/media files, named by the
// document's relationships as Word does.
export function buildSocDocx(rows: Cell[][]): Uint8Array<ArrayBuffer> {
  const images: ImageCell[] = [];
  const body = tableXml(rows, (cell) => `rId${images.push(cell)}`);
  if (!images.length) return buildDocx(body);
  const target = (cell: ImageCell, i: number) => `media/${cell.name ?? `image${i + 1}.png`}`;
  const relationships = images.map((cell, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${target(cell, i)}"/>`).join("");
  return buildDocx(body, { parts: {
    "word/_rels/document.xml.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relationships}</Relationships>`,
    ...Object.fromEntries(images.map((cell, i) => [`word/${target(cell, i)}`, cell.image])),
  } });
}
