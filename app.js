'use strict';

// New relic
if (process.env.NODE_ENV === 'production') {
  require('newrelic');
}


var a127 = require('a127-magic');
var express = require('express');
var bodyParser = require('body-parser');
var config = require('config');
var datasource = require('./datasource');
var routeHelper = require('./lib/routeHelper');
var swaggerTools = require('swagger-tools');
var yaml = require('js-yaml');
var fs = require('fs');
var cors = require('cors');
var partialResponseHelper = require('./lib/partialResponseHelper');
var request = require('request');

var app = express();

// Add cors support
app.use(cors());
app.options('*', cors());

// uncomment the following if you need to parse incoming form data
app.use(bodyParser.json());

// Add tc user
// @TODO Move this into it's own module
/* jshint camelcase:false */
function getTcUser(req, res, next) {
  if (req.user) {
    request(config.get('app.tcApi') + '/user/tcid/' + req.user.sub, function (error, response, body) {
      if (!error && response.statusCode === 200) {
        body = JSON.parse(body);

        req.user.tcUser = {
          id: body.uid,
          name: req.user.name,
          handle: body.handle,
          picture: req.user.picture
        };
        next();
      }
      else {
        //TODO: handle error response from tc api
        res.status(503).send('TC API Unavailable');
      }
    });
  } else {
    next();
  }
}

if (!config.has('app.disableAuth') || !config.get('app.disableAuth')) {
  var tcAuth = require('./lib/tc-auth')(config.get('auth0'));
  app.use(tcAuth);
  app.use(getTcUser);
}

var swaggerUi = swaggerTools.middleware.v2.swaggerUi;

// Serve the Swagger documents and Swagger UI
var swaggerDoc = yaml.safeLoad(fs.readFileSync('./api/swagger/swagger.yaml', 'utf8'));
app.use(swaggerUi(swaggerDoc));

// @TODO add try/catch logic
datasource.init(config);

var port;
if (config.has('app.port')) {
  port = config.get('app.port');
} else {
  port = 10010;
}

app.use(partialResponseHelper.parseFields);

// a127 middlewares
app.use(a127.middleware());
// generic error handler
app.use(routeHelper.errorHandler);
// render response data as JSON
app.use(routeHelper.renderJson);

app.listen(port);
console.log('app started at '+port);

module.exports = app;