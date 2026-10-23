const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const target = path.resolve(root, 'apps/backend/dist');
if (path.relative(root, target) !== path.join('apps', 'backend', 'dist')) {
    throw new Error('Refusing to clean outside the backend build directory');
}
fs.rmSync(target, { recursive: true, force: true });
