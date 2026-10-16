# PROTOTYPE: PaddleOCR (local, CPU, Thai model) on the cell PNGs cut by
# PROTOTYPE_grid.mjs (CELL_PNGS=1). Writes cells.json {"cell-PPP-RR-C.png": text}
# like the Typhoon prototype, so diff2.mjs can compare it with Sonnet.
# python PROTOTYPE_paddle.py <cells dir> <out dir>
import json, os, sys, time

os.environ.setdefault("PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK", "True")
from paddleocr import PaddleOCR

cells_dir, out_dir = sys.argv[1], sys.argv[2]
os.makedirs(out_dir, exist_ok=True)
out_file = os.path.join(out_dir, "cells.json")
result = json.load(open(out_file, encoding="utf-8")) if os.path.exists(out_file) else {}

t0 = time.time()
ocr = PaddleOCR(
    lang="th",
    use_doc_orientation_classify=False,
    use_doc_unwarping=False,
    use_textline_orientation=False,
    enable_mkldnn=False,  # Paddle 3.3 Windows CPU: oneDNN crashes (ConvertPirAttribute2RuntimeAttribute)
)
print(f"model load {time.time() - t0:.1f} s", flush=True)


def cell_text(res):
    texts, boxes = res["rec_texts"], res["rec_boxes"]
    if not texts:
        return ""
    items = sorted(zip(texts, [list(map(float, b)) for b in boxes]), key=lambda t: (t[1][1] + t[1][3]) / 2)
    hs = sorted(b[3] - b[1] for _, b in items)
    h = hs[len(hs) // 2] or 20
    lines = []
    for text, b in items:
        y = (b[1] + b[3]) / 2
        if lines and abs(y - lines[-1]["y"]) < h * 0.5:
            lines[-1]["items"].append((b[0], text))
        else:
            lines.append({"y": y, "items": [(b[0], text)]})
    return " ".join(" ".join(t for _, t in sorted(l["items"])) for l in lines).strip()


files = sorted(f for f in os.listdir(cells_dir) if f.startswith("cell-") and f.endswith(".png"))
todo = [f for f in files if f not in result]
t1 = time.time()
for i, f in enumerate(todo, 1):
    res = ocr.predict(os.path.join(cells_dir, f))[0]
    result[f] = cell_text(res)
    if i % 20 == 0:
        print(f"{i}/{len(todo)} cells, {time.time() - t1:.0f} s", flush=True)
        json.dump(result, open(out_file, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
json.dump(result, open(out_file, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
secs = time.time() - t1
print(f"{len(todo)} cells in {secs:.0f} s ({secs / max(len(todo), 1):.2f} s/cell); "
      f"USO ~2000 cells => ~{secs / max(len(todo), 1) * 2000 / 60:.0f} min")
