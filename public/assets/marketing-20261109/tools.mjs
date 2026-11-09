/** Page-local utilities. No network, storage, analytics or HTML interpolation. */
export function buildUtm(address, values, replace = true) {
  let url;
  try { url = new URL(address.trim()); } catch { throw new Error('Укажите полный адрес с https:// или http://.'); }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password)
    throw new Error('Нужен HTTP(S)-адрес без логина и пароля в ссылке.');
  if (address.length > 4096) throw new Error('Адрес слишком длинный: максимум 4096 символов.');
  for (const key of ['source', 'medium', 'campaign', 'content', 'term']) {
    const name = 'utm_' + key;
    const value = String(values[key] ?? '').trim();
    if (value.length > 200 || /[\u0000-\u001f\u007f]/u.test(value)) throw new Error('В метке допустимо до 200 символов без управляющих знаков.');
    const keep = !replace && url.searchParams.has(name);
    if (!keep) { url.searchParams.delete(name); if (value) url.searchParams.set(name, value); }
    if (['source', 'medium', 'campaign'].includes(key) && !url.searchParams.get(name)?.trim())
      throw new Error('Заполните источник, тип трафика и кампанию.');
  }
  return { url: url.href, telegram: /(^|\.)(t\.me|telegram\.me|telegram\.dog)$/i.test(url.hostname) };
}

export function roas(revenue, spend, margin = null) {
  if (!Number.isFinite(revenue) || revenue < 0 || revenue > 1e15 || !Number.isFinite(spend) || spend <= 0 || spend > 1e15)
    throw new Error('Выручка должна быть от 0, расход — больше 0. Максимум: 1 000 000 000 000 000.');
  if (margin !== null && (!Number.isFinite(margin) || margin < 0 || margin > 100)) throw new Error('Маржа: от 0 до 100%, либо оставьте поле пустым.');
  const result = { multiple: revenue / spend, percent: revenue / spend * 100,
    threshold: margin === null || margin === 0 ? null : 100 / margin,
    contribution: margin === null ? null : revenue * margin / 100 - spend };
  if (Object.values(result).some(value => value !== null && !Number.isFinite(value))) throw new Error('Числа выходят за допустимую точность. Проверьте расход и маржу.');
  return result;
}
export function numeric(value, optional = false) {
  const s = value.trim().replace(/\s/g, '').replace(',', '.');
  if (!s && optional) return null;
  if (!/^\d+(?:\.\d+)?$/.test(s)) throw new Error('Введите число: без знака минус, букв или разделителей тысяч, кроме пробела.');
  return Number(s);
}

if (typeof document !== 'undefined') {
  const form = document.querySelector('[data-marketing-tool]');
  if (form) {
    const field = name => form.elements.namedItem(name);
    const status = form.querySelector('[data-tool-status]');
    const output = form.querySelector('[data-tool-output]');
    const copy = form.querySelector('[data-tool-copy]');
    const invalidate = () => { output.value = ''; status.textContent = ''; if (copy) copy.disabled = true; };
    form.addEventListener('input', invalidate);
    form.addEventListener('change', invalidate);
    form.addEventListener('submit', event => {
      event.preventDefault(); invalidate();
      try {
        if (form.dataset.marketingTool === 'utm') {
          const result = buildUtm(field('address').value, Object.fromEntries(['source', 'medium', 'campaign', 'content', 'term'].map(k => [k, field(k).value])), field('replace').checked);
          output.value = result.url;
          status.textContent = result.telegram ? 'Для t.me метки не создают аналитику сайта или события бота. Проверьте поддерживаемый ботом start-параметр.' : 'Ссылка готова. Проверьте страницу и сохранение меток после переходов.';
          copy.disabled = false;
        } else {
          const margin = numeric(field('margin').value, true);
          const result = roas(numeric(field('revenue').value), numeric(field('spend').value), margin);
          const fmt = n => n.toLocaleString('ru-RU', { maximumFractionDigits: 2 });
          output.value = `ROAS: ${fmt(result.multiple)}× (${fmt(result.percent)}%).`;
          if (margin !== null) output.value += `\nПорог покрытия рекламы: ${margin === 0 ? 'при нулевой марже недостижим' : fmt(result.threshold) + '×'}.\nПосле переменных затрат и рекламы: ${fmt(result.contribution)} сум.`;
          status.textContent = 'Это расчёт по вашим данным, не чистая прибыль и не прогноз. Проверьте период, валюту и состав затрат.';
        }
      } catch (error) { status.textContent = error.message; }
    });
    copy?.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(output.value); status.textContent = 'Ссылка скопирована.'; }
      catch { output.focus(); output.select(); status.textContent = 'Автокопирование недоступно. Выделенная ссылка готова к ручному копированию.'; }
    });
    form.querySelectorAll('[data-tool-preset]').forEach(button => button.addEventListener('click', () => {
      const presets = { meta: ['facebook', 'paid_social'], google: ['google', 'cpc'], telegram: ['telegram', 'paid_placement'] };
      const [source, medium] = presets[button.dataset.toolPreset];
      field('source').value = source; field('medium').value = medium;
      invalidate(); field('campaign').focus();
    }));
    form.querySelector('[data-tool-controls]').hidden = false;
  }
}
