# Melodic norms from the Essen Folksong Collection (ABC).
# Run with -I; corpus paths come in as arguments and are only ever read.
import sys, re, collections, json

PC={'C':0,'D':2,'E':4,'F':5,'G':7,'A':9,'B':11}
TOK=re.compile(r"(\^{1,2}|_{1,2}|=)?([A-Ga-g])([,']*)")

def pitches(body):
    out=[]
    i=0
    while i<len(body):
        c=body[i]
        if c=='"':                       # chord symbol / annotation
            j=body.find('"',i+1); i=(j+1) if j>0 else i+1; continue
        if c=='!':
            j=body.find('!',i+1); i=(j+1) if j>0 else i+1; continue
        m=TOK.match(body,i)
        if m:
            acc,let,oct_=m.group(1),m.group(2),m.group(3)
            n=PC[let.upper()]+(60 if let.isupper() else 72)
            for ch in oct_: n+= -12 if ch==',' else 12
            if acc:
                if acc.startswith('^'): n+=len(acc)
                elif acc.startswith('_'): n-=len(acc)
            out.append(n); i=m.end(); continue
        i+=1
    return out

tunes=0
iv=collections.Counter()
leaps=0; recovered=0; same_dir_after_leap=0
dirchg=0; dirtot=0
ranges=[]; lens=[]
for path in sys.argv[1:]:
    txt=open(path, encoding='utf-8', errors='replace').read()
    for chunk in re.split(r'\nX:', txt):
        body_lines=[]
        for line in chunk.split('\n'):
            if re.match(r'^[A-Zw]:', line): continue   # headers and lyrics
            if line.startswith('%'): continue
            body_lines.append(line)
        ps=pitches(' '.join(body_lines))
        if len(ps)<8: continue
        tunes+=1; lens.append(len(ps)); ranges.append(max(ps)-min(ps))
        prev=None
        for a,b in zip(ps,ps[1:]):
            d=b-a; iv[min(abs(d),13)]+=1
            if prev is not None and prev!=0 and d!=0:
                dirtot+=1
                if (prev>0)!=(d>0): dirchg+=1
            if abs(d)>=5:
                leaps+=1
                nxt=None
                k=ps.index(b) if False else None
            prev=d if d!=0 else prev
        # leap recovery, done properly over the triple
        for a,b,c in zip(ps,ps[1:],ps[2:]):
            d1,d2=b-a,c-b
            if abs(d1)>=5:
                if d2!=0 and (d1>0)!=(d2>0) and abs(d2)<=2: recovered+=1
                elif d2!=0 and (d1>0)==(d2>0): same_dir_after_leap+=1

tot=sum(iv.values())
print('Essen Folksong Collection — %d melodies, %d intervals'%(tunes,tot))
print('\nmelodic interval (semitones, either direction):')
names={0:'unison (repeat)',1:'semitone',2:'tone',3:'minor 3rd',4:'major 3rd',
       5:'4th',6:'tritone',7:'5th',8:'minor 6th',9:'major 6th',10:'m7',11:'M7',12:'octave',13:'wider'}
cum=0
for k in sorted(iv):
    pct=100.0*iv[k]/tot; cum+=pct
    print('   %-16s %5.1f%%   (running %5.1f%%)'%(names.get(k,str(k)),pct,cum))
step=100.0*(iv[1]+iv[2])/tot
rep =100.0*iv[0]/tot
thir=100.0*(iv[3]+iv[4])/tot
big =100.0*sum(v for k,v in iv.items() if k>=5)/tot
print('\n   repeats %.1f%%   steps %.1f%%   thirds %.1f%%   leaps of a 4th+ %.1f%%'%(rep,step,thir,big))
print('   after a leap, the line turns back by a step %.1f%% of the time'
      %(100.0*recovered/max(1,recovered+same_dir_after_leap)))
print('   direction changes on %.1f%% of moves'%(100.0*dirchg/max(1,dirtot)))
ranges.sort(); lens.sort()
print('   melody range: median %d semitones (%d-%d typical)'
      %(ranges[len(ranges)//2], ranges[len(ranges)//10], ranges[-len(ranges)//10]))
print('   notes per melody: median %d'%lens[len(lens)//2])
json.dump({'repeatPct':rep,'stepPct':step,'thirdPct':thir,'leapPct':big,
  'leapRecoveryPct':100.0*recovered/max(1,recovered+same_dir_after_leap),
  'dirChangePct':100.0*dirchg/max(1,dirtot),
  'rangeMedian':ranges[len(ranges)//2],'tunes':tunes},
  open(sys.argv[0].rsplit('/',1)[0]+'/norms.json','w'), indent=1)
