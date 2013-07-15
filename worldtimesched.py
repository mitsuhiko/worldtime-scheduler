import re
import pytz
from datetime import datetime, timedelta
from flask import Flask, json, request, render_template
from babel.dates import get_next_timezone_transition


app = Flask(__name__)
app.config.update(
    DEBUG=True
)

_split_re = re.compile(r'[\t !@#$%^&*()/:;,._-]+')


class APIException(Exception):

    def __init__(self, message, error, data=None):
        self.message = message
        self.error = error
        self.data = data or {}

    def to_dict(self):
        return {
            'message': self.message,
            'error': self.error,
            'data': self.data
        }

    def to_response(self):
        rv = json.jsonify(self.to_dict())
        rv.status_code = 400
        return rv


@app.errorhandler(APIException)
def on_api_exception(error):
    return error.to_response()


def _load_data():
    with app.open_resource('data/countries.json') as f:
        countries = json.load(f)['countries']

    with app.open_resource('data/cities.json') as f:
        cities = json.load(f)['cities']
        for city_key in cities:
            city = cities[city_key]
            country_name = countries[city['country']]['name']
            city['key'] = city_key
            city['ikey'] = city_key.lower()
            city['type'] = 'city'
            city['full_display_name'] = city['display_name'] + ', ' + country_name
            city['search_name'] = city['full_display_name'].lower()
            city['sw_prim'] = city['display_name'].lower().split()
            city['sw_sec'] = city['sw_prim'] + country_name.lower().split()

    with app.open_resource('data/timezones.json') as f:
        timezones = json.load(f)['timezones']
        for timezone_key in timezones:
            timezone = timezones[timezone_key]
            timezone['key'] = timezone_key
            timezone['ikey'] = timezone_key.lower()
            timezone['timezone'] = timezone_key
            timezone['type'] = 'timezone'
            timezone['full_display_name'] = '%s (%s)' % (
                timezone['name'],
                timezone['short']
            )
            timezone['search_name'] = timezone['full_display_name'].lower()
            timezone['sw'] = (timezone['name'] + ' ' + \
                timezone['short']).replace('/', ' ').lower().split()

    return countries, cities, timezones


countries, cities, timezones = _load_data()


def get_zone(key):
    rv = timezones.get(key)
    if rv is not None:
        return rv
    rv = cities.get(key)
    if rv is not None:
        return rv
    raise APIException('Zone not found', 'zone_not_found')


def get_next_transition(timezone, dt=None):
    if dt is None:
        dt = datetime.utcnow()
    try:
        rv = get_next_timezone_transition(timezone, dt)
        if rv is None:
            return None
    except TypeError:
        return None
    return {
        'activates': rv.activates,
        'from_offset': rv.from_offset,
        'to_offset': rv.to_offset,
        'from_tz': rv.from_tz,
        'to_tz': rv.to_tz,
        'is_soon': (rv.activates - dt.replace(tzinfo=None)) < timedelta(days=7)
    }


def get_rt_clock_info(timezone):
    now = datetime.utcnow()
    try:
        ti = get_next_timezone_transition(timezone, now)
    except TypeError:
        ti = None
    if ti is not None:
        return {
            'offset': ti.from_offset,
            'next_offset': ti.to_offset,
            'activates': ti.activates
        }
    return {
        'offset': timezone.utcoffset(now).total_seconds(),
        'next_offset': None,
        'activates': None
    }


def _make_date(input):
    try:
        day, month, year = map(int, input.split('-', 2))
        return datetime(year, month, day)
    except (TypeError, ValueError):
        return None


