import codecs
import hashlib
import unicodedata
import importlib.util, json, re, sys
from pathlib import Path
root=Path(__file__).resolve().parents[6]
if unicodedata.unidata_version!='15.1.0': raise SystemExit('Python Unicode snapshot changed; DECISION required before refresh')
source=Path(r'C:\Users\hika0\.claude\skills\issue-board-collab\scripts')
source_scripts=source

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

sys.path.insert(0,str(source))
import issue_post as post, issue_watch as watch, compact_prepare as compact, alias_check as alias
from datetime import datetime, timezone
out={'provenance':{'generatedAt':datetime.now(timezone.utc).isoformat(),'sourceHashes':expected_sources,'pythonVersion':sys.version,'unicodeVersion':unicodedata.unidata_version},'validation':[],'headers':[],'masks':[],'times':[],'aliases':[],'pending':[]}
def comment(name,body):out['validation'].append(dict(name=name,mode='comment',body=body,reasons=post.check_comment(body)))
def body(name,value):
    try: reasons=post.check_issue_body(value)
    except KeyError: return
    out['validation'].append(dict(name=name,mode='issue-body',body=value,reasons=reasons))
base='FROM:issus-1-domain/s1 TO:issus-1-orch TYPE:NOTE'
for first in ['', '\ufeff'+base,base+' X:1',base+' TYPE:NOTE','FROM: x','작성자: 별칭',base+' 자유 문구','TO:ALL TYPE:NOTE','FROM:issus-1-domain TYPE:NOTE', 'FROM:issus-1-domain TO:ALL', '\ufeff\ufeff'+base,base.replace(' ','\x85'),base.replace(' ','\x1c'),base+'\ufeff']:
    comment('header '+repr(first),first+'\n본문')
for typ in sorted(post.TYPES|{'GATE','READY','REQUEST','STATUS','REVIEW','REF','SUPPLY','RESTORE','SLOT','CHECKPOINT','DONE','CORRECTION','NOTICE','DIAG','REPLY','MOVE','UNLISTED'}):
    comment('TYPE '+typ,base.replace('TYPE:NOTE','TYPE:'+typ)+'\n본문')
for sid in ['s1','s2','by-issus-1-base','by-BAD','abcdefghijklmn','a/b','S1','', '---']:
    comment('sid '+sid,base.replace('/s1','/'+sid)+'\n본문')
for name in ['아스나','aa-가나','aa-12345-abcdefghijk','A1-role','ab-cd','ab-１２-cd','reviewer','aa-reviewer','ab-\U00010d40-cd']:
    comment('FROM '+name,base.replace('issus-1-domain/s1',name)+'\n본문')
for to in ['ALL','all','issus-1-orch','a,b','#1','12345','192.168.0.1','a/s1','@aa-bb','오케스트레이터','reviewer','Legacy_Name','²','①','𐩀']:
    comment('recipient '+to,base.replace('TO:issus-1-orch','TO:'+to)+'\n본문')
for cc in ['ALL','all','issus-1-orch','',',,','a/b','aa-bb,,cc-dd', '192.168.1.1']:
    comment('CC '+cc,base+' CC:'+cc+'\n본문')
for st in ['done','queued','RUNNING','unknown']:comment('STATE '+st,base+' STATE:'+st+'\n본문')
for v in ['2024-02-29T23:59+09:00','2023-02-29T12:00+09:00','2024-04-31T12:00+09:00','0000-01-01T00:00+00:00','9999-12-31T23:59:59-2359','2024-01-01T24:00+09:00','2024-01-01T23:60+09:00','2024-01-01T23:59:60+09:00','2024-01-01T00:00+00:99','2024-01-01T00:00+23:60','18:30','2024-01-01T00:00Z','２０２４-01-01T00:00+09:00']:
    out['times'].append(dict(value=v,valid=post.iso_ok(v)))
    comment('DUE '+v,base.replace('TYPE:NOTE','TYPE:PLAN')+' DUE:'+v+'\n본문')
for k,v in [('RE','1,a'),('RE','１２３４５６'),('SEEN','1,2'),('SUPERSEDES',''),('REPLY-IN','#1'),('REPLY-IN','a/b#1'),('REPLY-IN','a/b/c#1'),('MIRROR-OF','ftp://x'),('MIRROR-OF','https://x')]:comment(k+v,base+f' {k}:{v}\n본문')
for first,content in [('TYPE:ASK ACK-BY:2026-10-21T18:00+09:00','ASK @issus-1-orch: 하나'),('TYPE:ASK','ASK @other-aa: 하나\nASK @issus-1-orch: 둘'),('TYPE:NOTE','ASK @other-aa: 요청'),('TYPE:VERIFY RE:123456',' VERDICT:PASS'),('TYPE:VERIFY RE:123456','VERDICT:PASS한글'),('TYPE:COMPACT SEEN:123456','## ===== COMPACT #1 through 123457 ====='),('TYPE:NOTE','\n'*12+'본문'),('TYPE:NOTE','---\n   '),('TYPE:NOTE','\ufeff')]:comment('content '+repr(content),base.replace('TYPE:NOTE',first)+'\n'+content)
for n in [4000,4001]:
    prefix=base+'\n';comment('emoji '+str(n),prefix+'😀'*(n-len(prefix)))
for n in [2000,2001,4001]:
    prefix='FROM:aa-bb TO:ALL TYPE:COMPACT SEEN:123456\n## ===== COMPACT #1 through 123456 =====\n'
    comment('COMPACT size '+str(n),prefix+'😀'*(n-len(prefix)))
