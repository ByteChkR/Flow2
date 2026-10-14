import {execFileSync} from 'node:child_process';
import {readFile, writeFile} from 'node:fs/promises';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const {version} = JSON.parse(await readFile(`${root}/artifacts/latest.json`, 'utf8'));
const archives = [];
for (const key of ['core', 'runtime-browser', 'editor', 'flow-editor']) {
    const {name} = JSON.parse(await readFile(`${root}/packages/${key}/package.json`, 'utf8'));
    archives.push(`${root}/artifacts/npm/${name.replace('@','').replace('/','-')}-${version}.tgz`);
}
execFileSync('npm', ['install', '--offline', '--ignore-scripts', ...archives], {cwd: `${root}/apps/consumer`, stdio: 'inherit'});
await writeFile(`${root}/artifacts/LocalPackages.props`, `<Project><PropertyGroup><Flow2LocalVersion>${version}</Flow2LocalVersion></PropertyGroup></Project>\n`);
execFileSync('dotnet', ['build', 'apps/BenchmarkHost', '-c', 'Release', '--nologo'], {cwd: root, stdio: 'inherit'});
