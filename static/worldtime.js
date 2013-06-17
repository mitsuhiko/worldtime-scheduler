'use strict';

var worldtime = angular.module('worldtime', ['ui.bootstrap', 'ui.sortable']);

(function() {

  function padInt(input, length) {
    var rv = input.toString(10);
    var missing = Math.max(0, length - rv.length);
    var prefix = '';
    for (var i = 0; i < missing; i++)
      prefix += '0';
    return prefix + rv;
  }

  /* non shitty datetime object */
  function DateTime(year, month, day, hour, minute,
                    second, microsecond, offset, zone) {
    this.year = year || 0;
    this.month = month || 0;
    this.day = day || 0;
    this.hour = hour || 0;
    this.minute = minute || 0;
    this.second = second || 0;
    this.microsecond = microsecond || 0;
    this.offset = offset || 0;
    this.zone = zone || null;
  }

  function _parseOffset(offset) {
    if (offset == 'GMT' || offset == 'UTC')
      return 0;
    var sign = offset[0] == '+' ? 1 : offset[0] == '-' ? -1 : 0;
    var h = offset.substr(1, 2);
    var m = offset.substr(3, 2);
    return (parseInt(h, 10) * 60 + parseInt(m, 10)) * 60;
  }

  DateTime.now = function() {
    return DateTime.fromJSDate(new Date());
  };

  DateTime.fromJSDate = function(d) {
    return new DateTime(
      d.getFullYear(),
      d.getMonth() + 1,
      d.getDate(),
      d.getHours(),
      d.getMinutes(),
      d.getSeconds(),
      0,
      d.getTimezoneOffset(),
      d.toString().match(/\((.*)\)$/)[1] || 'local'
    );
  }

  DateTime.parse = function(str) {
    var months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun',
                  'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    var m = str.match(/\w+,\s+(\d+)\s+(\w+)\s+(\d+)\s+(\d+):(\d+):(\d+)(\s+(GMT|[+-]\d+))?(\s+\((\w+)\))/);
    if (!m)
      return null;

    return new DateTime(
      parseInt(m[3], 10),
      parseInt(months.indexOf(m[2].toLowerCase()) + 1) + 1,
      parseInt(m[1], 10),
      parseInt(m[4], 10),
      parseInt(m[5], 10),
      parseInt(m[6], 10),
      0,
      _parseOffset(m[8]),
      m[10] || null
    )
  };

  DateTime.prototype.toDateString = function() {
    return padInt(this.day, 2) + '-' + padInt(this.month, 2) + '-' + this.year;
  };

  function _processCells(cells) {
    for (var i = 0, n = cells.length; i < n; i++) {
      var cell = cells[i];
      cell.slot = DateTime.parse(cell.slot);
    }
    return cells;
  }


  /* controller for the whole table */
  worldtime.controller('TimezoneTableCtrl', function($scope, $http) {
    $scope.rows = [];
    $scope.homeRow = null;
    $scope.city = '';
    $scope.selectedDay = DateTime.now().toDateString();
    $scope.cityFailed = false;

    $('#datepicker').datepicker({
      format: 'dd-mm-yyyy',
      onRender: function(date) {
        var now = new Date();
        if (date.getFullYear() == now.getFullYear() &&
            date.getMonth() == now.getMonth() &&
            date.getDate() == now.getDate())
          return 'today';
        else if (date.valueOf() < now.valueOf())
          return 'past';
        return '';
      }
    }).on('changeDate', function(ev) {
      if (ev.viewMode != 'days')
        return;
      $(this).datepicker('hide');
      $scope.selectedDay = $(this).data('date');
      $scope.$apply();
      $scope.changeDate();
    });

    function _fetchRow(locationKey) {
      var params = {date: $scope.selectedDay, away: locationKey};
      if ($scope.homeRow)
        params.home = $scope.homeRow.locationKey;
      return $http.get($URL_ROOT + 'api/row', {params: params});
    }

    function _makeRow(result) {
      return {
        locationKey: result.city.key,
        city: result.city,
        cells: _processCells(result.row),
        zones: result.zones,
        offsets: result.offsets,
        isHome: $scope.homeRow &&
          $scope.homeRow.locationKey === result.city.key
      };
    }

    function _refreshRow(i, locationKey) {
      _fetchRow(locationKey).then(function(result) {
        $scope.rows[i] = _makeRow(result.data);
      });
    }

    $scope.getRowIndex = function(locationKey) {
      for (var i = 0, n = $scope.rows.length; i < n; i++)
        if ($scope.rows[i].locationKey === locationKey)
          return i;
      return -1;
    };

    $scope.getRow = function(locationKey) {
      return $scope.rows[$scope.getRowIndex(locationKey)] || null;
    };

    $scope.removeRow = function(locationKey) {
      var i = $scope.getRowIndex(locationKey);
      if (i >= 0) {
        $scope.rows.splice(i, 1);
        if ($scope.homeRow.locationKey === locationKey)
          $scope.setAsHome($scope.rows.length > 0 ?
            $scope.rows[0].locationKey : null);
      }
    };

    $scope.changeDate = function() {
      for (var i = 0, n = $scope.rows.length; i < n; i++) {
        var row = $scope.rows[i];
        _refreshRow(i, row.locationKey);
      }
    };

    $scope.addSuggestedRow = function() {
      var that = this;
      return $http.get($URL_ROOT + 'api/find_timezone', {
        params: {q: this.city}
      }).then(function(response) {
        $scope.cityFailed = false;
        var timezone = response.data.result;
        if (!timezone) {
          $scope.cityFailed = true;
          return;
        }

        _fetchRow(timezone.key).then(function(result) {
          that.city = '';
          if ($scope.getRowIndex(timezone.key) >= 0)
            return;
          $scope.rows.push(_makeRow(result.data));
          if (!$scope.homeRow)
            $scope.setAsHome(timezone.key);
        }, function(error) {
          if (error.data.error == 'city_not_found') {
            $scope.cityFailed = true;
          }
        });
      });
    };

    $scope.setAsHome = function(locationKey) {
      var wasNull = $scope.homeRow === null;
      if (!locationKey) {
        $scope.homeRow = null;
        return;
      }

      for (var i = 0, n = $scope.rows.length; i < n; i++) {
        var row = $scope.rows[i];
        if (row.locationKey !== locationKey) {
          row.isHome = false;
        } else {
          row.isHome = true;
          $scope.homeRow = row;
        }
      }

      if (!wasNull)
        for (var i = 0, n = $scope.rows.length; i < n; i++) {
          var row = $scope.rows[i];
          _refreshRow(i, row.locationKey);
        }
    };

    $scope.sortByOffset = function() {
      $scope.sortByFunc(function(a, b) {
        return a.offsets.mean - b.offsets.mean;
      });
    };

    $scope.sortByName = function() {
      $scope.sortByFunc(function(a, b) {
        a = a.city.full_name.toLowerCase();
        b = b.city.full_name.toLowerCase();
        return a == b ? 0 : a < b ? -1 : 1;
      });
    };

    $scope.sortByFunc = function(sortFunc) {
      var copy = $scope.rows.slice(0);
      copy.sort(sortFunc);
      $scope.rows = copy;
    };
  });


  /* controller for the city auto completion */
  worldtime.controller('CityTypeaheadCtrl', function($scope, $http) {
    var LIMIT = 10;

    $scope.getSuggestions = function(input) {
      return $http.get($URL_ROOT + 'api/find_timezones', {
        params: {q: input, limit: LIMIT}
      }).then(function(response) {
        var results = [];
        for (var i = 0, n = response.data.results.length; i < n; i++) {
          var city = response.data.results[i];
          results.push(city.full_name);
        }
        return results;
      });
    };
  });


  worldtime.filter('padint', function() {
    return function(input, length) {
      return padInt(input, length);
    };
  });

  worldtime.filter('describezone', function() {
    return function(zone) {
      var rv = 'UTC';
      var hours = zone.offset / 3600;
      if (hours != 0)
        rv += ' ' + (hours > 0 ? '+' : '') + hours + ' hours';
      if (zone.is_dst)
        rv += ' (DST observed)';
      return rv;
    };
  });

  worldtime.filter('describeoffset', function() {
    return function(offsets) {
      var hours = offsets.mean / 3600;
      return hours == 0 ? 'Your home' : (hours > 0 ? '+' : '') + hours + ' hours from home';
    };
  });

  worldtime.filter('offsetformat', function() {
    return function(offsets) {
      var hours = offsets.mean / 3600;
      return (hours > 0 ? '+' : '') + hours;
    };
  });
})();