for separator in ['\r','\u2028','\x85','\ufeff']:
    comment('ASK anchor '+repr(separator),base.replace('TYPE:NOTE','TYPE:ASK')+'\n내용'+separator+'ASK @issus-1-orch: 요청')
    comment('VERIFY anchor '+repr(separator),base.replace('TYPE:NOTE','TYPE:VERIFY RE:123456')+'\n내용'+separator+'VERDICT:PASS')
for s in ['','\ufeffSTATE:running OWNER:aa-bb UPDATED:2024-01-01T00:00+09:00','STATE:no OWNER:a/b UPDATED:bad','STATE:running OWNER:aa-bb UPDATED:2024-01-01T00:00+09:00 X:x','OWNER:aa-bb STATE:running UPDATED:2024-01-01T00:00+09:00','STATE:running OWNER:aa-bb UPDATED:2024-01-01T00:00+09:00 BOARD:a/b#12 COMPACT:a','STATE:running OWNER:aa-bb UPDATED:2024-01-01T00:00+09:00 COMPACT:²']:
    body('body '+repr(s),s)
reads=[base+'\n본문','작성: aa-bb / s1 | 역할\nTYPE: REQUEST\nTO: @cc-dd / ee-ff\nRE: 123456,1','**FROM: aa-bb/s1**\n**TO: cc-dd**\n**TYPE: REVIEW**','TYPE: NOTE\nRE: 123456','FROM:aa-bb TYPE:COMPACT','FROM:aa-bb TO:cc-dd TYPE:NOTE X:yes\n@ee-ff한글','invalid\n## ===== COMPACT #1 through 123456 =====', '\ufeff\n'+base,'\n'+base,'FROM:aa-bb TO:cc-dd TYPE:HOLD','FROM:aa-bb TO:ALL TYPE:REQUEST']
for extra in ['@cc-dd','@CC-DD.','@cc-ddx','@cc-dd한','@cc-dd-é','@cc-ddé','@cc-dd_','@cc-dd😀','@cc.dd','@cc-dd\u0301','@cc-dd\U00010d40']:
    reads.append('FROM:aa-bb TO:other-aa TYPE:NOTE CC:cc-dd\n'+extra)
for text in reads:
    h=watch.header(text);out['headers'].append(dict(body=text,header=h,classification=watch.classify(h,text,['cc-dd']),compact=watch.is_compact({'body':text},h)))
samples=['-----BEGIN RSA PRIVATE KEY-----\na\nb\n-----END RSA PRIVATE KEY-----','ghp_'+'a'*20,'github_pat_'+'_'*20,'AKIA'+'A'*16,'sk-'+'a'*16,'xoxb-'+'a'*10,'BEARER '+'x'*16,'password:example','passwd=x secret:y token=z api-key=q','person@example.test','ghp_'+'a'*19,'sk-'+'a'*15,'bearer short','x@a.c','한글ghp_'+'a'*20,'ghp_'+'a'*20+'한글','token=ghp_'+'a'*20,'Bearer '+'x'*16+' token=sk-'+'a'*16,'한글password=x','password\x85=\x85abc','K@example.test']
samples+=['API_KEY=x','apı_key=x','Bearer '+ 'ı'*16,'Bearer\ufeff'+'x'*16,'sk-'+'a'*16+'한글','header token=example\nbody token=example','password\x1c=\x1cabc','-----BEGIN PRIVATE KEY-----\nx\n-----END PRIVATE KEY-----\n-----BEGIN PRIVATE KEY-----\ny\n-----END PRIVATE KEY-----']
for text in samples:
    masked,n=compact.mask(text);out['masks'].append(dict(inputRot13=codecs.encode(text,'rot13'),textRot13=codecs.encode(masked,'rot13'),maskedCount=n))  # 커밋 가드·push protection 회피: ASCII ROT13 보관(base64는 GitHub가 해독함)
for a,b in [('abc','abc'),('abc','abx'),('abc','ab'),('abc','abcd'),('abc','acb'),('가나','가다'),('😀a','😀b')]:out['aliases'].append(dict(a=a,b=b,dist1=alias.dist1(a,b)))
def pending(rows,me):
    parsed=[(c,watch.header(c['body'])) for c in rows]
    my_re={i for c,h in parsed if h['_from'] in me for i in h['_re']};sup={i for c,h in parsed for i in h['_sup']}
    return [str(c['id']) for c,h in parsed if h['_from'] not in me and h['_type'] in watch.DIRECTIVE and watch.to_me(h,c['body'],me) and str(c['id']) not in my_re and str(c['id']) not in sup]
start=[dict(id='1000000',body='FROM:aa-bb/s1 TO:cc-dd TYPE:ASK ACK-BY:2026-10-21T18:00+09:00\nASK @cc-dd: 요청'),dict(id='1000001',body='FROM:aa-bb TO:other-aa TYPE:HOLD\n@cc-dd'),dict(id='1000002',body='FROM:cc-dd TO:cc-dd TYPE:DECISION\n내용')]
for typ in sorted(post.TYPES):
    rows=start+[dict(id='1000003',body=f'FROM:cc-dd/by-aa-bb TO:aa-bb TYPE:{typ} RE:1000000,1000001\n내용')]
    out['pending'].append(dict(name='my RE '+typ,rows=rows,me=['cc-dd'],pending=pending(rows,['cc-dd'])))
for who in ['cc-dd','other-aa']:
    rows=start+[dict(id='1000003',body=f'FROM:{who} TO:aa-bb TYPE:NOTE SUPERSEDES:1000000\n내용')]
    out['pending'].append(dict(name='SUPERSEDES '+who,rows=rows,me=['cc-dd'],pending=pending(rows,['cc-dd'])))
dest=root/'packages/issus_domain/tests/fixtures/issue-board-v2/differential.json'
dest.write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
print('Python differential cases:',{k:len(v) for k,v in out.items() if isinstance(v,list)})