def _find_timezones(q, find_one=False, limit=None):
    results = []
    _push = results.append
    q = q.strip().lower()
    qw = _split_re.split(q)
    exact_match = None

    if qw:
        for timezone in timezones.values():
            if timezone['search_name'] == q or timezone['ikey'] == q:
                _push((0, 0, timezone))
                exact_match = timezone
                continue
            match_pos = search_words_match(qw, timezone['sw'])
            if match_pos >= 0:
                _push((1, match_pos, timezone))
                continue
        for city in cities.values():
            if city['search_name'] == q or city['ikey'] == q:
                _push((0, 0, city))
                exact_match = city
                continue
            match_pos = search_words_match(qw, city['sw_prim'])
            if match_pos >= 0:
                _push((1, match_pos, city))
                continue
            match_pos = search_words_match(qw, city['sw_sec'])
            if match_pos >= 0:
                _push((2, match_pos, city))
                continue

    if find_one and exact_match is not None:
        return exact_match

    results.sort(key=lambda x: (x[0], x[1],
        -(x[2]['type'] == 'timezone'), -x[2].get('population', 0)))
    if find_one:
        return results and results[0][1] or None
    return [x[2] for x in results[:limit]]


def expose_timezone(d):
    if d['type'] == 'timezone':
        return {
            'timezone': d['key'],
            'key': d['key'],
            'name': d['name'],
            'full_name': d['full_display_name'],
            'tz_short': d['short'],
            'country': None
        }
    return {
        'timezone': d['timezone'],
        'key': d['key'],
        'name': d['display_name'],
        'full_name': d['full_display_name'],
        'country': countries[d['country']]['name'],
        'tz_short': None
    }


def dump_local_date(d):
    return d.strftime('%a, %d %b %Y %H:%M:%S %z (%Z)')


def search_words_match(search_words, reference_words):
    lowest_match = len(reference_words) + 1
    for search_word in search_words:
        for idx, reference_word in enumerate(reference_words):
            if reference_word.startswith(search_word):
                lowest_match = min(lowest_match, idx)
                break
        else:
            return -1
    return lowest_match


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/api/find_timezone')
def api_find_timezone():
    result = _find_timezones(request.args['q'], find_one=True)
    if result is not None:
        result = expose_timezone(result)
    return json.jsonify(result=result)


@app.route('/api/find_timezones')
def api_find_timezones():
    limit = min(request.args.get('limit', type=int, default=8), 50)
    results = _find_timezones(request.args['q'], limit=limit)
    return json.jsonify(results=[expose_timezone(c) for c in results])


@app.route('/api/row')
def api_get_row():
    zone = get_zone(request.args['away'])
    away_tz = pytz.timezone(zone['timezone'])
    if 'home' in request.args:
        home_zone = get_zone(request.args['home'])
        home_tz = pytz.timezone(home_zone['timezone'])
    else:
        home_tz = None

    # XXX: add actual timezones (PSD, GMT etc.)

    date = _make_date(request.args['date'])
    if date is None:
        raise APIException('Invalid date submitted', 'invalid_date')

    step_tz = home_tz or away_tz
    day_utc_start = pytz.UTC.normalize(step_tz.localize(
        date).astimezone(pytz.UTC))
    day_utc_end = pytz.UTC.normalize(step_tz.localize(
        date + timedelta(days=1)).astimezone(pytz.UTC))

    row = []
    hiter = day_utc_start
    all_offsets = []
    zones_found = set()
    zones = []

    while hiter < day_utc_end:
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
        zone_code = ht.strftime('%Z')
        if zone_code not in zones_found:
            zones_found.add(zone_code)
            zones.append({
                'name': zone_code,
                'offset': ht.utcoffset().total_seconds(),
                'is_dst': ht.dst().total_seconds() > 0,
            })
        hiter += timedelta(hours=1)

    if not all_offsets:
        all_offsets = [0]
    mean_offset = sorted(all_offsets)[len(all_offsets) // 2]

    return json.jsonify({
        'zone': expose_timezone(zone),
        'zones': zones,
        'row_start': day_utc_start,
        'row': row,
        'next_transition': get_next_transition(away_tz, day_utc_start),
        'offsets': {
            'all': sorted(set(all_offsets)),
            'min': min(all_offsets),
            'max': max(all_offsets),
            'day_start': all_offsets[0],
            'day_end': all_offsets[-1],
            'mean': mean_offset
        },
        'rtclock': get_rt_clock_info(away_tz)
    })


if __name__ == '__main__':
    app.run()
