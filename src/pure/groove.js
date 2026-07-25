/* GROOVE templates — per-step timing offsets and velocity multipliers.

   t[i] nudges step i by that fraction of a step; v[i] scales its velocity.
   Straight sixteenths are mechanically even, which is not how anyone plays:
   these tables are what turns a grid into a feel. They are applied by writing
   the offsets into the pattern, so a groove bounces and exports exactly as it
   sounds rather than living only in the playback engine. */
export const GROOVES={
  straight:{name:'STRAIGHT', t:new Array(16).fill(0), v:new Array(16).fill(1)},
  mpc54:{name:'SWING 54%', t:[0,.08,0,.08,0,.08,0,.08,0,.08,0,.08,0,.08,0,.08], v:[1,.92,1,.92,1,.92,1,.92,1,.92,1,.92,1,.92,1,.92]},
  mpc58:{name:'SWING 58%', t:[0,.16,0,.16,0,.16,0,.16,0,.16,0,.16,0,.16,0,.16], v:[1,.9,1,.9,1,.9,1,.9,1,.9,1,.9,1,.9,1,.9]},
  mpc62:{name:'SWING 62%', t:[0,.24,0,.24,0,.24,0,.24,0,.24,0,.24,0,.24,0,.24], v:[1,.88,1,.88,1,.88,1,.88,1,.88,1,.88,1,.88,1,.88]},
  mpc66:{name:'SWING 66%', t:[0,.32,0,.32,0,.32,0,.32,0,.32,0,.32,0,.32,0,.32], v:[1,.86,1,.86,1,.86,1,.86,1,.86,1,.86,1,.86,1,.86]},
  // deliberately uneven — snare late, some hats early, kick a touch behind
  dilla:{name:'OFF-GRID', t:[0,.19,-.04,.13,.06,.21,-.03,.15,.02,.18,-.05,.12,.07,.23,-.02,.16],
         v:[1,.82,.9,.86,1,.8,.94,.84,.98,.82,.9,.88,1,.78,.92,.85]},
  push:{name:'LATIN PUSH', t:[0,-.05,-.02,-.07,0,-.05,-.02,-.08,0,-.05,-.02,-.07,0,-.06,-.03,-.09],
        v:[1,.88,.95,.85,1,.88,.95,.85,1,.88,.95,.85,1,.9,.95,.9]},
  drag:{name:'REGGAE DRAG', t:[.02,.1,.05,.12,.06,.12,.05,.14,.02,.1,.05,.12,.07,.13,.06,.15],
        v:[.9,.85,.95,.85,1,.85,.95,.85,.9,.85,.95,.85,1,.85,.95,.88]},
  shuffle:{name:'TRIPLET SHUFFLE', t:[0,.33,-.02,.31,0,.33,-.02,.31,0,.33,-.02,.31,0,.33,-.02,.31],
           v:[1,.84,.92,.84,1,.84,.92,.84,1,.84,.92,.84,1,.84,.92,.84]},
  halftime:{name:'HALF-TIME LEAN', t:[0,.06,.03,.09,.08,.12,.05,.11,.02,.07,.04,.1,.09,.14,.06,.12],
            v:[1,.8,.88,.8,.98,.8,.88,.8,1,.8,.88,.8,.96,.8,.88,.82]},
  loose:{name:'HUMAN LOOSE', t:[0,.04,-.03,.05,.02,-.04,.03,.06,-.02,.05,.03,-.03,.04,.06,-.02,.04],
         v:[1,.93,.96,.92,.99,.94,.95,.9,1,.92,.96,.93,.98,.91,.95,.94]},
};
