#!/usr/bin/env python3
"""Add incoming internal links to blog drafts from published blog articles.

For each draft, find the 2 most relevant published articles and add a link
to the draft in their internalLinks array. Relevance is scored by shared
keywords, topicCluster match, and title word overlap.

Only modifies roundtrip-safe JSON files (json.dumps preserves formatting).
For non-roundtrip-safe files, prints a warning so they can be fixed manually.
"""

import json
import glob
import re
from pathlib import Path

def normalize_words(text):
    """Extract normalized words from text."""
    if not text:
        return set()
    text = text.lower()
    # Keep Cyrillic, Latin, digits; split on non-word
    words = re.findall(r'[a-zа-яёўқғҳ0-9]+', text)
    return set(words)

def score_relevance(draft, article):
    """Score how relevant an article is to link to a draft."""
    score = 0
    # Topic cluster match
    if draft.get('topicCluster') and article.get('topicCluster'):
        if draft['topicCluster'].lower() == article['topicCluster'].lower():
            score += 10
    # Shared keywords
    draft_kw = set()
    for kw in draft.get('keywords', []):
        draft_kw.update(normalize_words(kw))
    art_kw = set()
    for kw in article.get('keywords', []):
        art_kw.update(normalize_words(kw))
    shared_kw = draft_kw & art_kw
    score += len(shared_kw) * 2
    # Shared title/h1 words
    draft_title = normalize_words(draft.get('h1', draft.get('title', '')))
    art_title = normalize_words(article.get('h1', article.get('title', '')))
    shared_title = draft_title & art_title
    score += len(shared_title)
    # Prefer articles with fewer existing outgoing links (not too crowded)
    existing = len(article.get('internalLinks', []))
    if existing > 8:
        score -= 3
    return score

def is_roundtrip_safe(path):
    """Check if json.dumps preserves the file exactly."""
    raw = path.read_text(encoding='utf-8')
    try:
        d = json.loads(raw)
        out = json.dumps(d, indent=2, ensure_ascii=False) + '\n'
        return out == raw
    except Exception:
        return False

def add_link(article_path, target_url, anchor, locale):
    """Add an internal link to a roundtrip-safe article."""
    raw = article_path.read_text(encoding='utf-8')
    data = json.loads(raw)
    links = data.get('internalLinks', [])
    # Don't duplicate
    for link in links:
        if link.get('target') == target_url:
            return False  # already exists
    new_link = {
        "target": target_url,
        "anchor": anchor,
        "locale": locale,
        "type": "contextual"
    }
    links.append(new_link)
    data['internalLinks'] = links
    out = json.dumps(data, indent=2, ensure_ascii=False) + '\n'
    article_path.write_text(out, encoding='utf-8')
    return True

def main():
    root = Path('content/blog')
    # Load all articles
    drafts = []
    published = []
    for p in glob.glob(str(root / '**/*.json'), recursive=True):
        path = Path(p)
        try:
            data = json.loads(path.read_text(encoding='utf-8'))
        except Exception:
            continue
        if not isinstance(data, dict):
            continue
        if data.get('status') == 'draft':
            drafts.append((path, data))
        elif data.get('status') == 'published':
            published.append((path, data))

    print(f"Drafts: {len(drafts)}, Published: {len(published)}")

    changes = []
    skipped_non_rt = []

    for draft_path, draft in drafts:
        draft_url = draft.get('url', '')
        draft_anchor = draft.get('h1', draft.get('title', 'Подробнее'))
        draft_locale = draft.get('locale', 'ru')
        # Find top 2 relevant published articles
        scored = []
        for art_path, art in published:
            s = score_relevance(draft, art)
            if s > 0:
                scored.append((s, art_path, art))
        scored.sort(reverse=True)
        top = scored[:2]

        for score, art_path, art in top:
            if not is_roundtrip_safe(art_path):
                skipped_non_rt.append(str(art_path))
                continue
            added = add_link(
                art_path,
                draft_url,
                draft_anchor,
                draft_locale
            )
            if added:
                changes.append(f"{art_path} -> {draft_url} (score={score})")
                print(f"  + {art_path.name} -> {draft_url} (score={score})")
            else:
                print(f"  = {art_path.name} already links to {draft_url}")

    print(f"\nTotal changes: {len(changes)}")
    if skipped_non_rt:
        print(f"Skipped non-roundtrip-safe files: {len(set(skipped_non_rt))}")
        for p in sorted(set(skipped_non_rt)):
            print(f"  - {p}")

if __name__ == '__main__':
    main()
