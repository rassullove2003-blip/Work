"""
Переводит исследовательскую таблицу «Поступление в Италию 2027/28» (один лист, текстовые ячейки)
в шаблон импорта UniItalia (листы Университеты / Программы / Стоимость / Требования / Стипендии / Дедлайны).

Ничего не выдумывает: суммы стоимости остаются текстом-пояснением, даты дедлайнов берутся только
из строк вида «2027/2028 · Категория · Название: 2027-05-15», статус «Проверено» без даты проверки
переводится в «Требует проверки».

Запуск: python3 scripts/convert-research-table.py <исходник.xlsx> <результат.xlsx> [существующие_программы.json]
"""
import json
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parents[1]
SPEC = json.loads((ROOT / 'packages/shared/data/import-template.json').read_text())

# Вуз в исходнике → код вуза в приложении.
UNI_MAP = {
    'Bologna University': 'unibo', 'Padova University': 'unipd', 'Politechnico di Milano': 'polimi',
    'University of Milan': 'unimi', 'University of Turin': 'unito', 'University of Genoa': 'unige',
    'Sapienza University': 'sapienza', 'Politecnico di Torino': 'polito', "Ca' Foscari": 'unive',
    'University of Florence': 'unifi', 'University of Pavia': 'unipv', 'Università Cattolica del Sacro Cuore': 'unicatt',
    'Bocconi University': 'bocconi', 'Tor Vergata': 'tor-vergata', "L'Università di Milano-Bicocca": 'milano-bicocca',
    'Pisa University': 'unipi', 'Siena University': 'unisi', 'Luiss University': 'luiss', 'Messina University': 'unime',
    'Calabria University': 'unical', 'Verona': 'univr', 'Cassino University': 'unicas', 'Roma Tre': 'roma-tre',
    'Macerata University': 'unimc', 'IULM': 'iulm', 'LUMSA': 'lumsa', 'Rome University of Fine Arts': 'rufa',
}
# Вузы, которых ещё нет в приложении (официальные названия, города и сайты общеизвестны; статус — «Не проверено»).
NEW_UNIS = {
    'unimc': dict(official='Università degli Studi di Macerata', ru='Университет Мачераты', en='University of Macerata', city='Macerata', city_ru='Мачерата', type='Государственный', site='https://www.unimc.it'),
    'iulm': dict(official='Libera Università di Lingue e Comunicazione IULM', ru='Университет IULM', en='IULM University', city='Milano', city_ru='Милан', type='Частный', site='https://www.iulm.it'),
    'lumsa': dict(official='LUMSA Università', ru='Университет LUMSA', en='LUMSA University', city='Roma', city_ru='Рим', type='Частный', site='https://www.lumsa.it'),
    'rufa': dict(official='Rome University of Fine Arts (RUFA)', ru='Римский университет изящных искусств (RUFA)', en='Rome University of Fine Arts', city='Roma', city_ru='Рим', type='Частный', site='https://www.unirufa.it'),
}
SKIP_UNIS = {'IED (Accademia di Belle Arti)': 'не указан город и юридическое лицо (IED работает в нескольких городах)'}

