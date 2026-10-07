import sys, pymupdf
d=pymupdf.open(sys.argv[1]); out=sys.argv[2]; dpi=int(sys.argv[3])
pages=[int(x) for x in sys.argv[4].split(",")] if len(sys.argv)>4 else range(1,len(d)+1)
for n in pages:
    d[n-1].get_pixmap(dpi=dpi).save(f"{out}/p{n:02d}.png")
print(len(d))
