import sys, docx, json
sys.stdout.reconfigure(encoding="utf-8")
d = docx.Document(sys.argv[1])
t = d.tables[0]
rows=[]
for i,r in enumerate(t.rows):
    cells=[c.text.strip() for c in r.cells]
    rows.append(cells)
start=None
for i,c in enumerate(rows):
    if c[0].startswith('๕.๕') and start is None: start=i
    if start is not None and c[0].startswith('๕.๖'): end=i; break
print(start,end)
for i in range(start-1,end+1):
    print('=== row',i, ' | '.join(x.replace('\n',' / ') for x in rows[i]))
