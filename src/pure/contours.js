/* MELODIC SHAPES, WRITTEN BY MAGENTA AND FILTERED BEFORE THEY GOT HERE.

   infill() chose every pitch from the chord and the key. That is
   harmonically safe and it cannot write a tune: the shape of the line was
   whatever fell out of "a chord tone here, a scale tone there", which is
   why its first version came out as arpeggios and why the fix after that
   bought stepwise motion rather than contour. A melody has a direction it
   is going in, and nothing in the app knew what one looked like.

   These do. Each row is an INTERVAL SEQUENCE from Google's
   chord_pitches_improv checkpoint, which is trained on real melody. Stored
   as intervals rather than pitches on purpose, three times over:

   - a shape transposes to any key and any progression, where pitches do not;
   - the harmony stays where it was. infill() still picks the pitch CLASS by
     its own rules -- chord tone on a strong beat, scale tone on a weak one,
     never a semitone above a chord tone -- and the contour only says which
     OCTAVE and direction to reach for. The model cannot introduce a clash
     it would otherwise have rejected;
   - and the RHYTHM is not taken from the model at all. AGENTS.md records
     what happens when it is: this checkpoint "writes a pitch per step, and
     its step numbers are not a rhythm", and dealing its pitches onto
     invented step offsets is what gave HOLLOWAY an audible stumble. The
     rhythm stays with the cell library that already works.

   WHY THEY ARE BAKED IN RATHER THAN GENERATED LIVE. The model needs
   TensorFlow.js and a checkpoint off the network. This app is one
   self-contained HTML file that works offline, and 19KB of contours costs
   nothing while a megabyte of TF.js and a runtime fetch would cost the
   thing that makes it an app you can open on a plane.

   THE FILTER IS MOST OF THE VALUE. Measured across 256 draws, the same
   temperature gave offNorm 3.4 on one and 27.9 on the next -- the model
   writes drones about as often as it writes tunes. 126 were thrown
   out: off-norm, under five semitones of range, or over 45% repeated notes.
   What is left has a mean that sits on the Essen norms measured from 8,514
   folk melodies, which is where the app's own melodic check scores against:

       step 47.0%  (norm 46.9)      third 18.5%  (norm 19.0)
       rep  23.7%  (norm 21.1)      leap  10.8%  (norm 13.1)

   Regenerate with scripts/magenta-contours.cjs. Keep the filter. */

