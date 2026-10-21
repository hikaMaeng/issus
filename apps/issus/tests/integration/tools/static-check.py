"""Check only P8-owned dirty files, preserving other agents' working trees."""
import json
import pathlib
import re
import subprocess

root = pathlib.Path(__file__).resolve().parents[5]
out = root/'.cache/p8'
out.mkdir(parents=True,exist_ok=True)
names = set()
for args in [['git','diff','--name-only','-z'],['git','ls-files','--others','--exclude-standard','-z']]:
    names.update(p for p in subprocess.check_output(args,cwd=root).decode('utf-8').split('\0') if p)
root_docs = {'README.md'} | {'docs/'+name+'.md' for name in ['overview','architecture','api','usage','constraints','internals','testing','acceptance']}
def owned(name):
    return name in root_docs or name.startswith('apps/issus/src/front/') or name.startswith(('apps/issus/tests/plans/p8-','apps/issus/tests/reports/p8-','apps/issus/tests/browser/')) or name in {'apps/issus/tests/integration/acceptance-harness.mjs','apps/issus/tests/integration/acceptance.test.mjs','apps/issus/tests/integration/deployed-browser-host.mjs'} or name.startswith('apps/issus/tests/integration/tools/')
files = sorted(name for name in names if owned(name) and (root/name).is_file())
errors=[]
for name in files:
    data=(root/name).read_bytes()
    if data.startswith(b'\xef\xbb\xbf'): errors.append(name+': BOM')
    if b'\r' in data: errors.append(name+': CR')
    try: text=data.decode('utf-8')
    except UnicodeDecodeError: errors.append(name+': invalid UTF8');continue
    if '\ufffd' in text: errors.append(name+': replacement character')
    if name.endswith('.md'):
        for target in re.findall(r'\[[^\]]+\]\(([^)]+)\)',text):
            if re.match(r'^[a-z]+:',target) or target.startswith('#'):continue
            path=target.split('#',1)[0].strip('<>')
            if path and not ((root/name).parent/path).exists(): errors.append(name+': broken link '+target)
    if name.startswith('apps/issus/tests/browser/'):
        for forbidden in ['.locator(','.getByText(','.nth(','.first(','.last(','xpath=']:
            if forbidden in text: errors.append(name+': selector '+forbidden)
browser = (root/'apps/issus/tests/browser/ui.test.mjs').read_text(encoding='utf-8')
scenarios=len(re.findall(r"^test\(",browser,re.M))
if scenarios<6:errors.append('browser scenarios <6')
result=subprocess.run(['git','diff','--check','--']+files,cwd=root,capture_output=True,text=True,encoding='utf-8')
if result.returncode:errors.append('diff --check: '+result.stdout+result.stderr)
summary=dict(files=len(files),paths=files,browserScenarios=scenarios,errors=errors)
(out/'static-check.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(summary,ensure_ascii=False,indent=2))
raise SystemExit(bool(errors))
