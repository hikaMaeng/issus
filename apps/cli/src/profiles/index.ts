import {homedir} from 'node:os';
import {join,resolve} from 'node:path';
import {serverUrl} from 'issus_domain/front';
import {CliError} from '../output/index.js';
import {readJson,readUtf8,updateJson} from '../state/index.js';

export interface Profile {server:string;token?:string;alias?:string;sid?:string;sessionId?:string;expiresAt?:string}
interface Profiles {version:1;active:string;profiles:Record<string,Profile>}
export interface ProfileOptions {server?:string;profile?:string;profilesFile?:string;tokenFile?:string}

export const profileDirectory=(env:NodeJS.ProcessEnv=process.env):string=>resolve(env.ISSUS_CONFIG_DIR??join(homedir(),'.config','issus'));
export const profilesFile=(options:ProfileOptions={},env:NodeJS.ProcessEnv=process.env):string=>resolve(options.profilesFile??env.ISSUS_PROFILES_FILE??join(profileDirectory(env),'profiles.json'));

/** Explicit CLI > ISSUS_URL > ISSUS_SERVER_URL > selected profile. Never logs a profile object. */
export async function loadProfile(options:ProfileOptions={},env:NodeJS.ProcessEnv=process.env):Promise<Profile> {
  const data=await readJson<Profiles>(profilesFile(options,env),{version:1,active:'default',profiles:{}});
  const stored=data.profiles?.[options.profile??env.ISSUS_PROFILE??data.active??'default'];
  const raw=options.server??env.ISSUS_URL??env.ISSUS_SERVER_URL??stored?.server;
  if(!raw) throw new CliError(2,'서버 URL 필요: ISSUS_URL 또는 auth set --server');
  let server:string;
  try {server=serverUrl(raw);} catch {throw new CliError(2,'invalid server URL');}
  const token=options.tokenFile?(await readUtf8(options.tokenFile)).trim():env.ISSUS_TOKEN??stored?.token;
  if(token&&/[\r\n]/u.test(token)) throw new CliError(2,'invalid token format');
  // Credentials from a stored profile must never be silently forwarded to a different server.
  if(stored?.token && !env.ISSUS_TOKEN && !options.tokenFile && stored.server && serverUrl(stored.server)!==server) throw new CliError(2,'다른 서버의 profile token은 재사용할 수 없습니다');
  return {server,token,...(stored?.alias?{alias:stored.alias}:{}),...(stored?.sid?{sid:stored.sid}:{}),...(stored?.sessionId?{sessionId:stored.sessionId}:{}),...(stored?.expiresAt?{expiresAt:stored.expiresAt}:{})};
}

/** Stores only the explicitly selected profile with a user-only secret file. */
export async function saveProfile(profile:Profile,options:ProfileOptions={},env:NodeJS.ProcessEnv=process.env):Promise<void> {
  const explicit=options.profile??env.ISSUS_PROFILE;
  await updateJson<Profiles>(profilesFile(options,env),{version:1,active:explicit??'default',profiles:{}},value=>{
    const name=explicit??value.active??'default';
    return {version:1,active:name,profiles:{...value.profiles,[name]:profile}};
  },true);
}
