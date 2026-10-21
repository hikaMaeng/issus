import { randomBytes } from 'node:crypto';
import { mkdir, open, unlink, chmod, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { userInfo } from 'node:os';
import { pathToFileURL } from 'node:url';

/** Create an operator secret once; existing credential bytes are never read or replaced. */
export async function prepareBootstrap(path = process.env.ISSUS_BOOTSTRAP_TOKEN_SOURCE ?? 'apps/issus/docker/volumes/bootstrap-token') {
  const target = resolve(path);
  await mkdir(dirname(target), { recursive: true });
  let file;
  try { file = await open(target, 'wx', 0o600); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const existing = await stat(target);
    if (!existing.isFile() || !existing.size) throw new Error('bootstrap secret must be a nonempty regular file');
    return { path: target, created: false };
  }
  try {
    if (process.platform === 'win32') {
      const user = userInfo().username;
      const account = process.env.USERDOMAIN ? `${process.env.USERDOMAIN}\\${user}` : user;
      const acl = spawnSync('icacls', [target, '/inheritance:r', '/grant:r', `${account}:(F)`], { windowsHide: true, encoding: 'utf8' });
      if (acl.error || acl.status !== 0) throw new Error('bootstrap secret owner-only ACL failed');
    } else await chmod(target, 0o600);
    await file.writeFile(randomBytes(32).toString('base64url') + '\n', 'utf8');
    await file.close();
    return { path: target, created: true };
  } catch (error) {
    await file.close().catch(() => {});
    await unlink(target).catch(() => {});
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  prepareBootstrap().then(result => console.log(JSON.stringify({ event: 'bootstrap.secret.prepared', ...result })))
    .catch(() => { console.error('bootstrap secret preparation failed'); process.exitCode = 1; });
}
