// Injects packed.json into template.html to produce the shareable index.html.
import fs from 'node:fs';
const html = fs.readFileSync('template.html', 'utf8');
const data = fs.readFileSync('packed.json', 'utf8').replace(/<\//g, '<\\/');
fs.writeFileSync('index.html', html.replace('__DATA__', data));
console.log('index.html', fs.statSync('index.html').size, 'bytes');
