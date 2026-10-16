# Thai OCR options for scanned SOC/TOR PDFs (research v1 2026-10-15, v2 2026-10-16)

Scope: Thai+English, ruled-table cells (~2,000 cell PNGs/file, 300 DPI), Windows Server (no GPU), no admin, no Docker, Smart App Control (SAC) blocks unsigned native code, no Claude API (Pro only), no Google Cloud billing. External OCR is allowed by the user.

Legend: **[V]** = verified on a primary page I read in this pass; **[VENDOR]** = number published by the model's own authors (not independent); **[UNV]** = unverified / estimate / inference; **[OURS]** = measured in this project (`prototype/FINDINGS.md`, memory note).

## 0. What changed in v2 (read this first)

1. Our own measurements now exist and override v1 guesses: PaddleOCR Thai v5 mobile = 11.4 s/cell and only 102/179 cells identical to Sonnet (57%) [OURS]. The v1 "Paddle rec-only is the fast first stage" idea is therefore weak on accuracy, not just speed. Hybrid gating on a 57% engine is doubtful.
2. The Paddle slowness is NOT explained by orientation/unwarp modules: the prototype already sets `use_doc_orientation_classify=False, use_doc_unwarping=False, use_textline_orientation=False` [OURS, `PROTOTYPE_paddle.py`] (their defaults are all `True` [V: https://www.paddleocr.ai/latest/en/version3.x/pipeline_usage/OCR.html]). Remaining suspects: `enable_mkldnn=False` (forced by the oneDNN crash), the default detector resize (`text_det_limit_type="min"`, `limit_side_len=64`, only upscales [V same page]), and the 3.3.1 build itself. Official CPU numbers for the same models on a Xeon Gold 6271C: PP-OCRv5_mobile_det 57.77 ms, mobile_rec 21.20 ms, server_det 383 ms [V same page, ms per image with mkldnn on] -> a healthy install should be ~0.1-0.5 s/cell, 20-100x faster than we saw. So the 11.4 s is a broken/oneDNN-less environment, not intrinsic model cost. Speed is fixable; accuracy (57%) is the real blocker.
3. New hard facts: Azure Document Intelligence **F0 limits analysis to 2 pages per request and 4 MB per file** [V https://learn.microsoft.com/en-us/azure/ai-services/document-intelligence/service-limits?view=doc-intel-4.0.0] (plus 500 pages/month free [V https://azure.microsoft.com/en-us/pricing/details/ai-document-intelligence/]) - workable only with page-splitting, 1 TPS.
4. PP-OCRv6 (June 2026) exists but its documented 50-language set is Latin+Chinese+Japanese+English; I found no Thai model in it [UNV, from search summaries of https://www.paddleocr.ai/main/en/version3.x/algorithm/PP-OCRv6/PP-OCRv6.html; not confirmed on the page itself]. Thai stays on `th_PP-OCRv5_mobile_rec`.
5. Independent Thai evidence added: ThaiOCRBench (arXiv 2511.04479) and the Typhoon OCR paper (arXiv 2601.14722). Details in section 2.

## 1. Our baseline measurements (do not lose)

| Engine | Result on USO cells | Source |
|---|---|---|
| Sonnet on Runner (full transcription) | Accurate; ~9 Pro quota points / 10 pages = ~75 pts per 85-page file | OURS, FINDINGS step 5 |
| Typhoon API, whole page | Merged rows, lost heading offers, made-up inner table | OURS step 4 |
| Typhoon API, one cell per call (`typhoon-ocr` = v1.5 2B) | 171/181 identical to Sonnet; fixed 3 Sonnet misreads; 2 real errors; 20 req/min -> ~99 min per ~2,000 cells | OURS step 6-7 |
| Typhoon packing several cells per image | Unreliable (text dropped/mixed) | OURS step 7 |
| PaddleOCR Thai v5 mobile (det+rec, mkldnn off) | 102/179 identical (57%); junk chars at cell start/end; Thai digits -> Arabic; dropped text; 11.4 s/cell | OURS memory note 2026-10-15 |
| Google Cloud Vision | Dropped (no billing) | OURS |

## 2. Thai accuracy evidence found (primary sources)

- **ThaiOCRBench** (2,808 human-annotated Thai samples, 13 tasks, zero-shot VLMs): Table 1 values I could read [V https://arxiv.org/html/2511.04479v3, flattened table, column mapping by task order so treat column labels as moderately reliable]:

  | Model | Table parsing (TED) | Fine-grained text rec (BMFL) | Text recognition (ANLS) |
  |---|---|---|---|
  | Gemini 2.5 Pro | 0.686 | 0.499 | 0.910 |
  | Claude Sonnet 4 | 0.650 | 0.214 | 0.686 |
  | GPT-4o | 0.571 | 0.254 | 0.778 |
  | Qwen2.5-VL 72B | 0.549 | 0.147 | 0.749 |
  | Qwen2.5-VL 7B | 0.509 | 0.218 | 0.597 |
  | Qwen2.5-VL 3B | 0.431 | 0.130 | 0.475 |
  | InternVL3 8B | 0.423 | 0.052 | 0.033 |

  Take-aways: general open VLMs of 3-8B are poor on Thai (so "just run Qwen3-VL-2B/4B locally" is not supported); Gemini 2.5 Pro is the strongest. EasyOCR and Tesseract baselines are in the paper but I did not read their rows (page text cut at 100k chars; read on with offset 100000 if needed). The paper (abstract) also reports proprietary > open models and that fine-grained recognition and handwriting drop most [V https://arxiv.org/abs/2511.04479].
- **Typhoon OCR paper** [V https://arxiv.org/html/2601.14722v1, **[VENDOR]** - authors are the model's makers]: Thai Financial Reports Levenshtein (lower better) Typhoon V1.5 2B 0.079 vs Gemini 2.5 Pro 0.256 vs GPT-5 0.356; Thai Government Forms Levenshtein 0.035 vs 0.096 vs 0.267. V1.5 is a 2B model fine-tuned from Qwen3-VL-2B, trained on 155,403 samples with quantization-aware training. Paper limits: degrades on low-res/blur/occlusion; handwritten forms and infographics worse than proprietary; images <=1,800 px max side are kept at original resolution, larger are resized to 1,800 px width. No inference-speed numbers, no TEDS in the paper. Our own cell test (171/181) is the independent confirmation.
- **Thai-TrOCR model card** (self-reported, 104 images, whole-image eval, not cells) [V https://huggingface.co/openthaigpt/thai-trocr]: CER on "PDF Document": Thai-TrOCR 0.058, **EasyOCR 0.086**, Tesseract 0.762; "Real Document": 0.147 / 0.293 / 0.916; mean 0.124 / 0.298 / 1.269. Tesseract was run without layout help, so its numbers are pessimistic, but EasyOCR is clearly the stronger classic engine here. PaddleOCR is not in this table.
- **PaddleOCR Thai rec**: official average accuracy 82.68%, 7.5 MB, covers Thai/English/digits [V https://www.paddleocr.ai/latest/en/version3.x/pipeline_usage/OCR.html]. Our 57% exact-cell-match is a stricter metric on harder (small, ruled, scanned) cells, so not contradictory, but it says do not expect the 82.68% in practice.
- **Surya**: Thai = 76.4% in the repo's per-language table (metric not stated on the page) [V https://raw.githubusercontent.com/datalab-to/surya/master/static/docs/multilingual.md, **[VENDOR]**].

## 3. Candidate-by-candidate

| Option | Thai evidence | Tables | CPU / GPU speed | Install + license fit for us | Hybrid fit |
|---|---|---|---|---|---|
| **PaddleOCR Thai v5 mobile rec** | 82.68% avg (vendor) [V]; ours 57% exact | Not needed (our grid does it). PP-StructureV3 table models (SLANeXt_wired 351 MB, CPU 501 ms; RT-DETR-L wired cell det 124 MB, CPU 402-256 ms) but docs list no Thai [V https://www.paddleocr.ai/latest/en/version3.x/pipeline_usage/PP-StructureV3.html] | Official: rec 21.2 ms (5.3 ms hpi) per line on Xeon CPU [V]; ours 11.4 s/cell with mkldnn off | Works on server in venv; oneDNN crash on 3.3.1 (issue #17955 [V per v1]). Apache-2.0. Native DLLs ran OK under current setup | Weak: low accuracy -> low-confidence set may be >50% of cells |
| **RapidOCR + onnxruntime, `th_PP-OCRv5_rec_mobile`** | Same weights as Paddle -> expect the same accuracy [UNV] | none | ONNX CPU, no Paddle runtime, no oneDNN bug [UNV measured speed]. Rec-only call: `engine(img, use_det=False, use_cls=False, use_rec=True)` returns `.txts` and `.scores` [V https://rapidai.github.io/RapidOCRDocs/main/install_usage/rapidocr/usage/]. Model key `th_PP-OCRv5_rec_mobile` is in the model list for onnxruntime/openvino/mnn/paddle [V https://rapidai.github.io/RapidOCRDocs/main/model_list/] | `pip install rapidocr onnxruntime`; Apache-2.0; onnxruntime DLL is Microsoft-signed [UNV under SAC] | Good for speed test; accuracy ceiling = Paddle's |
| **EasyOCR (`th`)** | Thai listed as supported [V https://www.jaided.ai/easyocr/]; CER 0.086 on Thai PDF docs vs Tesseract 0.76 (self-reported by third party) [V Thai-TrOCR card]; best classic candidate | none | PyTorch CRNN (ResNet/VGG + LSTM + CTC), `gpu=False` option; no speed figures published [V https://github.com/JaidedAI/EasyOCR] | Windows: install torch/torchvision first; large native DLLs, SAC risk [UNV]; Apache-2.0 | Candidate first stage; call `recognize()` on cropped cells to skip CRAFT detection; ensemble-agreement gate with Paddle (section 6) |
| **Tesseract `tha`** | `tha.traineddata` (tessdata_best, LSTM) exists, 7.6 MB, Apache-2.0 [V GitHub API https://api.github.com/repos/tesseract-ocr/tessdata_best/contents/tha.traineddata, repo license https://github.com/tesseract-ocr/tessdata_best]. Thai-TrOCR card CER 0.76-1.06 (uncontrolled whole-image) [V] | Weak without custom segmentation; docs say so [V https://tesseract-ocr.github.io/tessdoc/ImproveQuality.html] | CPU, fast per crop [UNV] | Portable exe needs unsigned/third-party binary -> SAC risk [UNV]; subprocess, no Python DLLs | Poor Thai evidence; test only if cheap |
| **docTR** | Library has a `thai` vocab [V https://github.com/mindee/doctr/blob/main/doctr/datasets/vocabs.py] but I found no pretrained Thai recognizer [UNV] | yes (generic) | PyTorch/TF | n/a | Skip unless user trains own model |
| **Surya OCR 2** | Thai 76.4% [VENDOR]; olmOCR-bench overall 83.3 [VENDOR] | surya_table (HTML, spans); olmOCR-bench Tables 86.6 [VENDOR] | CPU path needs llama.cpp `llama-server`; only Apple-Silicon figure: 0.108 pages/s, p50 59 s [V https://github.com/datalab-to/surya] | Weights = modified OpenRAIL-M, free only for research/personal/startups < $5M [V]; Windows not documented; llama-server binary SAC risk | No (page-level, slow on CPU, licence risk for a company) |
| **PaddleOCR-VL (0.9B VLM)** | Official FAQ lists Thai among 109 languages (search-result summary; the doc page I fetched says 109 but does not list them) [UNV]; no Thai accuracy figure found | Layout stage + VLM -> Markdown/HTML/xlsx tables [V https://github.com/PaddlePaddle/PaddleOCR/blob/main/docs/version3.x/pipeline_usage/PaddleOCR-VL.md] | x64 CPU supported only via PaddlePaddle/Transformers path; doc warns "may be slow"; no CPU numbers [V] | Same Paddle runtime (oneDNN crash risk); vLLM/SGLang not on native Windows [V]; licence not stated on that page | Only if a cheap 20-cell probe shows Thai quality; high risk on CPU |
| **Typhoon OCR API** (`typhoon-ocr` = v1.5 2B) | Best Thai evidence (vendor paper + our 171/181) | HTML tables inside cells ok (our p7) | Remote; limit **2 req/s and 20 req/min** on both endpoints [V https://docs.opentyphoon.ai/en/ocr/]. Pricing/free tier/data retention are NOT on that page; the pricing URL I tried returns 404 [V] -> ask contact@opentyphoon.ai | `pip install typhoon-ocr` needs Poppler only for PDFs (not for PNG cells) [V]. `typhoon-ocr-preview` (7B) was scheduled for deprecation 2025-12-31 [V] | Escalation target; the ~20 req/min cap is THE bottleneck, not latency |
| **Typhoon OCR weights, local** (`scb10x/typhoon-ocr1.5-3b-qat`) | Same family; card says some hallucination may occur, validate [V https://huggingface.co/scb10x/typhoon-ocr1.5-3b-qat] | HTML tables | Hub lists 4B params BF16 (card says QAT on Qwen2.5-VL-3B though the paper says V1.5 is 2B/Qwen3-VL - inconsistent, flag) [V]; no CPU requirement or speed given; Ollama 4-bit build `scb10x/typhoon-ocr1.5-3b` [V]; speed on CPU [UNV] | Apache-2.0 [V]. Needs Ollama/llama.cpp binary (admin/SAC [UNV]) | Would remove the 20 req/min cap IF CPU latency per cell is acceptable; never measured. Worth one test (section 7) |
| **dots.ocr** | Thai not mentioned ("virtually any script") [V https://github.com/rednote-hilab/dots.ocr] | Tables 88.3 on olmOCR-bench [V, vendor] | GPU/vLLM oriented, CPU only via an issue link [V] | MIT + a separate licence agreement text unread [V] | No |
| **olmOCR** | Thai not mentioned [V https://github.com/allenai/olmocr] | - | Needs recent NVIDIA GPU, >=12 GB VRAM, ~30 GB disk; 7B [V] | Apache-2.0 | No (GPU) |
| **Qwen3-VL (2B-235B)** | "32 languages" OCR, list not given [V https://github.com/QwenLM/Qwen3-VL]; Qwen2.5-VL 3B/7B weak on Thai in ThaiOCRBench (see sec. 2) | - | vLLM/SGLang GPU examples; no CPU guidance [V] | Apache-2.0 | No (Typhoon 1.5 is a Thai-tuned Qwen3-VL-2B already) |
| **Azure Document Intelligence Read/Layout** | Thai printed supported (v3.1/v4.0) [V per v1: https://learn.microsoft.com/en-us/azure/ai-services/document-intelligence/language-support/ocr]; no Thai accuracy figure | Layout returns cells | Cloud; F0 limits: **2 pages per request, 4 MB, 1 TPS** [V service-limits page above]; 500 pages/month free [V pricing page]; paid per-1000-page price not shown on the page I could fetch ($- placeholders) | Needs Azure account/card [UNV] | 85-page file = 43 two-page requests; ~5 files/month free; paid S0 (2000 pages, 15 TPS) removes limits |
| **Gemini API free tier** | Gemini 2.5 Pro best in ThaiOCRBench (above); Flash tier unknown | via prompt | Remote; exact free RPM/RPD only visible in AI Studio (per project, resets midnight PT) [V https://ai.google.dev/gemini-api/docs/rate-limits] | Free tier: data used to improve Google products (v1 [V https://ai.google.dev/gemini-api/docs/pricing]) | Quality likely good but data-use terms stricter than Typhoon's [UNV] |
| **AWS Textract** | No Thai (EN/FR/DE/IT/PT/ES only) [V per v1: https://docs.aws.amazon.com/textract/latest/dg/limits-document.html] | | | | Not usable |

## 4. Paddle: speed notes (consolidated)

- Known oneDNN regression on 3.3.x CPU (`ConvertPirAttribute2RuntimeAttribute`), issue https://github.com/PaddlePaddle/PaddleOCR/issues/17955 [V per v1]; `PADDLE_PDX_ENABLE_MKLDNN_BYDEFAULT=0` or `enable_mkldnn=False` avoids the crash but costs speed. Pinning paddlepaddle < 3.3 is suggested by a blog (https://www.cnblogs.com/zmm521/p/18684355) but not verified for Windows + paddleocr 3.7 [UNV].
- Same issue: default detection resize never downscales, server detector ~5 GB per megapixel on CPU; workaround `text_det_limit_type="max"`, `text_det_limit_side_len=960` [V per v1].
- `TextRecognition(model_name="th_PP-OCRv5_mobile_rec").predict(input=ndarray_or_list, batch_size=N)` returns `rec_text`, `rec_score` [V per v1: https://www.paddleocr.ai/latest/en/version3.x/module_usage/text_recognition.html]. Rec reads ONE text line; multi-line cells need line splitting first. Mixed Thai digits -> Arabic is a recognizer-vocabulary behaviour seen in our output [OURS]; normalise digits when comparing.
- ONNX route exists in PaddleOCR itself (`engine="onnxruntime"`, some models "still being supported") [V PP-StructureV3 page].

## 5. Practical accuracy/speed levers

1. **Text layer first** for text PDFs (already ADR 0009). Scans have no layer; do not spend OCR on pages with one. [OURS design; no external source needed]
2. **Render/scan DPI**: Tesseract docs: at least 300 DPI [V https://tesseract-ocr.github.io/tessdoc/ImproveQuality.html]. Typhoon V1.5 keeps images <=1,800 px max side at native resolution and downsizes larger ones to 1,800 px width [V paper]. Our cells are far below 1,800 px, so they are sent at native size: there is nothing to gain by upscaling beyond 300 DPI; do not send whole 4680x3307 pages (they get downsized to 1,800 px, losing small Thai tone marks) - this plausibly explains the whole-page failures [UNV causal].
3. **Preprocessing** (Tesseract docs, engine-agnostic advice): deskew so lines are horizontal; add a ~10 px white border to tight crops (we do a white pad already); remove dark scanner borders; avoid huge borders; binarise with adaptive/Sauvola if background uneven [V same page]. Table-line ink inside the crop is the likely cause of Paddle's junk characters at cell edges [UNV]: inset the crop further or erase long dark runs (the grid script already treats runs >40 px and bands <=8 px as border [OURS]).
4. **Cell cropping vs full page**: for Typhoon, cell crops beat whole pages and beat row crops and beat packed montages in our tests [OURS]. Keep one cell per call.
5. **Skip cells before calling**: empty-ink cells skipped (2,355 -> 1,991 [OURS]); a lower ink threshold is needed for short single-line cells [OURS]. Further candidates to count from `grid.json` (not yet measured): skip remark cells that are only ruled lines; skip the TOR column if the TOR row becomes an Image Row (ADR 0010 chose full TOR text, so this is a design trade-off for the user).
6. **Batching / parallelism**: Typhoon is rate-capped at 20 req/min / 2 req/s, so parallel workers do not help; queue strictly and honour 429 with backoff [V docs]. Azure F0: 1 TPS and 2 pages/request. Local engines: batch the recognizer (`batch_size`, Paddle default 1 [V]) and use `cpu_threads` (default 10 [V]).
7. **Confidence thresholds**: `text_rec_score_thresh` default 0.0 (no filter) [V]; Paddle/RapidOCR return per-line scores. A single-engine score gate is only useful if score tracks correctness; on a 57% engine it may not (unmeasured). Calibrate on the 179 cells with Sonnet ground truth.

## 6. Hybrid designs ranked by fit

A. **Local first pass -> Typhoon only for uncertain cells.** Budget: Typhoon handles ~2,000 cells in ~99 min; if only 25% escalate that is ~500 calls = ~25 min [arithmetic from 20 req/min]. Needs a first pass whose accepted cells are >=99% right. Paddle-only fails that (57%). A gate that accepts a cell only when two independent engines agree after normalisation (Thai digits, whitespace) and both scores are high is more promising than a single score [UNV idea]: candidates EasyOCR + Paddle/RapidOCR. Check coverage: if agreement is <40% of cells the time saving is small.
B. **Typhoon only, background job** (current ADR 0010 direction): ~99 min/file, free, no new install, accuracy proven on our cells. Cost is waiting time, not quota. Cheapest levers: smarter empty-cell skip and column skipping (section 5).
C. **Typhoon local weights** via Ollama/llama.cpp on the server: removes the rate cap but CPU latency for a 2-4B VLM is unmeasured [UNV]; and install/SAC risk.
D. **Azure DI on pages** (2-page requests): free for ~5 files/month; Thai table accuracy unknown; needs Azure account.
E. **Sonnet on Runner**: accurate, ~75 pts/file; fallback only.

## 7. Ranked recommendation

1. **Keep B (Typhoon API per cell, background, ADR 0010) as the production path** - it is the only option with measured accuracy that matches Sonnet and costs no quota; its only problem is ~99 min wall time, which the async job design already hides. Reduce calls with better skip rules before adding any new engine.
2. **Treat A as an optional speed-up, and only with two engines + agreement gating** (EasyOCR and a healthy Paddle/RapidOCR). Do not build it until the numbers below show >=40% of cells accepted at >=99% agreement-accuracy.
3. **Azure DI Read/Layout** as a second external reader if Typhoon becomes unavailable or its terms (retention) are unacceptable; verify Thai quality on 3 pages first.
4. **Local Typhoon weights (C)** as a lottery ticket: one 20-cell timing test; adopt only if <=10 s/cell on the server.
5. Not recommended: Tesseract tha (weak evidence), Surya (licence + CPU), dots.ocr / olmOCR / Qwen-VL (GPU, Thai unproven), docTR (no Thai weights), Textract (no Thai), PaddleOCR-VL (unproven on CPU, same Paddle runtime issues).

## 8. Next experiment to run alongside the Paddle test (about 1-2 h, same 237 cells and `diff2.mjs`)

Goal: decide whether any local engine can be a trustworthy first pass, and what fraction of cells it could take away from Typhoon.

1. Same 237 cell PNGs and Sonnet/Typhoon ground truth already used.
2. Engines (separate venvs on the server, record s/cell and per-line score):
   - **EasyOCR** `Reader(['th','en'], gpu=False).recognize(img_ndarray, detail=1)` (skips CRAFT; try `paragraph=False`) [API from EasyOCR repo; exact kwargs UNV].
   - **RapidOCR** rec-only with `th_PP-OCRv5_rec_mobile` (`use_det=False, use_cls=False`), to get speed without Paddle's runtime and without mkldnn.
   - (Optional, if time) Paddle `TextRecognition` rec-only with `text_det_*` irrelevant, `batch_size=8`.
3. Preprocess variants on a 50-cell subset: (a) raw, (b) +20 px white border and 3-4 px inset to cut ruled-line ink, (c) adaptive threshold. Pick the best before the full run.
4. Scoring: normalise Thai digits and whitespace, then compute CER vs Sonnet and exact-match vs Typhoon; plot score vs correctness.
5. **Decision numbers**: (i) exact-match >=85% for EasyOCR or RapidOCR alone, or (ii) agreement set (engines agree) covers >=40% of cells with >=99% correct. If neither, stop the local-OCR line and focus on trimming Typhoon calls (section 5.5).
6. Side probe (10 min): time 20 cells with Ollama `scb10x/typhoon-ocr1.5-3b` on the server CPU if Ollama can be run unzipped without admin/SAC trouble; note s/cell only.

## 9. Open items / unverified list

- Typhoon API pricing, free-tier duration, and data-retention terms: not on the docs page; pricing URL 404; email contact@opentyphoon.ai (needed before prod).
- Typhoon local model size inconsistency (card says 4B/Qwen2.5-VL-3B QAT; paper says 2B/Qwen3-VL-2B).
- EasyOCR, Tesseract, Paddle rows of ThaiOCRBench Table 1 not read (cut off).
- PP-OCRv6 has no Thai model (inferred from search summaries only).
- PaddleOCR-VL Thai quality and CPU speed: no figures.
- Any SAC behaviour of onnxruntime/torch/tesseract/Ollama binaries on the server: untested.
- Azure paid prices and whether F0 needs a payment card: not retrieved.
- Gemini free-tier RPM/RPD: only visible in AI Studio.

## 9. Measured results, 2026-10-16 (supersede the guesses above)

All against the Typhoon one-cell-per-call reference (`typhoon-ocr`, 237 cells; 171 of 181 identical to Sonnet earlier). Scripts: `C:\Phusit\socpdf\ocr-compare\` (`compare.py`, `compare_pages.py`, `compare_rows.py`, `agree_stats.py`) and `prototype/PROTOTYPE_gemini.mjs`. [OURS]

| Reader | Accuracy | Time / cost | Verdict |
|---|---|---|---|
| RapidOCR Thai PP-OCRv5 mobile (raw / border / adaptive threshold) | 55% / 40% / 35% lenient on 45 text cells | 1.6-1.7 s per cell on the server | Rejected: cutting the cell edge made it worse, not better |
| EasyOCR th+en | 48% lenient | 4.7-6.5 s per cell | Rejected |
| RapidOCR and EasyOCR agree | 15 of 45 cells (33%), all correct, all short boilerplate | | Below the 40% bar; only a possible later shortcut for repeated offer cells |
| Gemini 3.8 Flash, whole page (free tier: 5 per minute, 250K tokens per minute, **20 requests per day**) | 192/212 = 90%; rewrote a TOR sentence ("ผู้รับจ้างดำเนินงาน" for "จัดทำแผนการดำเนินงาน"), dropped a tick box, added a header row, corrected printed typos | 80-227 s per call (503 "high demand" retries, many thinking tokens) | Rejected: silent rewrites; Google may train on unpaid input and says not to send confidential data |
| Gemini 2.5 Pro | free quota 0 | | Not available free |
| Haiku 5.5 on the Runner, pages 1-10, same prompt as the Sonnet run | 109/116 = 93%; wrote "ผู้รับจ้าง" for "ผู้ว่าจ้าง", "อรัยสถาปัตย์" | $0.24 vs $0.37 for Sonnet (about 34% cheaper), 57k output tokens (35k thinking), 201 s per 10 pages | Rejected: about 50 points per file, and swaps the party |
| Typhoon, 2 vs 4 parallel calls | identical text | 456 s vs 440 s for 237 cells = about 32 cells per minute | Throttled server side; USO about 62 min. The documented 20 per minute is not enforced strictly |

Gemini 2.5 Flash is closed to new users (API answers 404 and points to 3.x); the free quota table in AI Studio still lists 2.5 and is stale.
Still unverified: Typhoon's data retention terms and pricing, whether Typhoon will start enforcing 20 per minute, whether Smart App Control on the production server allows onnxruntime.