export const MAGENTA_CONTOURS = [
  {"iv":[-4,0,-5,2,-2,9,1,0,0,-1,-2,0,-2,2,-4,2,4,-2,3],"n":20,"range":10,"step":47.4,"repeat":21.1,"leap":10.5,"recur":0,"off":1.29},
  {"iv":[0,1,4,7,-2,-2,5,-1,-2,-2,-3,0,0,0,-2,0,2,3,4,-2,-10,1,2,3,2,2],"n":27,"range":13,"step":50,"repeat":19.2,"leap":11.5,"recur":12,"off":1.69},
  {"iv":[-2,-2,-3,0,3,-5,0,2,2,-2,0,7,-4,2],"n":15,"range":9,"step":42.9,"repeat":21.4,"leap":14.3,"recur":0,"off":2},
  {"iv":[4,7,0,3,-3,-1,2,-2,-1,1,1,0,0],"n":14,"range":14,"step":46.2,"repeat":23.1,"leap":7.7,"recur":0,"off":3.05},
  {"iv":[0,5,3,-1,1,1,-1,-3,0,2,0,0,3,-2,-1,-2],"n":17,"range":10,"step":50,"repeat":25,"leap":6.3,"recur":0,"off":3.52},
  {"iv":[4,5,-2,2,0,1,0,-1],"n":9,"range":10,"step":50,"repeat":25,"leap":12.5,"recur":0,"off":3.52},
  {"iv":[7,-2,0,-2,2,0,-7,2,-2,0,2,3,-3,-2,0,5,2],"n":18,"range":9,"step":47.1,"repeat":23.5,"leap":17.6,"recur":12.5,"off":3.59},
  {"iv":[0,-2,2,-2,-2,-1,15,0,-3,3,-3,-2,-2,-3,-2,0,2,0],"n":19,"range":15,"step":50,"repeat":22.2,"leap":5.6,"recur":11.8,"off":3.75},
  {"iv":[-3,0,0,8,0,-1,-9,2,2,-4,2,2],"n":13,"range":10,"step":41.7,"repeat":25,"leap":16.7,"recur":9.1,"off":3.76},
  {"iv":[2,1,-1,-2,3,0,4,0,-2,-2,-5,0,4,0,1,-1,3,0,-2],"n":20,"range":9,"step":47.4,"repeat":26.3,"leap":5.3,"recur":27.8,"off":3.89},
  {"iv":[-11,2,-3,0,3,4,-2,-4,-1,-4,2,2,3,0,-1,-1,-1,0,0,-2,2,5,0,2,1,2,-2,-1,-2,-3,-1,7,-5,2,0,-2,-3,1],"n":39,"range":16,"step":52.6,"repeat":15.8,"leap":10.5,"recur":8.1,"off":3.92},
  {"iv":[3,11,0,-2,-2,2,-2,4,-7,0,-1,-1,0,-5,-2,0,4,-4],"n":19,"range":16,"step":38.9,"repeat":22.2,"leap":16.7,"recur":0,"off":3.98},
  {"iv":[0,-5,0,-4,14,-2,-6,-1,0,-1,1,-1,3,2,-4,0,2,2,-2,-5,2,-2],"n":23,"range":14,"step":50,"repeat":18.2,"leap":18.2,"recur":4.8,"off":4.12},
  {"iv":[-1,-1,1,0,0,0,1,-2,-3,4,-2,7,-1,-1,0,0,2,-3,-2,3,-2,2,-4],"n":24,"range":9,"step":52.2,"repeat":21.7,"leap":4.3,"recur":13.6,"off":4.35},
  {"iv":[-2,-2,-5,0,-1,3,-5,5,2,-1,4,2,0,2,0,-2],"n":17,"range":14,"step":50,"repeat":18.8,"leap":18.8,"recur":6.7,"off":4.4},
  {"iv":[-2,0,2,0,3,0,2,-2,9,-2,-3,-2,-2,-5,0,0,-2,0,2,4],"n":21,"range":16,"step":45,"repeat":30,"leap":10,"recur":15.8,"off":4.47},
  {"iv":[0,-1,0,1,4,7,-5,-2,3,0,-3,-2,-5,-3,0,3,-1,8,-2,0,-3,-2,2,1],"n":25,"range":17,"step":37.5,"repeat":20.8,"leap":16.7,"recur":8.7,"off":4.81},
  {"iv":[0,0,-4,9,0,0,3,0,-3,-2,-7,4,-2,3,2,2,-2,2,2,1],"n":21,"range":12,"step":40,"repeat":25,"leap":10,"recur":10.5,"off":4.97},
  {"iv":[-1,-2,3,-3,2,1,0,-1,1,-6,3,3,0,0],"n":15,"range":6,"step":42.9,"repeat":21.4,"leap":7.1,"recur":0,"off":4.97},
  {"iv":[-2,4,3,-2,-5,2,0,-2,-5,5,0,-1,-2,-2,4,3,0,0,7],"n":20,"range":14,"step":36.8,"repeat":21.1,"leap":21.1,"recur":16.7,"off":5.03},
  {"iv":[0,-2,7,1,-1,-2,-3,0,5,-2],"n":11,"range":8,"step":50,"repeat":20,"leap":20,"recur":0,"off":5.03},
  {"iv":[0,-2,5,0,2,-2,2,-5,3,2,3,-5,2,0,-2,-3,1,-1,1,2],"n":21,"range":10,"step":55,"repeat":15,"leap":15,"recur":5.3,"off":5.03},
  {"iv":[5,0,2,-2,0,0,3,0,-3,-2,2,-2,2,-2,0,-5],"n":17,"range":10,"step":43.8,"repeat":31.3,"leap":12.5,"recur":26.7,"off":5.1},
  {"iv":[1,1,-3,1,-3,-5,-2,5,-3,5,2,1,2,-2,-3,-2,0,10,-1,-2,0,2,0,1,-3,-2,2,5,-3,1,2,0,0,-3,3,-3,0,-2,2,-2,-2,4,-2,2,-2,-2],"n":47,"range":17,"step":54.3,"repeat":13,"leap":10.9,"recur":28.9,"off":5.12},
  {"iv":[9,-5,3,-7,2,-2,0,3,-1,1,0,-3,3,-1,-4,2,2,1,2,0,0,7,0,-2,0,0,-5],"n":28,"range":14,"step":37,"repeat":25.9,"leap":18.5,"recur":11.5,"off":5.15},
  {"iv":[0,-2,0,2,2,0,3,-3,-2,-2,2,-2,2,-2,9,0,-2,-2,-3,-2,5],"n":22,"range":9,"step":57.1,"repeat":19,"leap":9.5,"recur":25,"off":5.15},
  {"iv":[12,-3,-2,-2,1,1,-5,0,0,-3,5,0,-2,-2,2,2,1],"n":18,"range":13,"step":52.9,"repeat":17.6,"leap":17.6,"recur":6.3,"off":5.32},
  {"iv":[3,-1,0,5,-2,-2,-3],"n":8,"range":7,"step":42.9,"repeat":14.3,"leap":14.3,"recur":0,"off":5.4},
  {"iv":[3,4,-4,-5,0,0,5,-1,0,1,0,-1,1,-1],"n":15,"range":9,"step":35.7,"repeat":28.6,"leap":14.3,"recur":0,"off":5.57},
  {"iv":[0,0,-9,2,5,2,-2,-2,0,2,-3,-2,-2],"n":14,"range":9,"step":53.8,"repeat":23.1,"leap":15.4,"recur":8.3,"off":5.63},
  {"iv":[3,0,-7,5,-1,-2,0,-2,-1,0,-2],"n":12,"range":10,"step":45.5,"repeat":27.3,"leap":18.2,"recur":10,"off":5.65},
  {"iv":[0,2,2,-2,-2,9,-2,0,-3,1,2,-3],"n":13,"range":9,"step":58.3,"repeat":16.7,"leap":8.3,"recur":0,"off":5.74},
  {"iv":[2,7,3,0,-1,-2,-2],"n":8,"range":12,"step":57.1,"repeat":14.3,"leap":14.3,"recur":0,"off":5.74},
  {"iv":[2,2,5,-2,0,-3,-2,2,3],"n":10,"range":9,"step":55.6,"repeat":11.1,"leap":11.1,"recur":0,"off":5.96},
  {"iv":[0,2,-3,0,0,-5,3,5,-2,-1,1,2,-7],"n":14,"range":8,"step":38.5,"repeat":23.1,"leap":23.1,"recur":0,"off":6},
  {"iv":[2,0,-2,0,-2,-3,-2,0,0,-2,2,2,0,10,-2,-3,0,3],"n":19,"range":14,"step":44.4,"repeat":33.3,"leap":5.6,"recur":29.4,"off":6.14},
  {"iv":[-1,-2,-2,7,0,0,2,-2,5,2,-3,-2,-2,-2,4,1,4,-12],"n":19,"range":14,"step":55.6,"repeat":11.1,"leap":16.7,"recur":11.8,"off":6.14},
  {"iv":[3,1,-2,-2,-1,1,2,0,-2,-1,1,-1,-1,5,0,0,-3,2,3,0,0,-7,0,0,0,0,4],"n":28,"range":7,"step":44.4,"repeat":33.3,"leap":7.4,"recur":23.1,"off":6.14},
  {"iv":[7,0,0,-2,2,-4,-3,3,4,-9,2,2,3,2,-2,0],"n":17,"range":9,"step":37.5,"repeat":18.8,"leap":12.5,"recur":0,"off":6.15},
  {"iv":[8,0,0,2,-2,0,0,-8,-3,1,-2,2,-2,12,-3,-2,-2,-1,-4,5,2,-5,-2,7,-5,0,-2,0,-5,4,-4],"n":32,"range":19,"step":38.7,"repeat":19.4,"leap":25.8,"recur":10,"off":6.38},
  {"iv":[0,3,-1,-4,2,1,2,0,0,-2,-3,2,-2,-2],"n":15,"range":7,"step":57.1,"repeat":21.4,"leap":0,"recur":0,"off":6.53},
  {"iv":[4,3,2,0,0,2,0,-2,-1,1],"n":11,"range":11,"step":50,"repeat":30,"leap":0,"recur":11.1,"off":6.53},
  {"iv":[0,0,-2,-2,2,2,3,-3],"n":9,"range":7,"step":50,"repeat":25,"leap":0,"recur":0,"off":6.53},
  {"iv":[-3,-2,-2,0],"n":5,"range":7,"step":50,"repeat":25,"leap":0,"recur":0,"off":6.53},
  {"iv":[0,0,0,0,-3,7,-2,-2,0,-1,3,3,2,2,-2],"n":16,"range":12,"step":40,"repeat":33.3,"leap":6.7,"recur":14.3,"off":6.64},
  {"iv":[3,0,2,-2,2,-5,-2,5,2,-2,-3,0,-2,-5,-2],"n":16,"range":14,"step":53.3,"repeat":13.3,"leap":20,"recur":14.3,"off":6.69},
  {"iv":[4,1,-1,3,0,-2,0,-1,1,11,0,0,-4,4,-5,1,-5,7,-3,-3,1,2],"n":23,"range":16,"step":36.4,"repeat":18.2,"leap":18.2,"recur":0,"off":6.7},
  {"iv":[0,3,2,2,1,0,-8,8,-3],"n":10,"range":8,"step":33.3,"repeat":22.2,"leap":22.2,"recur":0,"off":6.76},
  {"iv":[0,-2,-2,-3,2,1,2,5,0,0,-2],"n":12,"range":10,"step":54.5,"repeat":27.3,"leap":9.1,"recur":10,"off":6.93},
  {"iv":[-2,0,4,-4,0,0,2,1,0,1,-4,0,2,0,0,0,-2,-2,-1,-2,3,4,-2,2],"n":25,"range":9,"step":45.8,"repeat":33.3,"leap":0,"recur":17.4,"off":7.06},
  {"iv":[0,2,-2,0,-7,5,4,-2,0,0,-2,2,-3,-4,0,0,5,2,8,-3,-3,-2],"n":23,"range":15,"step":31.8,"repeat":27.3,"leap":18.2,"recur":9.5,"off":7.52},
  {"iv":[1,-1,0,0,-5,3,-2,5,-3,2,1,1,-2,1,9,-5,-2,2,2,3],"n":21,"range":15,"step":55,"repeat":10,"leap":20,"recur":0,"off":7.53},
  {"iv":[0,5,-2,-3,0,0,0,1,2,2,-4],"n":12,"range":5,"step":36.4,"repeat":36.4,"leap":9.1,"recur":10,"off":7.66},
  {"iv":[3,7,2,-4,-3,-2,-1,1,-3,-2,12,0,-5,5,0,-2,-3,0,0],"n":20,"range":14,"step":31.6,"repeat":21.1,"leap":21.1,"recur":5.6,"off":7.66},
  {"iv":[0,3,2,0,-5,-2,-2,0,0,-1,1,2],"n":13,"range":10,"step":50,"repeat":33.3,"leap":8.3,"recur":0,"off":7.69},
  {"iv":[2,-2,4,0,3,2,0,0,0,1,-1,1],"n":13,"range":10,"step":50,"repeat":33.3,"leap":0,"recur":9.1,"off":7.69},
  {"iv":[-4,0,0,0,4,0,1,-1,-2,2,-2,-2],"n":13,"range":5,"step":50,"repeat":33.3,"leap":0,"recur":9.1,"off":7.69},
  {"iv":[-3,-2,9,-2,-2,2,-2,7,0,1,1,0,2,1,0,0,2,2],"n":19,"range":21,"step":61.1,"repeat":22.2,"leap":11.1,"recur":11.8,"off":7.69},
  {"iv":[0,0,-2,-3,3,-3,1,2,4,1,-1,-2,-3,1,2,0],"n":17,"range":8,"step":50,"repeat":18.8,"leap":0,"recur":20,"off":7.7},
  {"iv":[0,0,-3,3,2,2,0,-2,-2],"n":10,"range":7,"step":44.4,"repeat":33.3,"leap":0,"recur":0,"off":7.75},
  {"iv":[0,2,3,0,-1,0,-2,-2,-3],"n":10,"range":8,"step":44.4,"repeat":33.3,"leap":0,"recur":0,"off":7.75},
  {"iv":[1,-3,8,-8,5,-3,-2,2,1,-3,2,1,-3,1,-3,0,2,1],"n":19,"range":10,"step":50,"repeat":5.6,"leap":16.7,"recur":29.4,"off":7.75},
  {"iv":[2,2,3,-2,-1,-2,2,-2,2,0,0,-2,2,-4,2,-2,-3,-2,5,2,-2,-3,-2,5,-3,0,3],"n":28,"range":12,"step":59.3,"repeat":11.1,"leap":7.4,"recur":26.9,"off":7.82},
  {"iv":[7,2,0,-2,2,-4,4,-2,0,10,-1,-2,-2,0,-1,1,-3,-2,-2,-1,-2,0,2,1],"n":25,"range":17,"step":62.5,"repeat":16.7,"leap":8.3,"recur":17.4,"off":7.83},
  {"iv":[0,2,-5,0,-4,-3,2,1,-1,0,0,0,0,1,-1,4,1,7,0],"n":20,"range":14,"step":36.8,"repeat":36.8,"leap":10.5,"recur":16.7,"off":7.9},
  {"iv":[0,-2,9,-2,-7,0,0,2,7,-2,2,3,0,-3],"n":15,"range":12,"step":35.7,"repeat":28.6,"leap":21.4,"recur":0,"off":7.92},
  {"iv":[0,0,5,3,0,-6,0,2,1,-2,0,4,-2,-2],"n":15,"range":8,"step":35.7,"repeat":35.7,"leap":14.3,"recur":0,"off":7.92},
  {"iv":[2,-2,-2,-7,-1,1,0,0,0,0,4,5,0,2],"n":15,"range":12,"step":42.9,"repeat":35.7,"leap":14.3,"recur":15.4,"off":7.93},
  {"iv":[3,-1,3,-3,-2,3,9,2,-7,-2,0,0,0],"n":14,"range":14,"step":30.8,"repeat":23.1,"leap":15.4,"recur":8.3,"off":8.04},
  {"iv":[1,1,-1,2,0,-2,-1,3,-1,-1,-1,-2,-3,2,1,2,3,0,-1,1,-5,0,-2,4,3,-3,3,-7],"n":29,"range":8,"step":57.1,"repeat":10.7,"leap":7.1,"recur":7.4,"off":8.15},
  {"iv":[0,3,7,0,0,0,0,2,1,1,-2,-2,-3,0,1,0,2,2,-2,0,2,0,-2,-2,4,-2],"n":27,"range":14,"step":50,"repeat":34.6,"leap":3.8,"recur":20,"off":8.33},
  {"iv":[3,0,0,-5,2,-2,-2,2,2,0,1,2,2],"n":14,"range":9,"step":61.5,"repeat":23.1,"leap":7.7,"recur":8.3,"off":8.33},
  {"iv":[0,0,0,2,2,2,-4,2,-2,0,-2,-1,-3],"n":14,"range":10,"step":53.8,"repeat":30.8,"leap":0,"recur":16.7,"off":8.33},
  {"iv":[-5,2,2,-2,-2,2,2,3,-3,-2,0],"n":12,"range":7,"step":63.6,"repeat":9.1,"leap":9.1,"recur":10,"off":8.39},
  {"iv":[3,0,0,2,2,-4,2],"n":8,"range":7,"step":42.9,"repeat":28.6,"leap":0,"recur":0,"off":8.55},
  {"iv":[1,-1,-2,-3,1,4,-4,0,-5,2,3,2,2,-2,2,-2,3,-3,0,-2,-1,1,2,0],"n":25,"range":10,"step":58.3,"repeat":12.5,"leap":4.2,"recur":4.3,"off":8.74},
  {"iv":[5,3,-1,-2,3,0],"n":7,"range":8,"step":33.3,"repeat":16.7,"leap":16.7,"recur":0,"off":8.97},
  {"iv":[3,-1,-2,-2,-2,-1,-2,2,0,-2,3,9,0,-2,2,2,0,-2,7,-2],"n":21,"range":19,"step":65,"repeat":15,"leap":10,"recur":31.6,"off":9.08},
  {"iv":[0,-3,-2,5,4,0,0,0,-4,2,-2,2],"n":13,"range":9,"step":33.3,"repeat":33.3,"leap":8.3,"recur":9.1,"off":9.14},
  {"iv":[0,3,-3,0,5,0,0,-2,-2,2,2,3],"n":13,"range":8,"step":33.3,"repeat":33.3,"leap":8.3,"recur":0,"off":9.14},
  {"iv":[-4,4,-2,0,0,0,-2,0,-3,-2,2,1],"n":13,"range":9,"step":41.7,"repeat":33.3,"leap":0,"recur":18.2,"off":9.14},
  {"iv":[-1,0,3,-10,5,3,2,-2,4,-4,-1,-4,0,0],"n":15,"range":12,"step":28.6,"repeat":21.4,"leap":14.3,"recur":0,"off":9.14},
  {"iv":[0,2,-2,-1,-4,0,0,0,5,0,0,-1,5,0,-7,-2,4,3,2],"n":20,"range":9,"step":31.6,"repeat":36.8,"leap":15.8,"recur":16.7,"off":9.24},
  {"iv":[3,2,3,-3,-7,2,1,2,2,0,-2,-3,0,3,2,3],"n":17,"range":10,"step":43.8,"repeat":12.5,"leap":6.3,"recur":13.3,"off":9.28},
  {"iv":[0,5,-3,-2,-3,3,0,2,-2,-3,0,3,0,2,-2,0,2],"n":18,"range":8,"step":35.3,"repeat":29.4,"leap":5.9,"recur":31.3,"off":9.39},
  {"iv":[-2,2,5,7,0,-2,-5,0,3,2,2,-2,3,-1,-8,6,-3,5,-2,2,-4,-8,0,0,8],"n":26,"range":15,"step":36,"repeat":16,"leap":32,"recur":4.2,"off":9.47},
  {"iv":[-2,-5,7,0,2,0,-2,2],"n":9,"range":9,"step":50,"repeat":25,"leap":25,"recur":0,"off":9.47},
  {"iv":[7,0,0,1,-1,-2,2],"n":8,"range":8,"step":57.1,"repeat":28.6,"leap":14.3,"recur":0,"off":9.48},
  {"iv":[0,0,0,-2,0,2,-2,-5,8,2,0,-5,2,-2,0,2,-2],"n":18,"range":10,"step":47.1,"repeat":35.3,"leap":17.6,"recur":31.3,"off":9.48},
  {"iv":[-2,2,2,-2,-2,2,-3,3,2,-4,0,0,0,0,2,2,0,-2,-2,2,-2,2,-2,0],"n":25,"range":5,"step":62.5,"repeat":25,"leap":0,"recur":39.1,"off":9.78},
  {"iv":[0,0,-2,-3,3,2,-2,2,-2,-2,2,2],"n":13,"range":5,"step":66.7,"repeat":16.7,"leap":0,"recur":18.2,"off":9.91},
  {"iv":[2,1,2,0,-2,-3],"n":7,"range":5,"step":66.7,"repeat":16.7,"leap":0,"recur":0,"off":9.91},
  {"iv":[0,0,4,-4,2,2,3,0,-5,2,0,-4,4,2,1,0,-2,-1,0,0],"n":21,"range":7,"step":35,"repeat":35,"leap":5,"recur":5.3,"off":9.97},
  {"iv":[-10,3,0,0,7,-2,-1,-2,0,-2,-2,-1,0,-2,0,0,0,2,2,1,2,2,1,2,2],"n":26,"range":14,"step":60,"repeat":28,"leap":8,"recur":37.5,"off":10.03},
  {"iv":[2,0,5,-2,2,-2,2,-2,0,4,0,0,-2,-2,2,0,0],"n":18,"range":9,"step":52.9,"repeat":35.3,"leap":5.9,"recur":31.3,"off":10.14},
  {"iv":[-1,-1,8,3,-1,-9,2,0,12],"n":10,"range":15,"step":44.4,"repeat":11.1,"leap":33.3,"recur":0,"off":10.14},
  {"iv":[2,-2,0,0,2,2,-2,-2,0,2,0,0,-2,2,0,-3,-2,3,0,0,2,0,-2,-1,1,-3],"n":27,"range":7,"step":53.8,"repeat":34.6,"leap":0,"recur":36,"off":10.26},
  {"iv":[-1,1,-3,-2,-3,5,0,2,1,-3,0,-1,-1,-2,-1,1,2,0,-3,3,2,2,1,-1,-4,-3,1,2,2,2],"n":31,"range":8,"step":63.3,"repeat":10,"leap":3.3,"recur":20.7,"off":10.41},
  {"iv":[-2,-2,4,0,-2,2,1,-1,1,2,2,0,-9,2,2,-2,2,3,7,-2,-3,-2,-2,-1,6,-6],"n":27,"range":14,"step":65.4,"repeat":7.7,"leap":15.4,"recur":12,"off":10.41},
  {"iv":[1,2,2,1,-3,-2,5,4,-6,-3],"n":11,"range":10,"step":50,"repeat":0,"leap":20,"recur":0,"off":10.53},
  {"iv":[3,5,2,-2,-3,3,2,-7,2,2,1,2,-3],"n":14,"range":10,"step":53.8,"repeat":0,"leap":15.4,"recur":0,"off":10.53},
  {"iv":[0,0,-2,2,1,0,-3,3,-1,0,3,0,0,-3,-2,-2,0,2],"n":19,"range":7,"step":38.9,"repeat":38.9,"leap":0,"recur":11.8,"off":10.53},
  {"iv":[2,0,2,0,-2,0,-5,5,0,2,-2,0,0,-3,1,-1,3,0,0],"n":20,"range":7,"step":36.8,"repeat":42.1,"leap":10.5,"recur":22.2,"off":10.53},
  {"iv":[2,8,-1,-1,-5,-5,5,7,0,-3,1,1,0,1,-1,-2],"n":17,"range":12,"step":50,"repeat":12.5,"leap":31.3,"recur":0,"off":10.65},
  {"iv":[3,0,-2,4,3,2,0,2,1,0,-3,2,0],"n":14,"range":13,"step":38.5,"repeat":30.8,"leap":0,"recur":8.3,"off":10.74},
  {"iv":[-1,0,3,2,3,-1,3,0,0,2,-7,3,0],"n":14,"range":12,"step":30.8,"repeat":30.8,"leap":7.7,"recur":8.3,"off":10.74},
  {"iv":[2,3,0,-1,-2,2,1,2,0,2,-2,-2,4,-4,-3,2],"n":17,"range":9,"step":62.5,"repeat":12.5,"leap":0,"recur":0,"off":10.83},
  {"iv":[0,0,-2,2,1,4,0],"n":8,"range":7,"step":42.9,"repeat":42.9,"leap":0,"recur":0,"off":10.9},
  {"iv":[2,-2,-2,-3,7,-2,-2,2,0,-2,4,0,0,0,0,0,0,0,0,-2,-7],"n":22,"range":9,"step":38.1,"repeat":42.9,"leap":9.5,"recur":40,"off":10.9},
  {"iv":[8,1,0,-2,-2,-1,1,2,-2,-1,3,-3,0,-2,-2,-1],"n":17,"range":10,"step":68.8,"repeat":12.5,"leap":6.3,"recur":26.7,"off":10.95},
  {"iv":[2,2,1,-1,-2,2,-2,-3,0,-2,3,2,2,-2,-5,0],"n":17,"range":8,"step":68.8,"repeat":12.5,"leap":6.3,"recur":13.3,"off":10.95},
  {"iv":[-3,7,-1,-3,-3,3,-3,0,3,-3,1,1,-2,2,0,0,-13],"n":18,"range":18,"step":29.4,"repeat":17.6,"leap":11.8,"recur":6.3,"off":11.11},
  {"iv":[2,2,4,1,3,-3,-4,4,-1,-1,0,0,0,0,-3,1],"n":17,"range":12,"step":37.5,"repeat":25,"leap":0,"recur":13.3,"off":11.22},
  {"iv":[2,-4,-3,-2,-2,0,0,0],"n":9,"range":11,"step":37.5,"repeat":37.5,"leap":0,"recur":14.3,"off":11.22},
  {"iv":[2,2,3,-3,-2,-5,-2,7,0,-7,2,-2,2,3,4,-7,-2,5,-3,-5,-2,3],"n":23,"range":17,"step":40.9,"repeat":4.5,"leap":27.3,"recur":9.5,"off":11.25},
  {"iv":[5,-2,-3,-2,5,-3,3,0,2,2,-4],"n":12,"range":9,"step":36.4,"repeat":9.1,"leap":18.2,"recur":0,"off":11.25},
  {"iv":[5,0,-3,-2,4,0,-4,4,0,3,-3,1,0,0,-1,-2,-2,-3,3,4,1,-1,1,-3],"n":25,"range":10,"step":33.3,"repeat":20.8,"leap":4.2,"recur":4.3,"off":11.36},
  {"iv":[-2,2,0,-2,0,0,2,5,0,-2,12,-17,2,7],"n":15,"range":17,"step":42.9,"repeat":28.6,"leap":28.6,"recur":7.7,"off":11.5},
  {"iv":[-1,1,-1,3,-3,-2,7,-2,-3],"n":10,"range":7,"step":55.6,"repeat":0,"leap":11.1,"recur":0,"off":11.52},
  {"iv":[0,0,2,1,4,-2,-2,-1,-2,-2],"n":11,"range":9,"step":70,"repeat":20,"leap":0,"recur":11.1,"off":11.58},
  {"iv":[3,-3,5,-2,-5,-2,7,-8,0,1,2],"n":12,"range":10,"step":36.4,"repeat":9.1,"leap":36.4,"recur":0,"off":11.66},
  {"iv":[0,0,0,0,0,1,-1,-2,-2,-1,-2,0,5,-2,0,0,2,2,0,-2,-2,2,-5],"n":24,"range":8,"step":52.2,"repeat":39.1,"leap":8.7,"recur":31.8,"off":11.68},
  {"iv":[0,0,0,-2,2,0,0,-2,2,-4,2,-2,2,-2,2,0,0,0,0,0,2,-5,-2],"n":24,"range":7,"step":47.8,"repeat":43.5,"leap":4.3,"recur":54.5,"off":11.68},
  {"iv":[-2,2,-5,8,-1,0,-1,1,-2,-2,-3,-2],"n":13,"range":10,"step":66.7,"repeat":8.3,"leap":16.7,"recur":0,"off":11.69},
  {"iv":[-2,2,2,-4,2,9,-2,-7,7,-14,2,5,5,-2,2,0,-3,1,1,1,-2,2,4,-2],"n":25,"range":16,"step":58.3,"repeat":4.2,"leap":25,"recur":13,"off":11.69},
  {"iv":[0,0,0,1,2,-2,-1,0,0,0,3,0,2,-2,4,0,-4,2],"n":19,"range":7,"step":38.9,"repeat":44.4,"leap":0,"recur":23.5,"off":11.7},
  {"iv":[3,0,0,-3,3,0,2,0,-2,2,0,0,-2,2,-2,0,0,2],"n":19,"range":5,"step":38.9,"repeat":44.4,"leap":0,"recur":41.2,"off":11.7},
  {"iv":[2,0,2,0,-9,-3,0,-2,5,0,0,0,-3,3,2,0,0,-2],"n":19,"range":14,"step":27.8,"repeat":44.4,"leap":11.1,"recur":29.4,"off":11.7},
  {"iv":[0,0,0,-2,-1,-2,7,0,-4],"n":10,"range":7,"step":33.3,"repeat":44.4,"leap":11.1,"recur":12.5,"off":11.7},
  {"iv":[-1,0,-2,0,0,3,0,0,-1,1,2,2],"n":13,"range":7,"step":50,"repeat":41.7,"leap":0,"recur":9.1,"off":11.86}
];

/* Pick one by seed, long enough for the slots being written. Falls back to
   the longest it has rather than returning null, because a caller that has
   asked for a shape wants a shape. */
export function pickContour(seed, minNotes){
  const want = Math.max(2, minNotes | 0);
  const fit = MAGENTA_CONTOURS.filter(c => c.iv.length >= want - 1);
  const pool = fit.length ? fit : MAGENTA_CONTOURS;
  const s = (seed | 0) >>> 0;
  return pool[s % pool.length];
}
