# Counterpoint norms measured from Palestrina. Run with -I; scores are
# arguments and are only read.
import sys, re, collections
PC={'c':0,'d':2,'e':4,'f':5,'g':7,'a':9,'b':11}
def midi(tok):
    m=re.search(r'([a-gA-G]+)', tok)
    if not m: return None
    s=m.group(1); L=s[0]; base=PC[L.lower()]
    octv = 4+len(s)-1 if L.islower() else 3-(len(s)-1)
    return base+(octv+1)*12+tok.count('#')-tok.count('-')
def dur(tok):
    m=re.match(r'(\d+)(\.*)', tok)
    if not m: return None
    d=int(m.group(1))
    if d==0: return None
    q=4.0/d
    if m.group(2): q=(4.0/d)*(2-0.5**len(m.group(2)))
    return q

vert=collections.Counter(); motion=collections.Counter()
par5=0; par8=0; pairsteps=0
mel=collections.Counter(); melN=0
files=0
for path in sys.argv[1:]:
    try: lines=[l.rstrip('\n') for l in open(path, encoding='utf-8', errors='replace')]
    except Exception: continue
    spines=None; grid=[]           # grid[t] = list of midi-or-None per voice
    cur=None; rem=None
    for l in lines:
        if not l or l.startswith('!'): continue
        f=l.split('\t')
        if l.startswith('**'):
            spines=len(f); cur=[None]*spines; rem=[0.0]*spines; continue
        if l.startswith('*') or l.startswith('='): continue
        if spines is None or len(f)!=spines: continue
        step=None
        for i,tok in enumerate(f):
            if tok=='.' or tok=='': continue
            d=dur(tok)
            if d is None: continue
            if 'r' in tok and not re.search(r'[a-gA-G]',tok): cur[i]=None
            else: cur[i]=midi(tok)
            rem[i]=d
            step=d if step is None else min(step,d)
        if step is None: continue
        grid.append(list(cur))
    if len(grid)<8: continue
    files+=1
    nv=len(grid[0])
    # melodic intervals per voice
    for v in range(nv):
        seq=[g[v] for g in grid if g[v] is not None]
        for a,b in zip(seq,seq[1:]):
            mel[min(abs(b-a),13)]+=1; melN+=1
    # vertical intervals and motion, every adjacent pair of sounding voices
    for t in range(1,len(grid)):
        for a in range(nv):
            for b in range(a+1,nv):
                p0,q0=grid[t-1][a],grid[t-1][b]
                p1,q1=grid[t][a],grid[t][b]
                if None in (p0,q0,p1,q1): continue
                iv=abs(p1-q1)%12
                vert[iv]+=1
                da,db=p1-p0,q1-q0
                if da==0 and db==0: continue
                pairsteps+=1
                if da==0 or db==0: motion['oblique']+=1
                elif (da>0)!=(db>0): motion['contrary']+=1
                elif da==db:
                    motion['parallel']+=1
                    iv0=abs(p0-q0)%12
                    if iv0==7 and iv==7: par5+=1
                    if iv0==0 and iv==0 and abs(p0-q0)>0: par8+=1
                else: motion['similar']+=1

NAME={0:'unison/octave',1:'minor 2nd',2:'major 2nd',3:'minor 3rd',4:'major 3rd',
      5:'4th',6:'tritone',7:'5th',8:'minor 6th',9:'major 6th',10:'m7',11:'M7'}
tv=sum(vert.values()); tm=sum(motion.values())
print('Palestrina — %d scores, %d vertical intervals, %d voice-pair moves'%(files,tv,tm))
print('\nvertical interval between any two voices:')
for k,v in sorted(vert.items(), key=lambda x:-x[1]):
    print('   %-14s %5.1f%%'%(NAME.get(k,str(k)), 100.0*v/tv))
cons=sum(vert[k] for k in (0,3,4,7,8,9)); diss=tv-cons
print('   consonant (3rds 6ths 5ths 8ves) %.1f%%   dissonant %.1f%%'%(100.0*cons/tv,100.0*diss/tv))
print('\nmotion between a pair of voices:')
for k,v in sorted(motion.items(), key=lambda x:-x[1]):
    print('   %-10s %5.1f%%'%(k, 100.0*v/tm))
print('   parallel 5ths %.3f%% of moves   parallel octaves %.3f%%'
      %(100.0*par5/max(1,pairsteps), 100.0*par8/max(1,pairsteps)))
print('\nmelodic interval inside one voice:')
rep=100.0*mel[0]/melN; st=100.0*(mel[1]+mel[2])/melN
th=100.0*(mel[3]+mel[4])/melN; lp=100.0*sum(v for k,v in mel.items() if k>=5)/melN
print('   repeats %.1f%%   steps %.1f%%   thirds %.1f%%   leaps 4th+ %.1f%%'%(rep,st,th,lp))
