import { formatCoffeeScript, formatCoffeeScriptBlock } from '../../dist/prettier/coffeescript-formatter.js';

// Bug 2: arrow handler
console.log('=== CS format arrow:');
console.log(JSON.stringify(formatCoffeeScript('(e) -> setVal(e.target.value)', {})));
console.log();

// Raw tokens
import cs from 'coffeescript';
const raw = cs.tokens('(e) -> setVal(e.target.value)');
console.log('=== Raw tokens:');
raw.forEach((t,i) => console.log(`  [${i}] type=${t[0]} val=${JSON.stringify(t[1])} range=${JSON.stringify(t[2]?.range)} gen=${!!t[2]?.generated}`));
console.log();

// Multi-line block
console.log('=== CS block:');
console.log(JSON.stringify(formatCoffeeScriptBlock('(ws) ->\n  setWaveSurfer(ws)\n  ws.load(url)', 2, 80)));