# Стипендия в исходнике → код стипендии. Существующие в приложении: laziodisco, ergo, edisu-piemonte, dsu-toscana, aliseo, ersu-messina.
SCH_MAP = {
    'DiSCo Lazio': ('laziodisco', 'DiSCo Lazio (LazioDiSCo)', 'Региональная стипендия DSU — Лацио'),
    'ER.GO': ('ergo', 'ER.GO — Azienda Regionale per il Diritto agli Studi Superiori', 'Региональная стипендия DSU — Эмилия-Романья'),
    'EDISU Piemonte': ('edisu-piemonte', 'EDISU Piemonte', 'Региональная стипендия DSU — Пьемонт'),
    'DSU Toscana': ('dsu-toscana', 'DSU Toscana', 'Региональная стипендия DSU — Тоскана'),
    'ALiSEO Liguria': ('aliseo', "ALiSEO — Agenzia Ligure per gli Studenti e l'Orientamento", 'Региональная стипендия DSU — Лигурия'),
    'ERSU Messina': ('ersu-messina', 'ERSU Messina', 'Стипендия DSU — Мессина (Сицилия)'),
    'Università degli Studi di Padova': ('unipd-dsu', 'Università degli Studi di Padova', 'Стипендия DSU — Падуанский университет'),
    'Politecnico di Milano': ('polimi-dsu', 'Politecnico di Milano', 'Стипендия DSU — Миланский политехнический университет'),
    'Università degli Studi di Milano': ('unimi-dsu', 'Università degli Studi di Milano', 'Стипендия DSU — Миланский университет'),
    'Università Ca’ Foscari Venezia': ('unive-dsu', "Università Ca' Foscari Venezia", 'Стипендия DSU — Университет Ка-Фоскари'),
    'EDiSU Pavia': ('edisu-pavia', 'EDiSU Pavia', 'Стипендия DSU — Павия'),
    'EDUCatt': ('educatt', 'EDUCatt', 'Стипендия DSU — Католический университет'),
    'ISU Bocconi': ('isu-bocconi', 'ISU Bocconi', 'Стипендия DSU — Боккони'),
    'Università degli Studi di Milano-Bicocca': ('unimib-dsu', 'Università degli Studi di Milano-Bicocca', 'Стипендия DSU — Миланский университет Бикокка'),
    'Università della Calabria': ('unical-dsu', 'Università della Calabria', 'Стипендия DSU — Университет Калабрии'),
    'Università degli Studi di Verona': ('univr-dsu', 'Università degli Studi di Verona', 'Стипендия DSU — Веронский университет'),
    'ERDIS Marche': ('erdis-marche', 'ERDIS Marche', 'Региональная стипендия DSU — Марке'),
    'Università IULM': ('iulm-dsu', 'Università IULM', 'Стипендия DSU — Университет IULM'),
}
SOURCE_LEVEL = {'магистратура': 'Магистратура', 'бакалавриат': 'Бакалавриат', 'phd': 'Докторантура (PhD)',
                'single-cycle degree programme': 'Одноцикловая программа', 'foundation': 'Foundation'}
CATALOG_LEVEL = {'PhD': 'Докторантура (PhD)'}
REQ_TYPES = {'📎': 'Образование (аттестат, диплом)', '🔤': 'Языковые сертификаты', '🧪': 'Вступительные испытания', '🎓': 'Другое'}


def norm(s):
    s = unicodedata.normalize('NFD', str(s).lower().replace('ё', 'е'))
    return ''.join(c for c in s if unicodedata.category(c) != 'Mn')


def slugify(s):
    return re.sub(r'-+', '-', re.sub(r'[^a-z0-9]+', '-', norm(s))).strip('-')


def first_url(v):
    m = re.search(r'https?://\S+', str(v or ''))
    return m.group(0).rstrip('.,;)') if m else None


def clean(v):
    if v is None:
        return None
    s = str(v).strip()
    return s or None


def to_int(v):
    try:
        f = float(str(v).replace(',', '.'))
        return int(f) if f == int(f) else None
    except (TypeError, ValueError):
        return None


def split_first_sentence(text, limit=140):
    """Короткий заголовок требования + остальное в подробности."""
    t = text.strip()
    m = re.match(r'^(.{10,%d}?[.;])\s+(.+)$' % limit, t, re.S)
    if m:
        return m.group(1).rstrip(';.'), m.group(2).strip()
    return (t, None) if len(t) <= limit else (t[:limit].rsplit(' ', 1)[0] + '…', t)


def headers(sheet_key):
    sh = next(s for s in SPEC['sheets'] if s['key'] == sheet_key)
    cols = sh['columns'] + [c for c in SPEC['verification'] if 'only' not in c or sheet_key in c['only']]
    return sh['title'], [c['h'] + (' *' if c.get('req') else '') for c in cols]


