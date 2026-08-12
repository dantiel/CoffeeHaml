import prettier from 'prettier';
import plugin from '../../dist/prettier/index.js';

// Try the exact pattern from the user: bare import (no - prefix) 
// at top of file followed by HAML
const cases = [
  ['Bare imports at top',
`import { useState } from "react"
import { useSimulation } from "./hooks/useSimulation"
%div#main-content
  %Sidebar`],
  ['- imports at top',
`- import { useState } from "react"
- import { useSimulation } from "./hooks/useSimulation"
%div#main-content
  %Sidebar`],
  ['Imports with attrs containing arrows',
`- import { math } from "fmt1"
%Sidebar{ onWaveCurveChange: (curve) -> setWaveCurve(curve) }`],
];

for (const [name, src] of cases) {
  console.log(`\n=== ${name} ===`);
  console.log('INPUT:');
  console.log(src);
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
