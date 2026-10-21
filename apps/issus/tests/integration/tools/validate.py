"""Record exact P8 commands without PowerShell text redirection or secret output."""
import json
import hashlib
import os
import pathlib
import shutil
import subprocess
import sys
import time

root = pathlib.Path(__file__).resolve().parents[5]
out = root / '.cache/p8'
out.mkdir(parents=True, exist_ok=True)
env = dict(os.environ, PYTHONUTF8='1')
commands = json.loads((out/'commands.json').read_text(encoding='utf-8')) if (out/'commands.json').exists() else []
start_index = len(commands)

def run(label, args, cwd=root):
    started = time.time()
    if (out/(label+'.log')).exists(): shutil.copyfile(out/(label+'.log'),out/(label+'-previous-'+str(time.time_ns())+'.log'))
    with (out / (label + '.log')).open('w', encoding='utf-8', newline='\n') as log:
        try:
            result = subprocess.run(args, cwd=cwd, env=env, stdout=log, stderr=subprocess.STDOUT, timeout=240)
            code = result.returncode
        except subprocess.TimeoutExpired:
            code = 124
    commands.append(dict(label=label, command=subprocess.list2cmdline(args), cwd=str(cwd), exit=code, seconds=round(time.time()-started, 2), timestamp=time.strftime('%Y-%m-%dT%H:%M:%S%z')))
    (out / 'commands.json').write_text(json.dumps(commands, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    print(label, 'exit=', code, (out / (label + '.log')).read_text(encoding='utf-8')[-1400:], flush=True)
    return code

mode = sys.argv[1] if len(sys.argv) > 1 else 'checks'
if mode == 'checks':
    run('lint', ['npm.cmd', 'run', 'lint', '-w', 'issus'])
    run('npm-test', ['npm.cmd', 'test', '-w', 'issus'])
elif mode in ['emit','source']:
    config = {'extends':'../../tsconfig.json','compilerOptions':{'noEmit':False,'declaration':False,'noEmitOnError':True,'module':'ESNext','moduleResolution':'Bundler','rootDir':'../..','outDir':'./emit','types':['node','vite/client']},'include':['../../apps/issus/src/**/*.ts','../../apps/issus/src/**/*.tsx','../../apps/cli/src/**/*.ts'],'exclude':[]}
    runtime_map={}
    if mode=='source':
        paths={}
        for name in ['agent','issus_domain','issus_runtime']:
            package=json.loads((root/'packages'/name/'package.json').read_text(encoding='utf-8'))
            for export,conditions in package['exports'].items():
                if not isinstance(conditions,dict):continue
                types=conditions.get('types')
                if not types:continue
                public=package['name']+(export[1:] if export!='.' else '')
                source='packages/'+name+'/'+types.replace('./dist/','src/').replace('.d.ts','.ts')
                if (root/source).exists():
                    paths[public]=['../../'+source]
                    runtime_map[public]='./emit/'+source.replace('.ts','.js')
        config['compilerOptions']['paths']=paths
        config['include']=['../../packages/*/src/**/*.ts','../../apps/*/src/**/*.ts','../../apps/issus/src/**/*.tsx']
    (out/'tsconfig.json').write_text(json.dumps(config,indent=2)+'\n',encoding='utf-8')
    if run('emit',['node','node_modules/typescript/bin/tsc','-p',str(out/'tsconfig.json')]): raise SystemExit(1)
    emit=out/'emit'
    (emit/'package.json').write_text('{"type":"module"}\n',encoding='utf-8')
    for source in [root/'packages/issus_domain/tests/fixtures',root/'packages/issus_domain/src/server/backend/schema']:
        shutil.copytree(source,emit/source.relative_to(root),dirs_exist_ok=True)
    for source in (root/'packages/agent/src').rglob('*.mjs'):
        target=emit/source.relative_to(root);target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(source,target)
    loader = """import {registerHooks} from 'node:module';
registerHooks({resolve(specifier,context,next){
  if(specifier.endsWith('.ts')&&specifier.includes('/src/')) {
    const target=new URL(specifier,context.parentURL);
    if(target.pathname.includes('/.cache/p8/emit/')) return {url:target.href.replace(/\\.ts$/,'.js'),shortCircuit:true};
    const rel=target.pathname.slice(new URL('../../',import.meta.url).pathname.length);
    return {url:new URL('./emit/'+rel.replace(/\\.ts$/,'.js'),import.meta.url).href,shortCircuit:true};
  }
  return next(specifier,context);
}});
"""
    loader=loader.replace("registerHooks({resolve(specifier,context,next){",'const map='+json.dumps(runtime_map)+";\nregisterHooks({resolve(specifier,context,next){\n  if(map[specifier]) return {url:new URL(map[specifier],import.meta.url).href,shortCircuit:true};")
    (out/'loader.mjs').write_text(loader,encoding='utf-8')
    manifest={str(path.relative_to(root)).replace('\\','/'):hashlib.sha256(path.read_bytes()).hexdigest() for path in sorted(emit.rglob('*.js'))}
    (out/'source-emit-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
    env['ISSUS_TEST_DATABASE_URL']='postgresql://issus@127.0.0.1:15440/issus'
    env['P4_TEST_LOADER']=str(out/'loader.mjs')
    tests=sorted((emit/'apps/issus/src').rglob('*.test.js'))
    run('source-app' if mode=='source' else 'emitted-app',['node','--import',(out/'loader.mjs').as_uri(),'--test','--test-isolation=none']+[str(p) for p in tests],root/'apps/issus')
elif mode in ['integration','source-integration']:
    env['ISSUS_TEST_DATABASE_URL']='postgresql://issus@127.0.0.1:15440/issus'
    if (out/'emit/apps/cli/src/entry/run/index.js').exists(): env['ISSUS_TEST_CLI_RUN_MODULE']=str(out/'emit/apps/cli/src/entry/run/index.js')
    if mode=='source-integration':env['ISSUS_TEST_SOURCE_EMIT_ROOT']=str(out/'emit')
    args=['node']+(['--import',(out/'loader.mjs').as_uri()] if mode=='source-integration' else [])+['--test','--test-isolation=none','apps/issus/tests/integration/acceptance.test.mjs']
    run(mode,args)
elif mode == 'browser-probe':
    env.setdefault('ISSUS_TEST_SERVER_URL','http://127.0.0.1:18140')
    run('browser-probe',['node','--test','--test-isolation=none','apps/issus/tests/browser/ui.test.mjs'])
elif mode == 'final':
    run('lint-final',['npm.cmd','run','lint','-w','issus'])
    for name in ['apps/issus/tests/browser/fixture.mjs','apps/issus/tests/browser/ui.test.mjs','apps/issus/tests/integration/acceptance-harness.mjs','apps/issus/tests/integration/acceptance.test.mjs','apps/issus/tests/integration/deployed-browser-host.mjs']:
        run('syntax-'+pathlib.Path(name).stem,['node','--check',name])
    run('static-final',[sys.executable,'apps/issus/tests/integration/tools/static-check.py'])
    owned=json.loads((out/'static-check.json').read_text(encoding='utf-8'))['paths']
    run('owned-status',['git','status','--short','--untracked-files=all','--']+owned)
elif mode == 'barrier':
    watcher=r'C:\Users\hika0\.claude\skills\issue-board-collab\scripts\issue_watch.py'
    base=[sys.executable,watcher,'--repo','hikaMaeng/issus','--me','issus-1-web','--peek']
    run('barrier-since-compact',base+['--since-compact','1'])
    run('barrier-full',base+['--limit','16000','1'])
else:
    raise SystemExit('mode must be checks|emit|source|integration|source-integration|browser-probe|final|barrier')

raise SystemExit(1 if any(command['exit'] for command in commands[start_index:]) else 0)
