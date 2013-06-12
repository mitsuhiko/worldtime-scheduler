import re
import pytz
from datetime import datetime, timedelta
from flask import Flask, json, request, abort, render_template


app = Flask(__name__)
app.config.update(
    DEBUG=True
)

_split_re = re.compile(r'[\t !@#$%^&*()/:;,._-]+')


def _load_data():
    with app.open_resource('data/countries.json') as f:
        countries = json.load(f)['countries']

    with app.open_resource('data/cities.json') as f:
        cities = json.load(f)['cities']
        for city_key in cities:
            city = cities[city_key]
            country_name = countries[city['country']]['name']
            city['key'] = city_key
            city['full_display_name'] = city['display_name'] + ', ' + country_name
            city['search_name'] = city['full_display_name'].lower()
            city['sw_prim'] = city['display_name'].lower().split()
            city['sw_sec'] = city['sw_prim'] + country_name.lower().split()

    return countries, cities


countries, cities = _load_data()


def get_city(city_key):
    rv = cities.get(city_key)
    if rv is not None:
        return rv
    abort(404)


def _find_cities(q, find_one=False):
    results = []
    _push = results.append
    q = q.strip().lower()
    qw = _split_re.split(q)
    exact_match = None

    # XXX: add actual timezones (PSD, GMT etc.)

    if qw:
        for city in cities.values():
            if city['search_name'] == q:
                _push((0, city))
                exact_match = city
            elif search_words_match(qw, city['sw_prim']):
                _push((1, city))
            elif search_words_match(qw, city['sw_sec']):
                _push((2, city))

    if find_one and exact_match is not None:
        return exact_match

    results.sort(key=lambda x: (x[0], -x[1]['population']))
    if find_one:
        return results and results[0][1] or None
    return results


def expose_city(city):
    return {
        'timezone': city['timezone'],
        'name': city['display_name'],
        'full_name': city['full_display_name'],
        'country': countries[city['country']]['name'],
        'key': city['key']
    }


def dump_local_date(d):
    return d.strftime('%a, %d %b %Y %H:%M:%S %z (%Z)')


def search_words_match(search_words, reference_words):
    for search_word in search_words:
        for reference_word in reference_words:
            if reference_word.startswith(search_word):
                break
        else:
            return False
    return True


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/api/find_timezone')
def api_find_timezone():
    result = _find_cities(request.args['q'], find_one=True)
    if result is not None:
        result = expose_city(result)
    return json.jsonify(result=result)


@app.route('/api/find_timezones')
def api_find_timezones():
    limit = min(request.args.get('limit', type=int, default=8), 50)
    results = _find_cities(request.args['q'])
    exported = []
    for _, city in results[:limit]:
        exported.append(expose_city(city))
    return json.jsonify(results=exported)


@app.route('/api/row')
def api_get_row():
    away_city = get_city(request.args['away'])
    away_tz = pytz.timezone(away_city['timezone'])
    if 'home' in request.args:
        home_city = get_city(request.args['home'])
        home_tz = pytz.timezone(home_city['timezone'])
    else:
        home_tz = None

    # XXX: add actual timezones (PSD, GMT etc.)

    try:
        year, month, day = map(int, request.args['date'].split('-', 2))
        day_utc_start = pytz.UTC.normalize((home_tz or away_tz).localize(
            datetime(year, month, day)).astimezone(pytz.UTC))
    except (TypeError, ValueError):
        abort(400)

    row = []
    hiter = day_utc_start
    all_offsets = []

    for hour in range(24):
        ht = away_tz.normalize(hiter.astimezone(away_tz))
        uc = pytz.UTC.normalize(ht.astimezone(pytz.UTC))
        item = {
            'slot': dump_local_date(ht),
            'utc': dump_local_date(uc),
        }
        if home_tz is not None:
            hh = home_tz.normalize(hiter.astimezone(home_tz))
            all_offsets.append((ht.replace(tzinfo=None) -
                hh.replace(tzinfo=None)).total_seconds())
        row.append(item)
        hiter += timedelta(hours=1)

    rv = {
        'away_city': expose_city(away_city),
        'row_start': day_utc_start,
        'row': row,
    }
    if home_tz is not None:
        mean_offset = sorted(all_offsets)[len(all_offsets) // 2]
        rv['home_away_offsets'] = {
            'all': sorted(set(all_offsets)),
            'min': min(all_offsets),
            'max': max(all_offsets),
            'day_start': all_offsets[0],
            'day_end': all_offsets[-1],
            'mean': mean_offset
        }

    return json.jsonify(rv)


if __name__ == '__main__':
    app.run()
