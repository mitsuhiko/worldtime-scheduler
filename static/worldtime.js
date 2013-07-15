'use strict';

var worldtime = angular
  .module('worldtime', ['ui.bootstrap', 'ui.sortable'])
  .config(function($locationProvider) {
    $locationProvider.html5Mode(true);
  });

(function() {

  function padInt(input, length) {
    var rv = input.toString(10);
    var missing = Math.max(0, length - rv.length);
    var prefix = '';
    for (var i = 0; i < missing; i++)
      prefix += '0';
    return prefix + rv;
  }

  function RealTimeClock(clockInfo) {
    this.offset = clockInfo.offset;
    if (clockInfo.next_offset) {
      this.nextOffset = clockInfo.next_offset;
      this.activates = new Date(clockInfo.activates).getTime() / 1000;
    } else {
      this.nextOffset = null;
      this.activates = null;
    }
    this.isActive = true;
    this.refresh();
  }

  RealTimeClock.prototype.refresh = function() {
    var d = new Date();

    /* transition kicked in */
    if (this.activates != null &&
        d.getTime() / 1000 >= this.activates) {
      this.offset = this.nextOffset;
      this.nextOffset = null;
      this.activates = null;
    }

    d.setUTCSeconds(d.getUTCSeconds() + this.offset);

    var oldHour = this.hour;
    var oldMinute = this.minute;
    this.hour = d.getUTCHours();
    this.minute = d.getUTCMinutes();
    return oldHour != this.hour || oldMinute != this.minute;
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
    var m = str.match(/\w+,\s+(\d+)\s+(\w+)\s+(\d+)\s+(\d+):(\d+):(\d+)(\s+(GMT|[+-]\d+))?(\s+\((\w+)\))?/);
    if (!m)
      return null;

    return new DateTime(
      parseInt(m[3], 10),
      parseInt(months.indexOf(m[2].toLowerCase()) + 1),
      parseInt(m[1], 10),
      parseInt(m[4], 10),
      parseInt(m[5], 10),
      parseInt(m[6], 10),
      0,
      _parseOffset(m[8]),
      m[10] || null
    )
  };

  DateTime.prototype.getMonthName = function() {
    var months = ['Januar', 'February', 'March', 'April', 'May', 'June',
                  'July', 'August', 'September', 'October', 'November', 'December'];
    return months[this.month - 1];
  };

  DateTime.prototype.toDateString = function() {
    return padInt(this.day, 2) + '-' + padInt(this.month, 2) + '-' + this.year;
  };

  DateTime.prototype.toString = function() {
    var rv = this.getMonthName() + ' ' + this.day + ', ' + this.year + ' ' +
      padInt(this.hour, 2) + ':' + padInt(this.minute, 2);
    if (this.zone)
      rv += ' (' + this.zone + ')';
    return rv;
  };

  function _processCells(cells) {
    for (var i = 0, n = cells.length; i < n; i++) {
      var cell = cells[i];
      cell.slot = DateTime.parse(cell.slot);
      cell.utc = DateTime.parse(cell.utc);
      cell.idx = i;
    }
    return cells;
  }


  /* controller for the whole table */
  worldtime.controller('TimezoneTableCtrl', function($scope, $http, $location, $q) {
    $scope.rows = [];
    $scope.homeRow = null;
    $scope.zone = '';
    $scope.selectedDay = DateTime.now().toDateString();
    $scope.zoneFailed = false;

    /* current clock */
    window.setInterval(function() {
      if ($scope.updateRealTimeClocks())
        $scope.$apply();
    }, 1000);

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
      var ti = result.next_transition || null;
      if (ti)
        ti.activates = DateTime.parse(ti.activates);
      return {
        locationKey: result.zone.key,
        zone: result.zone,
        cells: _processCells(result.row),
        zones: result.zones,
        nextTransition: ti,
        offsets: result.offsets,
        realTimeClock: new RealTimeClock(result.rtclock),
        isHome: $scope.homeRow &&
          $scope.homeRow.locationKey === result.zone.key
      };
    }

    function _refreshRow(i, locationKey) {
      _fetchRow(locationKey).then(function(result) {
        $scope.rows[i] = _makeRow(result.data);
        $scope.updateRealTimeClocks();
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
      if (this.zone == '') {
        $scope.zoneFailed = false;
        return;
      }
      return $http.get($URL_ROOT + 'api/find_timezone', {
        params: {q: this.zone}
      }).then(function(response) {
        $scope.zoneFailed = false;
        var timezone = response.data.result;
        if (!timezone) {
          $scope.zoneFailed = true;
          return;
        }

        _fetchRow(timezone.key).then(function(result) {
          that.zone = '';
          if ($scope.getRowIndex(timezone.key) >= 0)
            return;
          $scope.rows.push(_makeRow(result.data));
          if (!$scope.homeRow)
            $scope.setAsHome(timezone.key);
        }, function(error) {
          $scope.zoneFailed = false;
          if (error.data.error == 'zone_not_found') {
            $scope.zoneFailed = true;
          }
        });
      });
    };

    $scope.addTimezoneRow = function(key) {
      var deferred = $q.defer();
      $http.get($URL_ROOT + 'api/find_timezone', {
        params: {q: key}
      }).then(function(response) {
        var timezone = response.data.result;
        if (!timezone) {
          deferred.reject('Timezone not found');
          return;
        }
        _fetchRow(timezone.key).then(function(result) {
          if ($scope.getRowIndex(timezone.key) >= 0) {
            deferred.reject('Row already added before');
            return;
          }
          var row = _makeRow(result.data);
          $scope.rows.push(row);
          if (!$scope.homeRow)
            $scope.setAsHome(timezone.key);
          deferred.resolve(row);
        });
      });
      return deferred.promise;
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
        a = a.zone.full_name.toLowerCase();
        b = b.zone.full_name.toLowerCase();
        return a == b ? 0 : a < b ? -1 : 1;
      });
    };

    $scope.sortByFunc = function(sortFunc) {
      var copy = $scope.rows.slice(0);
      copy.sort(sortFunc);
      $scope.rows = copy;
    };

    $scope.updateRealTimeClocks = function() {
      var isToday = $scope.selectedDay == DateTime.now().toDateString();
      var anythingChanged = false;
      for (var i = 0; i < $scope.rows.length; i++) {
        var row = $scope.rows[i];
        row.realTimeClock.isActive = isToday;
        if (isToday) {
          var rv = row.realTimeClock.refresh();
          anythingChanged = anythingChanged || rv;
        }
      }
      return anythingChanged;
    };

    $scope.linkToThisTable = function() {
    };

    /* url support */

    $scope.$watchCollection('rows', function() {
      var buf = [];
      for (var i = 0; i < $scope.rows.length; i++) {
        var row = $scope.rows[i];
        var item = row.locationKey.replace('/', '::');
        if (row.isHome)
          item += '!';
        buf.push(item);
      }
      if (buf.length > 0)
        $location.search({tz: buf.join(',')});
      else
        $location.search({});
    });

    $scope.syncWithURL = function() {
      var allZones = [];
      var homeZone = null;
      var zones = ($location.search().tz || '').split(',');
      if (zones.length == 1 && zones[0] == '')
        zones = [];
      for (var i = 0; i < zones.length; i++) {
        var zoneName = zones[i].replace('::', '/');
        if (zoneName[zoneName.length - 1] == '!') {
          zoneName = zoneName.substr(0, zoneName.length - 1);
          homeZone = zoneName;
        }
        allZones.push(zoneName);
      }

      if ($scope.rows.length > 0 || allZones.length == 0)
        return;

      if (!homeZone)
        homeZone = allZones[0];

      $scope.addTimezoneRow(homeZone).then(function() {
        var promises = [];
        for (var i = 0; i < allZones.length; i++) {
          var zone = allZones[i];
          if (zone == homeZone)
            continue;
          promises.push($scope.addTimezoneRow(zone));
        }
        $q.all(promises).then(function() {
          $scope.sortByFunc(function(a, b) {
            var idx1 = allZones.indexOf(a.locationKey);
            var idx2 = allZones.indexOf(b.locationKey);
            return idx1 - idx2;
          });
        });
      });
    };

    $scope._location = $location;
    $scope.$watch('_location.search()', $scope.syncWithURL);
    $scope.syncWithURL();
  });


  /* controller for the zone auto completion */
  worldtime.controller('ZoneTypeaheadCtrl', function($scope, $http) {
    var LIMIT = 10;

    $scope.getSuggestions = function(input) {
      return $http.get($URL_ROOT + 'api/find_timezones', {
        params: {q: input, limit: LIMIT}
      }).then(function(response) {
        var results = [];
        for (var i = 0, n = response.data.results.length; i < n; i++) {
          var zone = response.data.results[i];
          results.push(zone.full_name);
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

  worldtime.filter('datetimeformat', function() {
    return function(dt) {
      return dt.toString();
    };
  });

  worldtime.filter('timezonetransitionformat', function() {
    return function(ti) {
      if (!ti)
        return '';
      var d = ti.activates;
      var hours = (ti.to_offset - ti.from_offset) / 3600;
      var diff = (hours > 0 ? '+' : '') + hours + ' hour' + (hours != 1 ? 's' : '');
      return ti.from_tz + ' to ' + ti.to_tz + ' (' + diff + ') on ' + d.toString();
    };
  });
})();
