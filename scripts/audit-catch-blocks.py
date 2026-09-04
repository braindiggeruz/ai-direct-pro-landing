#!/usr/bin/env python3
"""Audit silent catch blocks across the codebase.

Finds patterns that swallow errors without logging:
- catch { } (empty)
- catch (e) { /* no console.error or similar */ }
- .catch(() => undefined)
- .catch(() => '')
- .catch(() => {})

Categorizes by severity based on file path:
- CRITICAL: API endpoints, external integrations, auth, payment
- HIGH: core libraries, database operations
- MEDIUM: admin components, analytics
- LOW: UI components, tests, utilities
"""

import re
from pathlib import Path
from collections import defaultdict

SILENT_PATTERNS = [
    # Empty catch
    (r'catch\s*\([^)]*\)\s*\{\s*\}', 'empty_catch'),
    # catch with only return/variable assignment, no logging
    (r'catch\s*\(\s*(\w+)\s*\)\s*\{[^}]*\}', 'catch_no_log'),
    # .catch(() => undefined)
    (r'\.catch\s*\(\s*\(\s*\)\s*=>\s*undefined\s*\)', 'catch_undefined'),
    # .catch(() => '')
    (r'\.catch\s*\(\s*\(\s*\)\s*=>\s*[\'"]\s*[\'"]\s*\)', 'catch_empty_string'),
    # .catch(() => {})
    (r'\.catch\s*\(\s*\(\s*\)\s*=>\s*\{\s*\}\s*\)', 'catch_empty_obj'),
]

SEVERITY_RULES = [
    (r'functions/api/', 'CRITICAL'),
    (r'functions/lib/(jwt|password|lockout|turnstile)', 'CRITICAL'),
    (r'functions/lib/(seo-autopilot|ai-drafts|indexnow|llm)', 'HIGH'),
    (r'functions/lib/yandex', 'HIGH'),
    (r'functions/lib/telegram', 'HIGH'),
    (r'functions/lib/api-errors', 'HIGH'),
    (r'functions/lib/(intent-guard|circuit-breaker)', 'HIGH'),
    (r'functions/platform/lead-radar', 'HIGH'),
    (r'src/admin', 'MEDIUM'),
    (r'src/components', 'LOW'),
    (r'src/lib', 'MEDIUM'),
    (r'agents/', 'MEDIUM'),
    (r'tests?/', 'LOW'),
]

def get_severity(path):
    path_str = str(path).replace('\\', '/')
    for pattern, sev in SEVERITY_RULES:
        if pattern in path_str:
            return sev
    return 'MEDIUM'

def find_silent_catches(root):
    results = defaultdict(list)
    for path in Path(root).rglob('*.ts'):
        if 'node_modules' in str(path):
            continue
        text = path.read_text(encoding='utf-8')
        lines = text.split('\n')
        
        severity = get_severity(path)
        
        for pattern_name, pattern in SILENT_PATTERNS:
            for match in re.finditer(pattern, text):
                start = text[:match.start()].count('\n')
                line = lines[start] if start < len(lines) else ''
                # Skip if line has console.error or console.warn
                ctx = '\n'.join(lines[max(0,start-2):start+3])
                if 'console.error' in ctx or 'console.warn' in ctx or 'log(' in ctx:
                    continue
                results[severity].append({
                    'file': str(path.relative_to(root)),
                    'line': start + 1,
                    'pattern': pattern_name,
                    'context': line.strip()[:80]
                })
    
    return results

if __name__ == '__main__':
    import sys
    root = sys.argv[1] if len(sys.argv) > 1 else '.'
    results = find_silent_catches(root)
    
    total = 0
    for sev in ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']:
        items = results.get(sev, [])
        total += len(items)
        print(f'\n=== {sev}: {len(items)} ===')
        for item in sorted(items, key=lambda x: x['file'])[:20]:
            print(f"  {item['file']}:{item['line']}  {item['pattern']}")
        if len(items) > 20:
            print(f'  ... and {len(items)-20} more')
    
    print(f'\nTotal silent catches: {total}')
