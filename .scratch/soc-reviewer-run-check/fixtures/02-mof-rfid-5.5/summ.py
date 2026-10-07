import sys, json
sys.stdout.reconfigure(encoding="utf-8")
for f in sys.argv[1:]:
    print("#####", f)
    for p in json.load(open(f, encoding="utf-8")):
        print("== page", p["page"])
        for l in p["labels"]:
            print("  LABEL", repr(l["content"]), "y=%.0f"%l["rect"][1])
        seen=set()
        for h in p["highlights"]:
            t=h["text"].strip().replace("\n"," ")
            if t in seen: continue
            seen.add(t)
            print("  HL[%s] y=%.0f x=%.0f: %s"%(h["kind"][:3],h["rect"][1],h["rect"][0],t[:160]))
