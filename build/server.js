// Generated by CoffeeScript 1.12.2
(function() {
  var Cheerio, Dgram, Fs, Http, OS, Opt, argv, count, data, e, queues, requestServer, server, updateLaps, updateRecords, updateServerInfo, updateServerPlayers;

  Opt = require('optimist');

  Dgram = require('dgram');

  Http = require('http');

  Cheerio = require('cheerio');

  OS = require('os');

  Fs = require('fs');

  argv = Opt.demand(['h']).alias('p', 'port').alias('f', 'file').alias('h', 'host')["default"]('p', 12000)["default"]('f', OS.tmpdir() + '/ac.json').argv;

  try {
    Fs.accessSync(argv.f, Fs.R_OK);
    data = JSON.parse(Fs.readFileSync(argv.f));
  } catch (error) {
    e = error;
    data = {
      name: null,
      passward: false,
      status: false,
      update: null,
      online: 0,
      maxOnline: 0,
      track: null,
      cars: [],
      onlines: {},
      records: {},
      players: [],
      laps: {}
    };
  }

  server = Dgram.createSocket('udp4');

  server.on('error', console.log);

  queues = [];

  server.on('message', function(buff, rinfo) {
    var carId, carModel, driverGUID, driverName, id, lapTime, len1, len2, len3;
    id = buff.readUInt8(0);
    console.log("received " + id);
    if (id === 51 || id === 52) {
      len1 = buff.readUInt8(1);
      driverName = buff.toString(2, 2 + len1, 'utf8');
      len2 = buff.readUInt8(2 + len1);
      driverGUID = len2 === 0 ? null : buff.toString(2 + len1 + 1, 3 + len1 + len2, 'utf8');
      carId = buff.readUInt8(3 + len1 + len2);
      len3 = buff.readUInt8(4 + len1 + len2);
      carModel = buff.toString(4 + len1 + len2 + 1, 5 + len1 + len2 + len3, 'ascii');
      if (id === 51) {
        data.onlines[carId] = [driverGUID, driverName, carModel];
      } else {
        if (data.onlines[carId] != null) {
          delete data.onlines[carId];
        }
      }
      queues.push(true);
    }
    if (id === 73) {
      carId = buff.readUInt8(1);
      lapTime = buff.readUInt32LE(2);
      console.log(carId + "@" + lapTime);
      return queues.push([carId, lapTime]);
    }
  });

  requestServer = function(type, cb) {
    return Http.get({
      hostname: argv.h,
      port: 8081,
      path: '/' + type + '|' + Date.now(),
      timeout: 5000
    }, function(res) {
      var content;
      if (res.statusCode !== 200) {
        data.status = false;
        return;
      }
      content = '';
      res.on('data', function(chunk) {
        return content += chunk;
      });
      return res.on('end', function() {
        return cb(content);
      });
    }).on('error', function(e) {
      return data.status = false;
    });
  };

  updateLaps = function(carId) {
    var found, i, lap, len, p, player, ref;
    if (data.onlines[carId] == null) {
      return;
    }
    player = data.onlines[carId];
    found = false;
    ref = data.laps;
    for (i = 0, len = ref.length; i < len; i++) {
      p = ref[i];
      if (p[0] === player[0] && p[1] === player[1]) {
        found = true;
        p[3] += 1;
        if (p[2][data.track] != null) {
          p[2][data.track] += 1;
        } else {
          p[2][data.track] = 1;
        }
      }
    }
    if (!found) {
      lap = [player[0], player[1], {}, 1];
      lap[2][data.track] = 1;
      data.laps.push(lap);
    }
    return data.laps = data.laps.sort(function(a, b) {
      return b[3] - a[3];
    });
  };

  updateRecords = function(carId, lapTime) {
    var found, i, len, p, player, records, ref;
    if (data.onlines[carId] == null) {
      return;
    }
    player = data.onlines[carId];
    found = false;
    if (data.records[data.track] != null) {
      ref = data.records[data.track];
      for (i = 0, len = ref.length; i < len; i++) {
        p = ref[i];
        if (p[0] === player[0] && p[1] === player[1]) {
          found = true;
          if (lapTime < p[3]) {
            p[3] = lapTime;
          }
        }
      }
    }
    if (!found) {
      if (data.records[data.track] == null) {
        data.records[data.track] = [];
      }
      data.records[data.track].push([player[0], player[1], player[2], lapTime]);
    }
    records = data.records.sort(function(a, b) {
      return a[3] - b[3];
    });
    return data.records = records.slice(0, 30);
  };

  updateServerInfo = function() {
    return requestServer('INFO', function(content) {
      var struct;
      struct = JSON.parse(content);
      data.name = struct.name;
      data.passward = struct.pass;
      data.online = struct.clients;
      data.maxOnline = struct.maxclients;
      data.track = struct.track;
      data.cars = struct.cars;
      data.status = true;
      return queues.push(true);
    });
  };

  updateServerPlayers = function() {
    return requestServer('ENTRY', function(content) {
      var $, table;
      data.players = [];
      data.onlines = {};
      $ = Cheerio.load(content);
      table = ($('table')).first();
      $('tr', table).each(function(index) {
        var guid, id, vals;
        if (index === 0) {
          return;
        }
        vals = [];
        $('td', this).each(function() {
          return vals.push(($(this)).html());
        });
        if (vals[4] !== 'DC') {
          data.players.push(vals);
          id = parseInt(vals[0]);
          guid = vals[9].length > 0 ? vals[9] : null;
          return data.onlines[id] = [guid, vals[1], vals[2]];
        }
      });
      return queues.push(true);
    });
  };

  count = 0;

  setInterval(function() {
    var carId, item, lapTime, update;
    update = false;
    if (count === 100 || count === 0) {
      count = 0;
      updateServerInfo();
      updateServerPlayers();
    }
    while (item = queues.shift()) {
      if (item === true) {
        update = true;
        continue;
      }
      carId = item[0], lapTime = item[1];
      updateLaps(carId);
      updateRecords(carId, lapTime);
      update = true;
    }
    if (update) {
      Fs.writeFileSync(argv.f, JSON.stringify(data));
    }
    return count += 1;
  }, 100);

  server.bind(argv.p);

  console.log(argv.f);

}).call(this);
