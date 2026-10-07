import sys, fitz
sys.stdout.reconfigure(encoding="utf-8")
for f in sys.argv[1:]:
    d=fitz.open(f)
    for i,p in enumerate(d):
        print(f"\n######## {f.split('/')[-1]} PDF page {i+1} imgs={len(p.get_images())}")
        print(p.get_text())
