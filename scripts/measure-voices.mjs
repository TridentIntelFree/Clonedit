/* measure-voices.mjs — what the inter-voice rules actually cost
   ----------------------------------------------------------------
   Writes the same three-voice ensemble at a FIXED key, progression and
   seed, N times, and reports the counterpoint and melody norms averaged
   over every voice-pair and every voice. Point it at two builds to A/B
   a change:

     node scripts/measure-voices.mjs index.html
     git show HEAD:index.html > /tmp/old.html
     node scripts/measure-voices.mjs /tmp/old.html

   WHY THIS EXISTS, AND WHY NOT A GENRE BUILD. The parallel-fifth filter
   was first judged off four random genre builds, where the key, the
   progression and the seed all move between runs — and the numbers moved
   more between runs than the fix moved them. One run of it said parallel
   octaves had got WORSE. A filter judged against noise is not judged.

   AND PIN THE TEMPO. clear() does not reset bpm, swing, human or
   humanDrift, and counterpoint() walks the UNION of both voices' onset
   TIMES — so drift changes which notes it treats as adjacent. Run after
   a build that left 64bpm and 30% drift behind, the same seeds report
   parallels that a fresh page does not. A pitch rule measured through a
   timing effect is not measured.

   Reads index.html, which is the published build: run `npm run build`
   first or you are measuring the last one. */
import { chromium } from 'playwright-core';
const file = process.argv[2];
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium',
  args:['--no-sandbox','--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage({ viewport:{width:430,height:900} });
p.on('pageerror', e => console.log('PAGEERROR', e.message));
await p.goto('file://'+file);
await p.click('#logo'); await p.waitForTimeout(600);
const r = await p.evaluate(async () => {
  const J=window.JBH;
  const rows=[];
  for (let t=0;t<12;t++){
    await J.clear();
    J.key('C','minor');
    const midis=[36,48,60];
    for(let i=0;i<3;i++){ await J.bass({style:'sub',midi:midis[i],seconds:0.5,pad:i});
      J.pad(i,{inst:'v'+i, srcNote:midis[i]}); }
    await J.pattern(0,{plen:64, clear:true, select:true});
    J.chords(0,['Cm','Fm','G7','Cm']);
    const vs=[{inst:'v0',role:'bass'},{inst:'v1',role:'lead'},{inst:'v2',role:'arp'}];
    const o={from:0,bars:4,n:1,src:'pat',density:'normal',octave:0,poly:'none',
      converse:false, seed:(1000+t*7919)>>>0, feel:'straight'};
    const off=await J.ensemble(vs,o);
    await J.ensemble(vs, Object.assign({},o,{seed:off.seed, apply:off.candidates[0].seed}));
    const got={};
    for(const pair of [['v0','v1'],['v1','v2'],['v0','v2']]){
      try{ const c=await J.counterpoint(pair,{src:'pat'});
        if(c.motion) got[pair.join("/")]=c.motion;
      }catch(e){ got[pair.join('/')]={err:e.message}; }
    }
    for(const t2 of ['v0','v1','v2']){
      try{ const m=await J.melody(t2,{src:'pat'});
        if(m.got) got['MEL_'+t2]=m.got; }catch(e){}
    }
    rows.push(got);
  }
  return rows;
});

const mel={repeat:[],step:[],third:[],leap:[],range:[],dirChange:[],leapRecovery:[]};
for(const row of r) for(const k in row) if(k.startsWith('MEL_'))
  for(const f in mel) if(row[k][f]!=null) mel[f].push(row[k][f]);
const agg={par5:[],par8:[],oblique:[],contrary:[]};
for(const row of r) for(const k in row){
  if(k.startsWith('MEL_') || row[k].par5==null) continue;
  agg.par5.push(row[k].par5); agg.par8.push(row[k].par8);
  agg.oblique.push(row[k].oblique); agg.contrary.push(row[k].contrary);
}
const mean=a=>a.length?+(a.reduce((x,y)=>x+y,0)/a.length).toFixed(2):null;
const any=a=>a.filter(x=>x>0).length;
console.log(file.split("/").pop().padEnd(18),
  'pairs',String(agg.par5.length).padEnd(3),
  'par5 mean',String(mean(agg.par5)).padEnd(6),'in',any(agg.par5),'pairs |',
  'par8 mean',String(mean(agg.par8)).padEnd(6),'in',any(agg.par8),'pairs |',
  'oblique',mean(agg.oblique),'contrary',mean(agg.contrary));
console.log('  melody  '+Object.keys(mel).map(f=>f+' '+mean(mel[f])).join('  '));
await b.close();
