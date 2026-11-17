# Astronomy Engine 2.1.19 (vendored)

`astronomy.js` and `astronomy.d.ts` are the unmodified ESM build and type
declarations of the npm package `astronomy-engine@2.1.19`
(https://github.com/cosinekitty/astronomy, MIT License, copyright 2019-2023
Don Cross; the full licence text is the header of `astronomy.js`).

Why a copy and not a dependency: this worktree's `node_modules` is a link to a
shared package folder that another checkout owns, and the natal chart's
"version of the calculation" must stay fixed. The file is the package's own
`esm/astronomy.js`, byte for byte:

- package tarball sha256 `605e9e9ebd0a364f1c5b556f10c1f163e4b8aa63b97ada1ab72e960d73189cdd`
- `astronomy.js` sha256 `068f1445ed0c636c94818fe6d20d7d125120e605e0bab9fc4675c3d531be5ad7`

To update: `npm pack astronomy-engine@<version>` in an empty folder, copy
`package/esm/astronomy.js` and `package/astronomy.d.ts` here, update both
hashes and `ENGINE_VERSION` in `../engine/version.ts`, and run
`tests/natal-engine.test.ts`.
