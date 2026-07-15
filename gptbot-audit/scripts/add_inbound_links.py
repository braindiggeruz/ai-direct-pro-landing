#!/usr/bin/env python3
"""
One-shot script: append inbound internal links from 16 existing blog articles
to the 3 new money pages (RU + UZ). Anchors are intentionally varied to avoid
exact-match keyword stuffing.

Run from /app/gptbot:  python3 scripts/add_inbound_links.py
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BLOG = ROOT / 'content' / 'blog'

# Map: blog file → list of links to APPEND (one per new money page target)
ADDITIONS = {
    # ---------- RU blog → /ru/whatsapp-bot-dlya-biznesa/ ----------
    'ru/instagram-telegram-crm-odna-voronka-zayavok.json': [
        {'target': '/ru/whatsapp-bot-dlya-biznesa/', 'anchor': 'WhatsApp-бота для бизнеса', 'locale': 'ru', 'type': 'contextual'},
        {'target': '/ru/ai-bot-s-crm-amocrm-bitrix24/', 'anchor': 'связка AI-бота с AmoCRM и Bitrix24', 'locale': 'ru', 'type': 'contextual'},
    ],
    'ru/chat-bot-dlya-biznesa-v-tashkente-kak-vybrat-kanal.json': [
        {'target': '/ru/whatsapp-bot-dlya-biznesa/', 'anchor': 'AI-бот в WhatsApp', 'locale': 'ru', 'type': 'contextual'},
    ],
    'ru/otvety-klientam-24-7-bez-rasshireniya-otdela.json': [
        {'target': '/ru/whatsapp-bot-dlya-biznesa/', 'anchor': 'круглосуточные ответы в WhatsApp', 'locale': 'ru', 'type': 'contextual'},
    ],
    'ru/pochemu-biznes-teryaet-zayavki-iz-instagram-telegram.json': [
        {'target': '/ru/whatsapp-bot-dlya-biznesa/', 'anchor': 'автоматизация WhatsApp Business', 'locale': 'ru', 'type': 'contextual'},
        {'target': '/ru/ai-bot-dlya-agentstva-nedvizhimosti/', 'anchor': 'AI-бот для агентства недвижимости', 'locale': 'ru', 'type': 'contextual'},
    ],
    'ru/kak-ai-bot-pomogaet-ne-teryat-klientov-posle-reklamy.json': [
        {'target': '/ru/whatsapp-bot-dlya-biznesa/', 'anchor': 'WhatsApp-бот для бизнеса', 'locale': 'ru', 'type': 'contextual'},
        {'target': '/ru/ai-bot-dlya-agentstva-nedvizhimosti/', 'anchor': 'квалификация заявок в недвижимости', 'locale': 'ru', 'type': 'contextual'},
    ],
    'ru/ai-bot-dlya-biznesa-v-uzbekistane.json': [
        {'target': '/ru/whatsapp-bot-dlya-biznesa/', 'anchor': 'WhatsApp-бот для бизнеса в Узбекистане', 'locale': 'ru', 'type': 'contextual'},
        {'target': '/ru/ai-bot-dlya-agentstva-nedvizhimosti/', 'anchor': 'AI-бот для риелторов и агентств недвижимости', 'locale': 'ru', 'type': 'contextual'},
    ],

    # ---------- RU blog → /ru/ai-bot-dlya-agentstva-nedvizhimosti/ ----------
    'ru/kakoi-ai-bot-nuzhen-vashei-nishe-v-uzbekistane.json': [
        {'target': '/ru/ai-bot-dlya-agentstva-nedvizhimosti/', 'anchor': 'AI-бот для агентства недвижимости', 'locale': 'ru', 'type': 'niche'},
    ],
    'ru/kak-vybrat-ai-bota-dlya-biznesa.json': [
        {'target': '/ru/ai-bot-dlya-agentstva-nedvizhimosti/', 'anchor': 'AI-бот для риелторов', 'locale': 'ru', 'type': 'niche'},
        {'target': '/ru/ai-bot-s-crm-amocrm-bitrix24/', 'anchor': 'интеграция AI-бота с AmoCRM и Bitrix24', 'locale': 'ru', 'type': 'contextual'},
    ],

    # ---------- RU blog → /ru/ai-bot-s-crm-amocrm-bitrix24/ ----------
    'ru/kak-podklyuchit-telegram-bot-k-crm.json': [
        {'target': '/ru/ai-bot-s-crm-amocrm-bitrix24/', 'anchor': 'AI-бот с интеграцией AmoCRM и Bitrix24', 'locale': 'ru', 'type': 'contextual'},
        {'target': '/ru/whatsapp-bot-dlya-biznesa/', 'anchor': 'WhatsApp-бот для бизнеса', 'locale': 'ru', 'type': 'contextual'},
    ],
    'ru/telegram-bot-crm-ili-menedzher.json': [
        {'target': '/ru/ai-bot-s-crm-amocrm-bitrix24/', 'anchor': 'AI-бот с AmoCRM или Bitrix24', 'locale': 'ru', 'type': 'contextual'},
    ],
    'ru/kak-podgotovit-biznes-k-zapusku-gpt-bota.json': [
        {'target': '/ru/ai-bot-s-crm-amocrm-bitrix24/', 'anchor': 'связка GPT-бота с CRM', 'locale': 'ru', 'type': 'contextual'},
    ],
    'ru/avtomatizatsiya-zayavok-instruktsiya.json': [
        {'target': '/ru/ai-bot-s-crm-amocrm-bitrix24/', 'anchor': 'передача заявок в AmoCRM или Bitrix24', 'locale': 'ru', 'type': 'contextual'},
        {'target': '/ru/ai-bot-dlya-agentstva-nedvizhimosti/', 'anchor': 'AI-бот для агентства недвижимости', 'locale': 'ru', 'type': 'niche'},
    ],

    # ---------- UZ blog → UZ money pages ----------
    'uz/instagram-telegram-crm-bitta-ariza-voronkasi.json': [
        {'target': '/uz/whatsapp-bot-biznes-uchun/', 'anchor': "WhatsApp bot biznes uchun", 'locale': 'uz', 'type': 'contextual'},
        {'target': '/uz/amocrm-bitrix24-bilan-ai-bot/', 'anchor': "AmoCRM va Bitrix24 bilan AI bot", 'locale': 'uz', 'type': 'contextual'},
    ],
    'uz/toshkentda-biznes-uchun-chat-bot-qaysi-kanal.json': [
        {'target': '/uz/whatsapp-bot-biznes-uchun/', 'anchor': "WhatsApp Business uchun bot", 'locale': 'uz', 'type': 'contextual'},
    ],
    'uz/qaysi-ai-bot-qaysi-nishaga-mos-uzbekistonda.json': [
        {'target': '/uz/kochmas-mulk-agentligi-uchun-ai-bot/', 'anchor': "ko'chmas mulk agentligi uchun AI bot", 'locale': 'uz', 'type': 'niche'},
    ],
    'uz/ai-botni-biznes-uchun-qanday-tanlash.json': [
        {'target': '/uz/kochmas-mulk-agentligi-uchun-ai-bot/', 'anchor': "rieltorlar uchun AI bot", 'locale': 'uz', 'type': 'niche'},
        {'target': '/uz/amocrm-bitrix24-bilan-ai-bot/', 'anchor': "AmoCRM va Bitrix24 bilan integratsiya", 'locale': 'uz', 'type': 'contextual'},
    ],
    'uz/telegram-bot-crm-yoki-menejer.json': [
        {'target': '/uz/amocrm-bitrix24-bilan-ai-bot/', 'anchor': "AmoCRM yoki Bitrix24 bilan AI bot", 'locale': 'uz', 'type': 'contextual'},
    ],
    'uz/biznes-instagram-telegramdan-kelgan-arizalarni-nega-yoqotadi.json': [
        {'target': '/uz/whatsapp-bot-biznes-uchun/', 'anchor': "WhatsApp uchun avtomatik javob boti", 'locale': 'uz', 'type': 'contextual'},
        {'target': '/uz/kochmas-mulk-agentligi-uchun-ai-bot/', 'anchor': "ko'chmas mulk agentligi uchun AI bot", 'locale': 'uz', 'type': 'niche'},
    ],
}


def main():
    total_added = 0
    skipped = 0
    for rel_path, new_links in ADDITIONS.items():
        fp = BLOG / rel_path
        if not fp.exists():
            print(f"MISS: {fp}")
            skipped += 1
            continue
        data = json.loads(fp.read_text(encoding='utf-8'))
        existing = data.get('internalLinks', [])
        existing_targets = {l.get('target') for l in existing}

        added_here = 0
        for link in new_links:
            if link['target'] in existing_targets:
                continue  # idempotent: don't duplicate
            existing.append(link)
            existing_targets.add(link['target'])
            added_here += 1

        if added_here == 0:
            continue
        data['internalLinks'] = existing
        # Touch dateModified so freshness is bumped
        data['dateModified'] = '2026-06-24'
        data['updatedAt'] = '2026-06-24T00:00:00.000Z'

        fp.write_text(
            json.dumps(data, indent=2, ensure_ascii=False) + '\n',
            encoding='utf-8',
        )
        print(f"+{added_here} → {rel_path}")
        total_added += added_here

    print(f"\nTotal links added: {total_added} (across {len(ADDITIONS)} articles, {skipped} missing)")


if __name__ == '__main__':
    main()
