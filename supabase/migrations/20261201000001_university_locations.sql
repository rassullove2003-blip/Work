-- Координаты университетов для карты. Источник: OpenStreetMap (Nominatim), © участники OpenStreetMap, лицензия ODbL.
-- geo_precision: building — здание/кампус вуза; city — центр города (здание вуза в OSM не найдено однозначно).
alter table public.universities add column if not exists latitude double precision check (latitude between -90 and 90);
alter table public.universities add column if not exists longitude double precision check (longitude between -180 and 180);
alter table public.universities add column if not exists geo_precision text check (geo_precision in ('building', 'city'));
alter table public.universities add column if not exists geo_source text check (char_length(geo_source) <= 200);

update public.universities u set latitude = v.lat, longitude = v.lon, geo_precision = v.prec, geo_source = v.src
from (values
  ('bocconi', 45.449904, 9.189264, 'building', 'OpenStreetMap way/191214429'),
  ('humanitas', 45.370343, 9.171865, 'building', 'OpenStreetMap way/551124798'),
  ('iuav', 45.479390, 12.255261, 'building', 'OpenStreetMap way/1341784665'),
  ('iulm', 45.442039, 9.162591, 'building', 'OpenStreetMap relation/8404421'),
  ('luiss', 41.918872, 12.511318, 'building', 'OpenStreetMap way/369264171'),
  ('lumsa', 41.903640, 12.463619, 'building', 'OpenStreetMap relation/19811352'),
  ('milano-bicocca', 45.518276, 9.213904, 'building', 'OpenStreetMap way/25102946'),
  ('polimi', 45.464194, 9.189635, 'city', 'OpenStreetMap relation/44915'),
  ('polito', 45.063697, 7.657526, 'building', 'OpenStreetMap relation/3802268'),
  ('roma-tre', 41.864740, 12.480105, 'building', 'OpenStreetMap way/1422836179'),
  ('rufa', 41.864002, 12.481068, 'building', 'OpenStreetMap way/1415492517'),
  ('sapienza', 41.903500, 12.514769, 'building', 'OpenStreetMap way/24240718'),
  ('tor-vergata', 41.853431, 12.604420, 'building', 'OpenStreetMap relation/13499165'),
  ('uniba', 41.125784, 16.862029, 'city', 'OpenStreetMap relation/41038'),
  ('unibg', 45.686893, 9.661332, 'building', 'OpenStreetMap way/225562780'),
  ('unibo', 44.498289, 11.354457, 'building', 'OpenStreetMap way/312906475'),
  ('unibs', 45.565002, 10.231582, 'building', 'OpenStreetMap relation/2811784'),
  ('unical', 39.362087, 16.223709, 'building', 'OpenStreetMap relation/15877132'),
  ('unicas', 41.475074, 13.828582, 'building', 'OpenStreetMap way/169322413'),
  ('unicatt', 45.461854, 9.177056, 'building', 'OpenStreetMap way/446539188'),
  ('unict', 37.502361, 15.087372, 'city', 'OpenStreetMap relation/39230'),
  ('unife', 44.833378, 11.626397, 'building', 'OpenStreetMap node/965900786'),
  ('unifi', 43.774774, 11.263075, 'building', 'OpenStreetMap way/780537948'),
  ('unige', 44.414886, 8.926671, 'building', 'OpenStreetMap node/2615895568'),
  ('unimc', 43.301015, 13.445968, 'building', 'OpenStreetMap relation/5587158'),
  ('unime', 38.229636, 15.551104, 'building', 'OpenStreetMap relation/6457018'),
  ('unimi', 45.475608, 9.233364, 'building', 'OpenStreetMap way/255201367'),
  ('unimore', 44.645888, 10.925571, 'city', 'OpenStreetMap relation/43336'),
  ('unina', 40.847759, 14.256604, 'building', 'OpenStreetMap way/267097513'),
  ('unipa', 38.111227, 13.352443, 'city', 'OpenStreetMap relation/39513'),
  ('unipd', 45.406650, 11.877441, 'building', 'OpenStreetMap way/860030273'),
  ('unipg', 43.116386, 12.385316, 'building', 'OpenStreetMap way/37117992'),
  ('unipi', 43.720378, 10.408225, 'building', 'OpenStreetMap node/1715982961'),
  ('unipr', 44.804251, 10.335208, 'building', 'OpenStreetMap way/34386999'),
  ('unipv', 45.186926, 9.156877, 'building', 'OpenStreetMap way/579806935'),
  ('unisa', 40.772008, 14.791180, 'building', 'OpenStreetMap way/588793407'),
  ('unisi', 43.319110, 11.332854, 'building', 'OpenStreetMap node/13128993707'),
  ('unitn', 46.066423, 11.125760, 'city', 'OpenStreetMap relation/46663'),
  ('unito', 45.073382, 7.699437, 'building', 'OpenStreetMap way/450278224'),
  ('units', 45.660174, 13.794782, 'building', 'OpenStreetMap way/171519490'),
  ('uniud', 46.067306, 13.231995, 'building', 'OpenStreetMap way/544557819'),
  ('univaq', 42.369033, 13.349755, 'building', 'OpenStreetMap relation/8594103'),
  ('unive', 45.434496, 12.326448, 'building', 'OpenStreetMap node/2712904541'),
  ('univr', 45.436340, 11.003030, 'building', 'OpenStreetMap way/23936318')
) as v(slug, lat, lon, prec, src)
where u.slug = v.slug and u.latitude is null;
