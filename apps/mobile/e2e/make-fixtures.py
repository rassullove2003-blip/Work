"""Создаёт тестовые .xlsx для e2e импорта (все коды начинаются с qa-, чтобы их было легко удалить)."""
import json, sys, datetime
from pathlib import Path
import openpyxl

root = Path(__file__).resolve().parents[3]
spec = json.loads((root / 'packages/shared/data/import-template.json').read_text())
out = Path(__file__).parent / 'fixtures'

def headers(sheet):
    cols = sheet['columns'] + [c for c in spec['verification'] if 'only' not in c or sheet['key'] in c['only']]
    return [c['h'] + (' *' if c.get('req') else '') for c in cols]

def book(rows_by_title, name):
    wb = openpyxl.Workbook()
    wb.active.title = 'Инструкция'
    wb.active['A1'] = 'тест'
    for sh in spec['sheets']:
        ws = wb.create_sheet(sh['title'])
        hs = headers(sh)
        ws.append(hs)
        for r in rows_by_title.get(sh['title'], []):
            ws.append([r.get(h.replace(' *', ''), None) for h in hs])
    wb.save(out / name)

good = {
    'Университеты': [{'Код вуза': 'qa-unimc', 'Официальное название': 'QA Università di Macerata', 'Город (по-итальянски)': 'Macerata', 'Город (по-русски)': 'Мачерата', 'Регион': 'Марке', 'Тип вуза': 'Государственный', 'Популярный': 'нет', 'Публикация': 'Опубликовано'}],
    'Программы': [{'Код программы': 'qa-unimc-econ', 'Код вуза': 'qa-unimc', 'Название в оригинале': 'QA Economics and Law', 'Уровень': 'Бакалавриат', 'Направления': 'Экономика, Право', 'Язык обучения': 'Английский', 'Длительность, лет': 3, 'ECTS': 180, 'Публикация': 'Опубликовано'}],
    'Стоимость': [
        {'Код программы': 'qa-unimc-econ', 'Учебный год': '2026/2027', 'Для кого': 'Граждане EU', 'Стоимость от, € в год': 156, 'Стоимость до, € в год': 2500, 'Публикация': 'Опубликовано'},
        {'Код программы': 'qa-unimc-econ', 'Учебный год': '2026/2027', 'Для кого': 'Non-EU, проживающие за рубежом', 'Стоимость от, € в год': 1200, 'Публикация': 'Опубликовано'},
    ],
    'Требования': [{'Код программы': 'qa-unimc-econ', 'Учебный год': '2026/2027', 'Тип требования': 'Языковые сертификаты', 'EU: требование': 'QA English B2', 'Non-EU за рубежом: требование': 'QA IELTS 6.0', 'Non-EU за рубежом: подробности': 'или TOEFL iBT 80', 'Публикация': 'Опубликовано'}],
    'Стипендии': [{'Код стипендии': 'qa-erdis', 'Организация': 'QA ERDIS Marche', 'Название на русском': 'QA стипендия Марке', 'Регион': 'Марке', 'Коды вузов': 'qa-unimc', 'Учебный год': '2026/2027', 'Условия Non-EU за рубежом': 'QA ISEE Parificato', 'Публикация': 'Опубликовано'}],
    'Дедлайны': [{'Код дедлайна': 'qa-unimc-econ-2026-noneu', 'Код программы': 'qa-unimc-econ', 'Название срока': 'QA Pre-enrolment', 'Учебный год': '2026/2027', 'Для кого': 'Non-EU, проживающие за рубежом', 'Крайний срок': datetime.date(2027, 3, 31), 'Источник': 'https://example.org/qa', 'Дата проверки': datetime.date(2026, 11, 21), 'Статус проверки': 'Проверено', 'Публикация': 'Опубликовано'}],
}
book(good, 'qa-good.xlsx')

bad = {
    'Программы': [{'Код программы': 'QA Bad', 'Код вуза': 'qa-missing', 'Название в оригинале': 'X', 'Уровень': 'Докторантура', 'Язык обучения': 'Английский'}],
    'Дедлайны': [{'Код дедлайна': 'qa-x', 'Название срока': 'X', 'Учебный год': '2026', 'Для кого': 'Все абитуриенты', 'Крайний срок': '2027-02-30'}],
}
book(bad, 'qa-bad.xlsx')
print('ok')
