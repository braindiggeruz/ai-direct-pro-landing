import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { assertPublicStylesheets, renderSiteStylesheets, siteStylesheetHrefs, stylesheetHrefs } from '../scripts/site-stylesheets';

function fixture(t: {after: (fn:()=>void)=>void}) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'gpt-site-styles-'));
  t.after(()=>{
    assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep+'gpt-site-styles-'));
    fs.rmSync(root,{recursive:true,force:true});
  });
  fs.mkdirSync(path.join(root,'assets'));
  fs.writeFileSync(path.join(root,'assets/AdminRoot-first.css'),'button{color:white}');
  fs.writeFileSync(path.join(root,'assets/index-old.css'),'body{color:red}');
  fs.writeFileSync(path.join(root,'assets/index-current.css'),'body{margin:0;background:#05070d}');
  fs.writeFileSync(path.join(root,'index.html'),'<head><link crossorigin href="/assets/index-current.css" rel="stylesheet"></head>');
  return root;
}

test('public styles follow the built entry, never alphabetic AdminRoot or an old hash',t=>{
  const root=fixture(t);
  assert.deepEqual(siteStylesheetHrefs(root),['/assets/index-current.css']);
  assert.equal(renderSiteStylesheets(root),'<link rel="stylesheet" href="/assets/index-current.css" />');
});
test('multiple entry styles preserve cascade order and ignore comments, preload and duplicates',t=>{
  const root=fixture(t);
  fs.writeFileSync(path.join(root,'assets/theme-current.css'),':root{color-scheme:dark}');
  const html=`<head><!-- <link rel="stylesheet" href="/assets/AdminRoot-first.css"> -->
    <link rel="preload" as="style" href="/assets/AdminRoot-first.css">
    <link href='/assets/index-current.css' rel='stylesheet'>
    <LINK REL=stylesheet HREF=/assets/theme-current.css>
    <link rel="stylesheet" href="/assets/index-current.css"></head>`;
  fs.writeFileSync(path.join(root,'index.html'),html);
  assert.deepEqual(stylesheetHrefs(html),['/assets/index-current.css','/assets/theme-current.css']);
  assert.equal(renderSiteStylesheets(root).split('\n').length,2);
});
test('missing entry, absent stylesheet or empty CSS fails the build instead of emitting naked HTML',t=>{
  const root=fixture(t);
  fs.unlinkSync(path.join(root,'index.html'));
  assert.throws(()=>renderSiteStylesheets(root),/Missing Vite entry/);
  fs.writeFileSync(path.join(root,'index.html'),'<head></head>');
  assert.throws(()=>renderSiteStylesheets(root),/no stylesheet/);
  fs.writeFileSync(path.join(root,'index.html'),'<link rel="stylesheet" href="/assets/missing.css">');
  assert.throws(()=>renderSiteStylesheets(root),/Missing or empty/);
  fs.writeFileSync(path.join(root,'assets/missing.css'),'');
  assert.throws(()=>renderSiteStylesheets(root),/Missing or empty/);
});
test('entry cannot make the builder reference paths outside the asset directory',t=>{
  const root=fixture(t);
  for(const href of ['/assets/../private.css','https://example.test/site.css','/assets/a.css?secret=1']){
    fs.writeFileSync(path.join(root,'index.html'),`<link rel="stylesheet" href="${href}">`);
    assert.throws(()=>renderSiteStylesheets(root),/Unsupported site stylesheet/);
  }
});
test('artifact guard checks chat, blog and static pages while allowing explicit redirects',t=>{
  const root=fixture(t);
  const pages=['uz/gpt-uzbek-tilida/index.html','ru/gpt-chat/index.html','uz/blog/test/index.html','ru/offer/index.html'];
  for(const file of pages){fs.mkdirSync(path.dirname(path.join(root,file)),{recursive:true});fs.writeFileSync(path.join(root,file),renderSiteStylesheets(root));}
  assert.doesNotThrow(()=>assertPublicStylesheets(root,pages));
  for(const file of pages){
    fs.writeFileSync(path.join(root,file),'<link rel="stylesheet" href="/assets/AdminRoot-first.css">');
    assert.throws(()=>assertPublicStylesheets(root,pages),/Missing site stylesheet in public page/);
    fs.writeFileSync(path.join(root,file),renderSiteStylesheets(root));
  }
  fs.mkdirSync(path.join(root,'ru/redirect'));
  fs.writeFileSync(path.join(root,'ru/redirect/index.html'),'<meta http-equiv="refresh" content="0;url=/">');
  assert.doesNotThrow(()=>assertPublicStylesheets(root,[...pages,'ru/redirect/index.html']));
});
