import sys, os
SP=sys.argv[1]; body=open(sys.argv[2]).read()
s=open('shoot.mjs').read()
s=s.replace("from 'playwright'","from '/opt/node22/lib/node_modules/playwright/index.mjs'")
s=s.replace("const OUT = join(ТУТ, 'shots');", "const OUT = '"+SP+"/howto/"+os.environ.get('OUTDIR','explore')+"';")
s=s.replace("}, { profiles: [","}, { user: { id: 'u-me', email: 'oleh@example.com', user_metadata: { name: 'Олег' } }, profiles: [ { uid: 'u-me', name: 'Олег', surname: 'Коваль', avatar_url: '' },")
s=s.replace("await p.goto(url,", """const BAD=/загиб|загин|вбит|поранен|атакува|попрощал|Герой|Героя|війн|ракет|обстріл|санкці/i;
await p.route('**/data/articles*.json*', async r => { const resp = await r.fetch(); let j = await resp.json();
  const f = a => (a||[]).filter(x => !BAD.test((x.title||'')+' '+(x.category||'')) && x.category!=='Війна' && x.category!=='Надзвичайне');
  j = Array.isArray(j) ? f(j) : j; r.fulfill({ response: resp, body: JSON.stringify(j) }); });
await p.goto(url,""")
th=os.environ.get('THREADS'); ms=os.environ.get('MSGS')
if th: s=s.replace("threads: [], messages: []", "threads: "+th+", messages: "+(ms or "[]"))
tail="console.log('── знімаю екрани «Громади» ──');"
i=s.index(tail)
pre='''const dump = async (tag) => { console.log('--- '+tag); console.log(JSON.stringify(await p.evaluate(()=>[...document.querySelectorAll('button, a, input, textarea, select, [data-open-chat], [role=button]')].filter(e=>{const b=e.getBoundingClientRect();const st=getComputedStyle(e);return b.width>0&&b.height>0&&b.top<844&&b.bottom>0&&st.visibility!=='hidden';}).map(e=>({t:(e.innerText||e.placeholder||e.name||'').toString().trim().replace(/\\s+/g,' ').slice(0,28), c:(e.className||'').toString().slice(0,34), id:e.id, y:Math.round(e.getBoundingClientRect().y), x:Math.round(e.getBoundingClientRect().x)}))))); };
const shot = async n => { await p.screenshot({ path: join(OUT, n+'.png') }); };
'''
s=s[:i]+pre+body+"\nawait stop(); await b.close();\n"
open('_vs-shoot.mjs','w').write(s)
