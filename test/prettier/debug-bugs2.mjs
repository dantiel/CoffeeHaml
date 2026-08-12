import prettier from 'prettier';
import plugin from '../../dist/prettier/index.js';

const cases = [
  // Bug 1: import stripping — exact pattern from user
  ['Import stripping',
   '%div#main-content\n  - import { useState } from "react"\n  - import { useSimulation } from "./hooks/useSimulation"'
  ],
  // Bug 1b: with body
  ['Import + body',
   '- import { math } from "fmt1"\n- import { useState } from "react"\n\n%div#main-content\n  %Suspense\n    %AnimatePresence\n      %Routes\n        %Route'
  ],
  // Bug 2: arrow in attrs
  ['Arrow handler attrs',
   '%input{ onChange: (e) -> setVal(e.target.value) }'
  ],
  // Bug 2b: multi-line arrow
  ['Multi-line arrow',
   '%WaveSurfer\n  %div{ onReady: (ws) ->\n    setWaveSurfer(ws)\n    ws.load(url) }'
  ],
];

for (const [name, src] of cases) {
  console.log(`\n=== ${name} ===`);
  console.log('INPUT:', JSON.stringify(src.split('\n')[0]) + '...');
  try {
    const result = await prettier.format(src, {
      parser: 'coffeehaml',
      plugins: [plugin],
    });
    console.log('OUTPUT:');
    console.log(result);
  } catch(e) {
    console.log('ERROR:', e.message);
  }
}
