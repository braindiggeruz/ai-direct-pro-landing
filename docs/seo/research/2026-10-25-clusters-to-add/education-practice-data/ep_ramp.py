import json, os, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
HERE = os.path.dirname(os.path.abspath(__file__))
m = json.load(open(os.path.join(HERE, 'ep_model.json'), encoding='utf-8'))
# Ramp assumption: share of the pos-6 forecast reached in month n: K(n) = min(1, K1 * n**1.6)
# K1 = 0.04 for articles (calibration of 7 school guides, roadmap K~0.04); 0.08 for interactive tools/quizzes on weak SERPs (assumption, 2x)
K1 = {'practice_tests': 0.08, 'exam_prep': 0.04, 'math_formulas_calculators': 0.08, 'logic_quiz': 0.06,
      'iq_test': 0.06, 'periodic_table_chem': 0.08, 'ona_tili_grammar': 0.04, 'english_grammar': 0.04,
      'ielts_cefr_writing': 0.04, 'number_converters': 0.08, 'primary_math_grades': 0.06, 'olympiad': 0.04,
      'driving_theory': 0.04}
def weeks_to(target, full, k1):
    if full <= 0: return None
    for w in range(1, 105):
        n = w / 4.345
        if full * min(1, k1 * n ** 1.6) >= target:
            return w
    return None
out = {}
for c in m['clusters'] + m['adjacent']:
    a6 = sum(c['visits_pos6_ads']) / 2; f6 = sum(c['visits_pos6_floor']) / 2
    k = K1[c['id']]
    n_full = (1 / k) ** (1 / 1.6)
    noaio = round(c['demand_ads_core'] * 0.03593 / 30 * 1.5)
    r = {'k1': k, 'months_to_full_pos6': round(n_full, 1), 'm1_visits_ads_mid': round(a6 * k, 1), 'm1_visits_floor_mid': round(f6 * k, 1),
         'weeks_to_5_ads': weeks_to(5, a6, k), 'weeks_to_5_floor': weeks_to(5, f6, k),
         'weeks_to_10_ads': weeks_to(10, a6, k), 'weeks_to_10_floor': weeks_to(10, f6, k), 'pos3_no_aio_ads': noaio}
    out[c['id']] = r
    print(c['id'], r)
json.dump(out, open(os.path.join(HERE, 'ep_ramp.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('pos3 no-AIO total ads:', sum(v['pos3_no_aio_ads'] for k, v in out.items() if k != 'driving_theory'))
