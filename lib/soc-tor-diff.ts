// The word-level difference between a SOC row's TOR text and the TOR
// ต้นฉบับ's text it matched, for the TOR Match issue list (ticket 04).
// Computed when shown, not stored. What the compare module counts as format
// (digit script, spaces, line breaks, punctuation, case) is never marked
// changed; numbers, words and the comparison signs it keeps are.
import { toArabicDigits } from "@/lib/soc-shared";
import { isThai, KEPT_SYMBOLS, thaiText } from "@/lib/soc-tor-match";

export type DiffPart = { text: string; changed: boolean };
export type TorDiff = { soc: DiffPart[]; tor: DiffPart[] };

// A token is a word, a number, a kept symbol, or format (`key` null).
type Token = { text: string; key: string | null };

// Longer texts than this (tokens × tokens) aren't diffed: nothing is marked.
const MAX_CELLS = 4_000_000;

const isDigit = (c: string) => /\p{N}/u.test(c); // Thai digits too
const isWordChar = (c: string) => /[\p{L}\p{M}]/u.test(c);
type Kind = "digit" | "thai" | "word" | "symbol" | "format";
const kindOf = (c: string): Kind => (isDigit(c) ? "digit" : isThai(c) ? "thai" : isWordChar(c) ? "word" : KEPT_SYMBOLS.has(c.normalize("NFKC")) ? "symbol" : "format");
// The compare module ignores spaces and punctuation, so a number or a Thai
// phrase runs on across them ("1,000", "ความ ละเอียด"). Latin words part at a space.
const runsAcrossFormat = (kind: Kind) => kind === "digit" || kind === "thai";

let segmenter: Intl.Segmenter | null = null;
// Thai has no spaces between words: the platform's dictionary splits the
// run's letters (format left out), and each word takes its stretch of `text`.
function thaiWords(text: string, letters: string, at: number[]): Token[] {
  segmenter ??= new Intl.Segmenter("th", { granularity: "word" });
  const words = [...segmenter.segment(letters)];
  return words.map((word, n) => {
    const end = n + 1 < words.length ? at[words[n + 1].index] : text.length;
    return { text: text.slice(at[word.index], end), key: word.segment };
  });
}

function tokens(text: string): Token[] {
  const out: Token[] = [];
  const chars = [...text];
  for (let i = 0; i < chars.length; ) {
    const kind = kindOf(chars[i]);
    let j = i + 1;
    if (kind !== "symbol" && kind !== "format") {
      for (;;) {
        while (j < chars.length && kindOf(chars[j]) === kind) j++;
        let k = j;
        while (runsAcrossFormat(kind) && k < chars.length && kindOf(chars[k]) === "format") k++;
        if (k === j || k >= chars.length || kindOf(chars[k]) !== kind) break;
        j = k;
      }
    }
    const run = chars.slice(i, j);
    i = j;
    if (kind === "format") { out.push({ text: run.join(""), key: null }); continue; }
    // The run's own characters, format left out, and where each starts in the run's text.
    let letters = "";
    let offset = 0;
    const at: number[] = [];
    for (const c of run) {
      // A Thai mark drawn as a private-use glyph (thaiText) reads as Thai.
      if (kindOf(c) === kind || (kind === "thai" && isThai(thaiText(c)))) for (const unit of thaiText(c)) { letters += unit; at.push(offset); }
      offset += c.length;
    }
    if (kind === "thai") out.push(...thaiWords(run.join(""), letters, at));
    else out.push({ text: run.join(""), key: toArabicDigits(letters.normalize("NFKC")).toLowerCase() });
  }
  return out;
}

// Which words of `a` and `b` are in their longest common subsequence.
function lcsMembers(a: string[], b: string[]): [boolean[], boolean[]] {
  const inA = a.map(() => false);
  const inB = b.map(() => false);
  if ((a.length + 1) * (b.length + 1) > MAX_CELLS) return [inA.fill(true), inB.fill(true)];
  const width = b.length + 1;
  const lengths = new Int32Array((a.length + 1) * width);
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      lengths[i * width + j] = a[i] === b[j] ? lengths[(i + 1) * width + j + 1] + 1 : Math.max(lengths[(i + 1) * width + j], lengths[i * width + j + 1]);
  for (let i = 0, j = 0; i < a.length && j < b.length; ) {
    if (a[i] === b[j]) { inA[i++] = true; inB[j++] = true; }
    else if (lengths[(i + 1) * width + j] >= lengths[i * width + j + 1]) i++;
    else j++;
  }
  return [inA, inB];
}

// The parts of one side: neighbouring tokens of the same kind joined.
function parts(side: Token[], kept: boolean[]): DiffPart[] {
  const out: DiffPart[] = [];
  let word = 0;
  for (const token of side) {
    const changed = token.key !== null && !kept[word++];
    const last = out.at(-1);
    if (last && last.changed === changed) last.text += token.text;
    else out.push({ text: token.text, changed });
  }
  return out;
}

export function torDiff(socText: string | null, torText: string | null): TorDiff {
  const soc = tokens(socText ?? "");
  const tor = tokens(torText ?? "");
  const words = (side: Token[]) => side.flatMap((token) => (token.key === null ? [] : [token.key]));
  // A side alone has nothing to differ from.
  if (!soc.length || !tor.length) return { soc: parts(soc, soc.map(() => true)), tor: parts(tor, tor.map(() => true)) };
  const [inSoc, inTor] = lcsMembers(words(soc), words(tor));
  return { soc: parts(soc, inSoc), tor: parts(tor, inTor) };
}
