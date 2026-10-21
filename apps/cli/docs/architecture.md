# architecture

`scripts/build-app.mjs`가 `src/entry/index.ts`를 shebang이 있는 self-contained node24 ESM `dist/index.js`로 번들한다. manifest entry는 `index.js`다. 조립 entry와 manifest는 P1, 기능 폴더는 후속 담당 소유다.
