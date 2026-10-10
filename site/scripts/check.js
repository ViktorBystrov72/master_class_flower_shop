import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
function check(dir) {
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir,item.name);
    if (item.isDirectory()) check(path);
    else if (path.endsWith('.js')) execFileSync(process.execPath,['--check',path],{ stdio:'inherit' });
  }
}
check('server'); check('public');
for (const name of ['hero','morning','sunset','cloud','lilac','garden','red']) {
  if (!existsSync(`public/images/${name}.png`)) throw new Error(`Нет изображения ${name}.png`);
}
console.log('Проверены сервер, клиент и все изображения. Сборка готова.');
