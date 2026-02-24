import fs from 'fs';
import { join } from 'path';
import { uvPath } from '@titaniumnetwork-dev/ultraviolet';

const dest = join(process.cwd(), 'public', 'uv');

if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
}

const files = ['uv.bundle.js', 'uv.handler.js', 'uv.sw.js'];

files.forEach(file => {
    const srcFile = join(uvPath, file);
    const destFile = join(dest, file);
    if (fs.existsSync(srcFile)) {
        fs.copyFileSync(srcFile, destFile);
        console.log(`✅ Generated: ${file}`);
    }
});
