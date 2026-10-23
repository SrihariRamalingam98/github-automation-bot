const fs = require('node:fs');
const path = require('node:path');
const config = require('../angular.json');
const output = config.projects.frontend.architect.build.options.outputPath;
const index = path.resolve(__dirname, '..', output.base, output.browser, 'index.html');
if (!fs.existsSync(index)) throw new Error('Configured Angular output has no index.html');
if (/\son[a-z]+\s*=/i.test(fs.readFileSync(index, 'utf8')))
    throw new Error('Angular index contains an inline event handler blocked by production CSP');
if (!fs.existsSync(path.resolve(__dirname, '../apps/backend/dist/main.js')))
    throw new Error('NestJS build is missing');
process.stdout.write(`Verified Angular entry: ${path.relative(process.cwd(), index)}\n`);
