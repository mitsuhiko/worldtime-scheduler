import os
from flask import json


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


def main():
    convert_countries()
    convert_cities()


if __name__ == '__main__':
    main()
