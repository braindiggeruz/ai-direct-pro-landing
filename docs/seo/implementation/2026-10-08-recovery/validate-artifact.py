# -*- coding: utf-8 -*-
"""Read-only, offline verification of the already-built SEO recovery artifact."""
import fnmatch
import hashlib
import json
import re
import sys
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse
from urllib.robotparser import RobotFileParser

OUT = Path(__file__).resolve().parent
ROOT = OUT.parents[3]
DIST = ROOT / 'dist'
ORIGIN = 'https://gptbot.uz'
NS = {'s': 'http://www.sitemaps.org/schemas/sitemap/0.9', 'x': 'http://www.w3.org/1999/xhtml'}
failures = []


def read(path):
    return path.read_text(encoding='utf-8-sig')


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def require(condition, code, detail):
    if not condition:
        failures.append({'check': code, 'detail': detail})
    return bool(condition)


def descendants(value):
    if isinstance(value, dict):
        yield value
        for child in value.values():
            yield from descendants(child)
    elif isinstance(value, list):
        for child in value:
            yield from descendants(child)


class Page(HTMLParser):
    def __init__(self, content):
        super().__init__(convert_charrefs=True)
        self.links = []
        self.metas = []
        self.h1_count = 0
        self.scripts = []
        self.updated_dates = []
        self.anchors = []
        self.stack = []
        self.script = None
        self.anchor = None
        self.body = False
        self.feed(content)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'body':
            self.body = True
        if tag == 'h1':
            self.h1_count += 1
        if tag == 'link':
            self.links.append(attrs)
        if tag == 'meta':
            self.metas.append(attrs)
        if tag == 'script':
            self.script = {'attrs': attrs, 'text': ''}
        hidden = any(item[2] for item in self.stack) or 'hidden' in attrs or attrs.get('aria-hidden') == 'true' or bool(re.search(r'(display\s*:\s*none|visibility\s*:\s*hidden)', attrs.get('style', ''), re.I))
        if tag == 'a':
            self.anchor = {'attrs': attrs, 'text': '', 'body': self.body, 'hidden': hidden}
        if tag == 'time' and any(item[1].get('data-testid') == 'page-updated' for item in self.stack):
            self.updated_dates.append(attrs.get('datetime'))
        if tag not in {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'}:
            self.stack.append((tag, attrs, hidden))

    def handle_endtag(self, tag):
        if tag == 'script' and self.script is not None:
            self.scripts.append(self.script)
            self.script = None
        if tag == 'a' and self.anchor is not None:
            self.anchors.append(self.anchor)
            self.anchor = None
        if tag == 'body':
            self.body = False
        for index in range(len(self.stack) - 1, -1, -1):
            if self.stack[index][0] == tag:
                del self.stack[index:]
                break

    def handle_data(self, data):
        if self.script is not None:
            self.script['text'] += data
        elif self.anchor is not None:
            self.anchor['text'] += data


sitemap_path = DIST / 'sitemap.xml'
sitemap = ET.fromstring(read(sitemap_path))
entries = []
for element in sitemap.findall('s:url', NS):
    entries.append({'url': element.findtext('s:loc', namespaces=NS), 'lastmod': element.findtext('s:lastmod', namespaces=NS),
                    'alternates': {item.get('hreflang'): item.get('href') for item in element.findall('x:link', NS)}})
by_url = {row['url']: row for row in entries}
require(len(entries) == 300, 'sitemap-count', len(entries))
require(len(by_url) == len(entries), 'sitemap-unique', len(by_url))
robots = RobotFileParser()
robots.parse(read(DIST / 'robots.txt').splitlines())
header_rules = []
current = None
for line in read(DIST / '_headers').splitlines():
    if not line.strip() or line.lstrip().startswith('#'):
        continue
    if not line[0].isspace():
        current = {'pattern': line.strip(), 'robots': []}
        header_rules.append(current)
    elif current is not None and line.strip().lower().startswith('x-robots-tag:'):
        current['robots'].append(line.strip().split(':', 1)[1].strip())
redirects = []
for line in read(DIST / '_redirects').splitlines():
    parts = line.split()
    if len(parts) >= 3 and not line.lstrip().startswith('#') and parts[2].rstrip('!') in ('301', '302', '303', '307', '308'):
        redirects.append(parts[:3])


def match_rule(pattern, url):
    target = url if pattern.startswith('https://') else urlparse(url).path
    # The current artifact's patterns use literal paths, splats and named host tokens.
    pattern = re.sub(r':[a-zA-Z][\w-]*', '*', pattern)
    return fnmatch.fnmatchcase(target, pattern)


pages = {}
rows = []
reciprocal_links = 0
inline_tracking_count = 0
for entry in entries:
    url = entry['url']
    pathname = urlparse(url).path
    file = DIST / pathname.lstrip('/') / 'index.html'
    if not require(file.is_file(), 'html-exists', url):
        continue
    content = read(file)
    page = Page(content)
    pages[url] = page
    canonicals = [link.get('href') for link in page.links if link.get('rel') == 'canonical']
    require(canonicals == [url], 'self-canonical', {'url': url, 'canonical': canonicals})
    require(page.h1_count == 1, 'single-h1', {'url': url, 'count': page.h1_count})
    meta_robots = [meta.get('content', '') for meta in page.metas if meta.get('name', '').lower() in ('robots', 'googlebot')]
    header_robots = [value for rule in header_rules if match_rule(rule['pattern'], url) for value in rule['robots']]
    blocked = any(re.search(r'\b(noindex|none)\b', value, re.I) for value in meta_robots + header_robots)
    redirected = [rule for rule in redirects if match_rule(rule[0], url)]
    require(not blocked and robots.can_fetch('Googlebot', url) and not redirected, 'static-indexability', {'url': url, 'meta': meta_robots, 'headers': header_robots, 'redirects': redirected})
    json_ld = []
    for script in page.scripts:
        if script['attrs'].get('type') == 'application/ld+json':
            try:
                value = json.loads(script['text'])
                json_ld.append(value)
            except (ValueError, TypeError) as exc:
                require(False, 'jsonld-parse', {'url': url, 'error': str(exc)})
        if script['attrs'].get('data-tag') == 'chat-entry':
            inline_tracking_count += 1
            require('entry_path:location.pathname' in script['text'] and 'source:location.pathname' not in script['text'], 'built-inline-entry-path', url)
    require(bool(json_ld), 'jsonld-present', url)
    page.json_ld = json_ld
    for lang, target in entry['alternates'].items():
        target_entry = by_url.get(target)
        require(target_entry is not None, 'hreflang-target-in-sitemap', {'url': url, 'lang': lang, 'target': target})
        if target_entry:
            reciprocal_links += 1
            require(url in target_entry['alternates'].values(), 'hreflang-reciprocal', {'url': url, 'target': target})
            require(entry['alternates'] == target_entry['alternates'], 'hreflang-cluster-consistent', {'url': url, 'target': target})
    rows.append({'url': url, 'canonical': canonicals[0] if canonicals else None, 'h1Count': page.h1_count, 'jsonLdBlocks': len(json_ld), 'robotsAllowed': robots.can_fetch('Googlebot', url), 'metaRobots': meta_robots, 'headerRobots': header_robots, 'lastmod': entry['lastmod'], 'alternates': entry['alternates'], 'htmlSha256': sha(file)})

date_rows = []
date_policy = json.loads(read(OUT / 'date-policy-changes.json'))['changes']
require(len(date_policy) == 16, 'date-policy-count', len(date_policy))
for item in date_policy:
    url = ORIGIN + item['url']
    source = json.loads(read(ROOT / item['file']))
    expected = max(value[:10] for value in [source.get('updatedAt'), source.get('lastReviewedAt')] if value)
    page = pages[url]
    modified = sorted(set(node['dateModified'][:10] for node in descendants(page.json_ld) if isinstance(node.get('dateModified'), str)))
    row = {'url': url, 'expected': expected, 'policyExpected': item['correctedModified'], 'jsonLdDateModified': modified, 'visiblePageUpdatedDates': page.updated_dates, 'sitemapLastmod': by_url[url]['lastmod']}
    date_rows.append(row)
    require(expected == item['correctedModified'] and modified == [expected] and by_url[url]['lastmod'] == expected and all(value == expected for value in page.updated_dates), 'date-consistency', row)

letters_url = ORIGIN + '/uz/blog/tushuntirish-xati-va-ariza-yozish/'
gov_url = 'https://gov.uz/oz/advice/600/document/2638'
letters_source = json.loads(read(ROOT / 'content/blog/uz/tushuntirish-xati-va-ariza-yozish.json'))
source_gov = [node for node in descendants(letters_source) if node.get('target') == gov_url]
gov_anchors = [{'href': item['attrs'].get('href'), 'text': item['text'].strip(), 'body': item['body'], 'hidden': item['hidden']} for item in pages[letters_url].anchors if item['attrs'].get('href') == gov_url]
require(bool(source_gov), 'gov-source-body-link', gov_url)
require(any(item['body'] and not item['hidden'] and item['text'] for item in gov_anchors), 'gov-built-visible-anchor', gov_anchors)

pair_paths = ['/ru/blog/gpt-bot-vs-chat-bot/', '/uz/blog/gpt-bot-va-oddiy-chat-bot-qaysi-birini-tanlash/']
pair_rows = []
for path in pair_paths:
    url = ORIGIN + path
    other = ORIGIN + next(value for value in pair_paths if value != path)
    html_alternates = {link['hreflang']: link.get('href') for link in pages[url].links if link.get('rel') == 'alternate' and link.get('hreflang')}
    sitemap_alternates = by_url[url]['alternates']
    require(other not in html_alternates.values() and other not in sitemap_alternates.values(), 'false-pair-removed', {'url': url, 'html': html_alternates, 'sitemap': sitemap_alternates})
    pair_rows.append({'url': url, 'htmlAlternates': html_alternates, 'sitemapAlternates': sitemap_alternates})

source_checks = {
    'src/gpt-chat/analytics.ts': ["key === 'source' ? 'ui_source' : key"],
    'src/lib/cta.ts': ['googleData.ui_source = googleData.source', 'delete googleData.source'],
    'apps/studio/src/analytics.ts': ["key === 'source' ? 'ui_source' : key"],
    'scripts/chat-entry-cta.ts': ['entry_path:location.pathname'],
}
tracking_sources = []
for relative, tokens in source_checks.items():
    file = ROOT / relative
    content = read(file)
    found = all(token in content for token in tokens)
    require(found, 'ga4-source-boundary', relative)
    tracking_sources.append({'file': relative, 'expectedTokens': tokens, 'found': found, 'sha256': sha(file)})

bundle_groups = {'chat': 'gpt-chat-*.js', 'cta': 'cta-*.js', 'studioShared': 'studio-runtime-*.js', 'studioStandalone': 'studio/studio-*.js'}
bundles = []
for group, pattern in bundle_groups.items():
    matches = sorted((DIST / 'assets').glob(pattern))
    require(bool(matches), 'tracking-bundle-present', group)
    for file in matches:
        content = read(file)
        mapping = bool(re.search(r'["`\']source["`\']\?["`\']ui_source["`\']:', content)) if group != 'cta' else '.ui_source=' in content and 'delete ' in content and '.source' in content
        require(mapping, 'ga4-built-boundary', str(file.relative_to(ROOT)))
        position = content.find('ui_source')
        bundles.append({'group': group, 'file': file.relative_to(ROOT).as_posix(), 'uiSourceMappingPresent': mapping, 'sha256': sha(file), 'excerpt': content[max(0, position - 60):position + 100]})
require(inline_tracking_count > 0, 'inline-tracking-present', inline_tracking_count)

report = {
    'checkedAtUtc': datetime.now(timezone.utc).isoformat(),
    'command': 'python docs/seo/implementation/2026-10-08-recovery/validate-artifact.py',
    'scope': 'Offline read-only dist checks; validates generated HTML and rule files, not deployed HTTP, computed CSS visibility, network telemetry, indexing or ranking.',
    'status': 'PASS' if not failures else 'FAIL',
    'sitemap': {'urlCount': len(entries), 'uniqueUrlCount': len(by_url), 'checkedHtmlCount': len(rows), 'reciprocalAlternateLinksChecked': reciprocal_links, 'sha256': sha(sitemap_path), 'pages': rows},
    'datePolicy': {'count': len(date_rows), 'rule': 'max(authored updatedAt, lastReviewedAt); page-updated visible time if present; legal effective dates are distinct and are not dateModified.', 'rows': date_rows},
    'govUzCitation': {'sourceBodyLinkCount': len(source_gov), 'builtAnchors': gov_anchors},
    'independentComparisonArticles': pair_rows,
    'ga4': {'sources': tracking_sources, 'builtBundles': bundles, 'builtInlineArticleEntryScriptsChecked': inline_tracking_count, 'note': 'Static shipped-code evidence. Runtime behavior independently covered by attribution-boundary tests; no real GA4 events sent.'},
    'failures': failures,
}
(OUT / 'ARTIFACT_VALIDATION.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'status': report['status'], 'html': len(rows), 'dateRows': len(date_rows), 'inlineEntryScripts': inline_tracking_count, 'bundles': len(bundles), 'failureCount': len(failures), 'failures': failures[:30]}, ensure_ascii=True))
sys.exit(0 if not failures else 1)
