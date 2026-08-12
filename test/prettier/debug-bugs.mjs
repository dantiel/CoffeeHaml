import prettier from 'prettier';
import plugin from '../../dist/prettier/index.js';

const cases = [
  // Bug 1: import stripping
  ['Import stripping',
   '- import { math } from "fmt1"\n- import { useState } from "react"\n%div\n  = (Math.sqrt(4))'],
  // Bug 2: arrow handler
  ['Arrow handler',
   '- onChange = (e) -> setVal e.target.value\n%div'],
];

for (const [name, src] of cases) {
  console.log(`\n=== ${name} ===`);
  console.log('INPUT:', JSON.stringify(src));
  try {
    const result = await prettier.format(src, {
      parser: 'coffeehaml',
      plugins: [plugin],
    });
    console.log('OUTPUT:', JSON.stringify(result));
  } catch(e) {
    console.log('ERROR:', e.message);
  }
}
