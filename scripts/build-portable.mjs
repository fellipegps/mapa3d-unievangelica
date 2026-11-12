import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {rolldown} from 'rolldown';

const root = fileURLToPath(new URL('../', import.meta.url));
const fromRoot = (...segments) => resolve(root, ...segments);
const read = (...segments) => readFile(fromRoot(...segments), 'utf8');
const args = process.argv.slice(2);
const inline = args.includes('--inline');
const output = resolve(args.find((argument) => argument !== '--inline')
  ?? fromRoot('dist', 'Campus-3D-UniEVANGELICA.html'));
const files = ['buildings.geojson', 'context.geojson', 'destinations.json'];
const inputs = await Promise.all(files.map(async (name) => [name, JSON.parse(await read('public', 'data', name))]));
const [template, css, license] = await Promise.all([
  read('public', 'index.html'),
  read('public', 'style.css'),
  read('node_modules', 'three', 'LICENSE'),
]);

const bundle = await rolldown({input: fromRoot('public', 'app.js'), platform: 'browser'});
const result = await bundle.generate({format: 'iife', codeSplitting: false, minify: true});
const script = result.output.find((file) => file.type === 'chunk').code.replaceAll(/<\/script/gi, '<\\/script');
const data = JSON.stringify(Object.fromEntries(inputs)).replaceAll('<', '\\u003c');
const payload = '<script id="campus-data" type="application/json">' + data + '</script>\n'
  + '<script>\n' + script + '\n</script>';
const legal = '<!-- Three.js (MIT)\n' + license + '\n-->\n';
let html;
if (inline) {
  const body = template.match(/<body>([\s\S]+)<\/body>/)[1]
    .replace('<script type="module" src="./app.js"></script>', () => payload);
  const style = css.replace(':root {', ':scope {').replace('body { margin: 0; }', '')
    .replace('calc(100dvh - 67px)', '565px').replace('calc(100dvh - 58px)', '560px').replace('48dvh', '260px');
  html = legal + '<style>\n@scope (#campus-preview) {\n' + style + '\n}\n</style>\n<div id="campus-preview">'
    + body + '\n</div>\n';
} else {
  html = template.replace('<link rel="stylesheet" href="./style.css">', () => '<style>\n' + css + '\n</style>')
    .replace(/ *<script type="importmap">[^\n]+<\/script>\n/, '')
    .replace('<script type="module" src="./app.js"></script>', () => legal + payload);
}
await mkdir(dirname(output), {recursive: true});
await writeFile(output, html);
await bundle.close();
console.log(output);
