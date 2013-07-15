import os
import pytz
from datetime import datetime
from flask import json
from babel import dates


os.chdir(os.path.abspath(os.path.dirname(__file__)))


def convert_countries():
    countries = {}

    with open('raw/countryInfo.txt', 'rb') as f:
        for line in f:
            line = line.decode('utf-8').strip().split('\t')
            if not line or line[0][:1] == '#':
                continue

            country_code = line[0]
            country = line[4]
            capital = line[5]
            countries[country_code] = {
                'name': country,
                'capital': capital,
                'code': country_code
            }

    with open('countries.json', 'w') as f:
        json.dump({'countries': countries}, f, indent=2)


def convert_cities():
    cities = {}

    with open('raw/cities15000.txt', 'rb') as f:
        for line in f:
            line = line.decode('utf-8').strip().split('\t')
            if not line:
                continue

            main_name = line[1]
            country = line[8]
            state = country == 'US' and line[10] or None
            population = int(line[14])
            timezone = line[17]

            display_name = main_name
            if state is not None:
                display_name += ' (%s)' % state

            city_key = ('%s/%s%s' % (country, main_name,
                state and '/' + state or '')).replace(' ', '_')
            old_city = cities.get(city_key)

            # There was already a city with that name, let the one
            # with the higher population win.
            if old_city is not None:
                if population < old_city['population']:
                    continue

            cities[city_key] = {
                'country': country,
                'state': state,
                'name': main_name,
                'display_name': display_name,
                'timezone': timezone,
                'population': population,
            }

    with open('cities.json', 'w') as f:
        json.dump({'cities': cities}, f, indent=2)


def convert_timezones():
    timezones = {}
    found = set()

    today = datetime.utcnow()

    for zone_name in pytz.all_timezones:
        tzinfo = dates.get_timezone(zone_name)
        if tzinfo is None:
            continue
        short_name = zone_name

        try:
            transition = dates.get_next_timezone_transition(tzinfo, today)
        except TypeError:
            continue
        if transition is None:
            key = tzinfo.tzname(today)
            has_dst = False
            name = dates.get_timezone_name(tzinfo)
        else:
            from_tz = transition.from_tz
            to_tz = transition.to_tz
            from_tzinfo = transition.from_tzinfo
            to_tzinfo = transition.to_tzinfo
            if transition.from_tzinfo.localize(today).dst():
                dst_tz = from_tz
                std_tz = to_tz
                dst_tzinfo = from_tzinfo
                std_tzinfo = to_tzinfo
            else:
                dst_tz = to_tz
                std_tz = from_tz
                dst_tzinfo = to_tzinfo
                std_tzinfo = from_tzinfo
            key = '%s/%s' % (std_tz, dst_tz)
            name = dates.get_timezone_name(std_tzinfo, zone_variation='generic')

        if name in found:
            continue
        found.add(name)

        timezones[short_name] = {
            'short': key,
            'name': name
        }

    with open('timezones.json', 'w') as f:
        json.dump({'timezones': timezones}, f, indent=2)


def main():
    convert_countries()
    convert_cities()
    convert_timezones()


if __name__ == '__main__':
    main()
