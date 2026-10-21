// Fails the build when a stylesheet has unbalanced braces. Browsers don't
// complain: a missing `}` silently nests every later rule inside the previous
// one (CSS nesting), and those rules stop applying.
import { readFileSync } from 'node:fs';

let failed = false;
for (const file of ['src/style.css']) {
  // Ignore braces inside comments and strings.
  const css = readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, '""');
  let depth = 0;
  let line = 1;
  for (const ch of css) {
    if (ch === '\n') line++;
    else if (ch === '{') depth++;
    else if (ch === '}' && --depth < 0) {
      console.error(`${file}:${line}: unmatched '}'`);
      failed = true;
      depth = 0;
    }
  }
  if (depth > 0) {
    console.error(`${file}: ${depth} unclosed '{' (a rule is missing its closing brace)`);
    failed = true;
  }
}
if (failed) process.exit(1);