def main(src, dst, existing_json=None):
    existing = json.loads(Path(existing_json).read_text()) if existing_json else []
    by_title = {(e['uni'], norm(e['title_original']).strip()): e['slug'] for e in existing}

    wb = openpyxl.load_workbook(src, data_only=True)
    ws = wb['Университеты']
    H = [c for c in next(ws.iter_rows(min_row=1, max_row=1, values_only=True))]
    col = {h: i for i, h in enumerate(H) if h}
    get = lambda r, name: clean(r[col[name]])

    out = {k: [] for k in ['universities', 'programs', 'fees', 'requirements', 'scholarships', 'deadlines']}
    report = Counter()
    skipped = []
    # занятые коды: уже существующие в приложении + выданные в этом файле
    taken = set()
    existing_slugs = {e['slug'] for e in existing}
    sch_unis = defaultdict(set)
    sch_info = {}
    uni_region = {}

    rows = [r for r in ws.iter_rows(min_row=2, values_only=True) if any(c not in (None, '') for c in r)]
    for n, r in enumerate(rows, start=2):
        src_uni = get(r, 'Вуз в исходнике')
        if src_uni in SKIP_UNIS:
            skipped.append(f'строка {n}: {src_uni} — {SKIP_UNIS[src_uni]}')
            continue
        uni = UNI_MAP.get(src_uni)
        if not uni:
            skipped.append(f'строка {n}: вуз «{src_uni}» не сопоставлен')
            continue
        region = (get(r, 'Регион') or '').replace('Cицилия', 'Сицилия')  # латинская C в исходнике
        uni_region[uni] = region

        title = get(r, 'Официальное название программы / профиля') or get(r, 'Программа в исходнике')
        level = get(r, 'Уровень по каталогу')
        level = CATALOG_LEVEL.get(level, level) if level else SOURCE_LEVEL.get((get(r, 'Уровень в исходнике') or '').strip().lower())
        year = get(r, 'Год данных программы')
        year = year if year and re.match(r'^\d{4}/\d{4}$', year) else None
        req_year = year or '2026/2027'

        # Код программы: существующая запись того же вуза с тем же названием — обновляем её.
        slug = by_title.get((uni, norm(title).strip()))
        if not slug or slug in taken:
            slug = None
        if not slug:
            base = f'{uni}-{slugify(title)}'[:70].strip('-')
            cand = base
            if (cand in taken or cand in existing_slugs) and level:
                cand = f'{base}-{slugify(level)}'[:80].strip('-')
            k = 2
            while cand in taken or cand in existing_slugs:
                cand = f'{base}-{k}'
                k += 1
            slug = cand
        taken.add(slug)

        prog_url = first_url(get(r, 'Официальный материал программы'))
        out['programs'].append({
            'Код программы': slug, 'Код вуза': uni, 'Название в оригинале': title, 'Уровень': level,
            'Язык обучения': (get(r, 'Язык обучения') or None), 'Длительность, лет': to_int(get(r, 'Лет')), 'ECTS': to_int(get(r, 'ECTS')),
            'Страница программы': prog_url, 'Описание на русском': get(r, 'Учебный план (кратко; профильный обзор)'),
            'Учебный год данных': year, 'Источник': prog_url, 'Статус проверки': 'Требует проверки', 'Публикация': 'Опубликовано',
        })
        report['programs'] += 1

        fee = get(r, 'Стоимость (€ в год / обязательный платёж; ориентир 2027/28)')
        if fee:
            out['fees'].append({'Код программы': slug, 'Учебный год': req_year, 'Для кого': 'Все абитуриенты', 'Примечание': fee,
                                'Источник': first_url(get(r, 'Официальный источник стоимости / страница курса')),
                                'Статус проверки': 'Требует проверки', 'Публикация': 'Опубликовано'})

        # Требования: общий блок (📎 🔤 🧪 🎓) + строки по программе «год · тип: текст».
        reqs = {}
        req_text = get(r, 'Требования к поступлению (общие + конкретная программа)') or ''
        for line in req_text.split('\n'):
            line = line.strip()
            m = re.match(r'^(?:🔎 По программе \(проверить по call 2027/28\): )?(\d{4}/\d{4}) · ([^:]+): (.+)$', line)
            if m:
                key = (m.group(1), m.group(2).strip())
                t, d = split_first_sentence(m.group(3))
                prev = reqs.get(key)
                reqs[key] = {'title': t, 'details': '\n'.join(x for x in [d, prev and prev.get('general')] if x) or None}
                continue
            for emoji, rtype in REQ_TYPES.items():
                if line.startswith(emoji):
                    text = line[len(emoji):].strip()
                    key = (req_year, rtype)
                    if key in reqs:  # уже есть строка по программе — общий текст в подробности
                        reqs[key]['details'] = '\n'.join(x for x in [reqs[key]['details'], text] if x)
                    else:
                        t, d = split_first_sentence(text)
                        reqs[key] = {'title': t, 'details': d, 'general': text}
        req_src = first_url(get(r, 'Источники по требованиям'))
        for (ry, rtype), v in reqs.items():
            out['requirements'].append({'Код программы': slug, 'Учебный год': ry, 'Тип требования': rtype,
                                        'Для всех: требование': v['title'], 'Для всех: подробности': v['details'],
                                        'Источник': req_src, 'Статус проверки': 'Требует проверки', 'Публикация': 'Опубликовано'})

        # Дедлайны только с датой.
        dl_text = get(r, 'Дедлайны 2027/28 (официальные / ориентир)') or ''
        dl_src = first_url(get(r, 'Источник дедлайна / страница программы'))
        for i, line in enumerate(l.strip() for l in dl_text.split('\n')):
            m = re.match(r'^(\d{4}/\d{4}) · ([^·]+) · (.+): (\d{4}-\d{2}-\d{2})(?: — (\d{4}-\d{2}-\d{2}))?$', line)
            if not m:
                continue
            dy, cat, name, d1, d2 = m.groups()
            starts, ends = (d1, d2) if d2 else (None, d1)
            out['deadlines'].append({'Код дедлайна': f'{slug}-dl{i + 1}'[:90], 'Код программы': slug, 'Название срока': name.strip(),
                                     'Учебный год': dy, 'Для кого': cat.strip(), 'Дата начала': starts, 'Крайний срок': ends,
                                     'Источник': dl_src, 'Статус проверки': 'Требует проверки', 'Публикация': 'Опубликовано'})

        sch = get(r, 'Стипендия вуза / региона (право по конкурсу)')
        if sch and '·' in sch:
            name = sch.split('·')[-1].strip()
            if name in SCH_MAP:
                code, org, ru = SCH_MAP[name]
                sch_unis[code].add(uni)
                sch_info.setdefault(code, {'org': org, 'ru': ru, 'region': region,
                                           'site': first_url(get(r, 'Источник по стипендии')), 'year': sch.split('·')[0].strip()})
            else:
                report[f'стипендия не сопоставлена: {name}'] += 1

    for code, info in NEW_UNIS.items():
        if code in uni_region:
            out['universities'].append({'Код вуза': code, 'Официальное название': info['official'], 'Название на русском': info['ru'],
                                        'Название на английском': info['en'], 'Город (по-итальянски)': info['city'], 'Город (по-русски)': info['city_ru'],
                                        'Регион': uni_region[code], 'Тип вуза': info['type'], 'Официальный сайт': info['site'],
                                        'Источник': info['site'], 'Статус проверки': 'Не проверено', 'Публикация': 'Опубликовано'})
    for code, info in sch_info.items():
        out['scholarships'].append({'Код стипендии': code, 'Организация': info['org'], 'Название на русском': info['ru'], 'Регион': info['region'],
                                    'Официальный сайт': info['site'], 'Коды вузов': ', '.join(sorted(sch_unis[code])),
                                    'Учебный год': info['year'] if re.match(r'^\d{4}/\d{4}$', info['year']) else None,
                                    'Источник': info['site'], 'Статус проверки': 'Требует проверки', 'Публикация': 'Опубликовано'})

    res = openpyxl.Workbook()
    res.active.title = 'Инструкция'
    res.active['A1'] = f'Сконвертировано из «{Path(src).name}». Загрузите файл: Управление → Импорт данных → Выбрать файл.'
    for key, data in out.items():
        title, hs = headers(key)
        sh = res.create_sheet(title)
        sh.append(hs)
        for row in data:
            sh.append([row.get(h.replace(' *', '')) for h in hs])
    res.save(dst)
    print(json.dumps({k: len(v) for k, v in out.items()}, ensure_ascii=False))
    for k, v in report.items():
        if k != 'programs':
            print('!', k, v)
    for s in skipped:
        print('пропущено:', s)


if __name__ == '__main__':
    main(*sys.argv[1:])
