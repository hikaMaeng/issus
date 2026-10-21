import hashlib, json, shutil, subprocess, sys
from pathlib import Path
from datetime import datetime, timezone

root=Path(__file__).resolve().parents[6]
source=Path(r'C:\Users\hika0\.claude\skills\issue-board-collab')
source_scripts=source/'scripts'

# design.md v2.1 §13: verify the source snapshot before mutating any fixture.
expected_sources={
 'issue_post.py':'67d01e961496f842f5764161c382a9c0abb291d6e62e99811e1e72e9c95b55fd',
 'issue_watch.py':'b73600dc3352269285c245a03240097f983b1ff40e3a42e678fae8c7773a9d70',
 'alias_check.py':'e1de9205f8c142390dba933fb3617864f26c02b52b7cac1f11112e5a65e18283',
 'compact_prepare.py':'617e8c64305792cb36e08d3ef7502c282cd688b191f951971367a57d1fd246f6',
 'board_find.py':'563d8ac13b97e8f6f7a4a4540a1ed2b683f445f9ebd153e92b51399f50461070'}
for name,digest in expected_sources.items():
    actual=hashlib.sha256((source_scripts/name).read_bytes()).hexdigest()
    if actual!=digest: raise SystemExit('Source changed; DECISION required before refresh: '+name)

dest=root/'packages/issus_domain/tests/fixtures/issue-board-v2'
logs=root/'.cache/p3/logs'
logs.mkdir(parents=True,exist_ok=True)
copied=datetime.now(timezone.utc).isoformat()
entries=[]; golden={}; parity=[]
for kind, paths in [('good',sorted((source/'examples').glob('*.md'))),('bad',sorted(p for p in (source/'examples/bad').glob('*.md') if p.name!='README.md')),('flows',sorted((source/'examples/flows').glob('*.md')))]:
    for src in paths:
        target=dest/kind/src.name
        target.parent.mkdir(parents=True,exist_ok=True)
        shutil.copyfile(src,target)
        mode='issue-body' if src.name=='board-body.md' or src.name.startswith('issue-body-') else 'comment'
        row=dict(path=f'{kind}/{src.name}',sourcePath=str(src),sourceRelativePath=src.relative_to(source).as_posix(),sha256=hashlib.sha256(src.read_bytes()).hexdigest(),kind=kind,mode=mode,expected='pass' if kind=='good' else 'reject' if kind=='bad' else 'reference',copiedAt=copied)
        entries.append(row)
        if kind=='flows': continue
        args=[sys.executable,str(source/'scripts/issue_post.py'),'--repo','hikaMaeng/issus','--issue','1','--body-file',str(target),'--dry-run']
        if mode=='issue-body':args.append('--edit-body')
        run=subprocess.run(args,capture_output=True,text=True,encoding='utf-8')
        reasons=[line[4:] for line in run.stdout.splitlines() if line.startswith('  - ')]
        (logs/f'python-{kind}-{src.stem}.log').write_text(run.stdout+run.stderr,encoding='utf-8',newline='\n')
        assert run.returncode==(0 if kind=='good' else 1),(src,run.stdout,run.stderr)
        parity.append(dict(path=row['path'],mode=mode,exitCode=run.returncode,reasons=reasons))
        if kind=='bad':golden[src.name]=reasons

scopes={'issue_post.py':'check_comment/check_issue_body/parse_envelope/iso_ok/alias_ok/check_recipient/constants','issue_watch.py':'header/ids/mentioned/to_me/classify/is_compact/since_compact_stats/pending main','alias_check.py':'ALIAS/dist1/grammar/near collision','compact_prepare.py':'MASKS/mask','board_find.py':'reference only'}
sources=[dict(path=str(source/'scripts'/f),sha256=hashlib.sha256((source/'scripts'/f).read_bytes()).hexdigest(),scope=scope) for f,scope in scopes.items()]
canonical=''.join(f"{r['sourceRelativePath']}\t{r['sha256']}\n" for r in sorted((r for r in entries if r['kind']!='flows'),key=lambda r:r['sourceRelativePath']))
digest=hashlib.sha256(canonical.encode()).hexdigest()
assert digest=='a2387942ff0739cea867846f69b74e34b0dac42f58117d81f2353af38f520404',digest
for path,obj in [(dest/'manifest.json',dict(sourceRoot=str(source),copiedAt=copied,canonical37Sha256=digest,sources=sources,files=entries)),(dest/'golden-errors.json',golden),(dest/'python-results.json',parity)]:
    path.write_text(json.dumps(obj,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
print(f'copied good={sum(r["kind"]=="good" for r in entries)} bad={len(golden)} flows={sum(r["kind"]=="flows" for r in entries)} Python parity runs={len(parity)} manifest37={digest}')
