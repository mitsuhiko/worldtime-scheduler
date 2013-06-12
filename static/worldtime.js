'use strict';

var worldtime = angular.module('worldtime', ['ui.bootstrap']);

(function() {

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

  DateTime.parse = function(str) {
    var months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun',
                  'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    var m = str.match(/\w+,\s+(\d+)\s+(\w+)\s+(\d+)\s+(\d+):(\d+):(\d+)(\s+(GMT|[+-]\d+))?(\s+\((\w+)\))/);
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

    function _fetchRow(locationKey) {
      var params = {date: '2013-10-27', away: locationKey};
      if ($scope.homeRow)
        params.home = $scope.homeRow.locationKey;
      return $http.get($URL_ROOT + 'api/row', {params: params});
    }

    function _makeRow(result) {
      return {
        locationKey: result.away_city.key,
        city: result.away_city,
        cells: _processCells(result.row),
        isHome: $scope.homeRow &&
          $scope.homeRow.locationKey === result.away_city.key
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

    $scope.addRow = function(timezone) {
      _fetchRow(timezone.key).then(function(result) {
        if ($scope.getRowIndex(timezone.key) >= 0)
          return;
        $scope.rows.push(_makeRow(result.data));
        if (!$scope.homeRow)
          $scope.setAsHome(timezone.key);
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
  });


  /* controller for the city auto completion */
  worldtime.controller('CityTypeaheadCtrl', function($scope, $http) {
    var LIMIT = 10;

    $scope.failed = false;

    $scope.addSuggestedRow = function() {
      var self = this;
      return $http.get($URL_ROOT + 'api/find_timezone', {
        params: {q: this.timezone}
      }).then(function(response) {
        if (response.data.result) {
          self.timezone = '';
          $scope.addRow(response.data.result);
        } else {
          $scope.failed = true;
        }
      });
    };

    $scope.getSuggestions = function(input) {
      $scope.failed = false;
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
      var rv = input.toString(10);
      var missing = Math.max(0, length - rv.length);
      var prefix = '';
      for (var i = 0; i < missing; i++)
        prefix += '0';
      return prefix + rv;
    };
  });

})();
