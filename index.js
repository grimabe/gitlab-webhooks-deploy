'use strict';

const Hapi = require('hapi');
const server = new Hapi.Server();
const fs = require('fs');
const conf = JSON.parse(fs.readFileSync('hooks.conf.json', 'utf8'));
const Boom = require('boom');
const exec = require('child_process').exec;
const async = require('async');
const Joi = require('joi');
const path = require('path');

const buildSchema = Joi.object().keys({
  ref: Joi.string().required(),
  build_status: Joi.string().required(),
  repository: Joi.object().keys({
    name: Joi.string().required()
  })
});

server.connection({
  host: 'localhost',
  port: 8000
});

server.route({
  method: 'POST',
  path: '/deploy',
  handler: function(request, reply) {
    async.auto({
        getData: function(endGetData) {
          Joi.validate(request.payload, buildSchema, {
            allowUnknown: true
          }, (err, value) => {
            if (err) {
              return endGetData(Boom.badRequest(), null);
            }
            return endGetData(null, value);
          });
        },
        getConfig: ['getData', (endGetConfig, results) => {
          var project = conf[results.getData.repository.name];
          if (!project) {
            return endGetConfig(Boom.badRequest('no project found for name:' + results.repository.name));
          }
          if (project.branch !== results.getData.ref) {
            return endGetConfig(Boom.badRequest('matching branch not found'));
          }
          if (results.getData.build_status !== 'success') {
            return endGetConfig(Boom.badRequest('build not succeeded'));
          }
          return endGetConfig(null, project);
        }],
        checkScriptExist: ['getConfig', (endCheckFileExist, results) => {
          var project = results.getConfig;
          fs.access(project.script, fs.F_OK, (err) => {
            if (err) {
              return endCheckFileExist(Boom.badRequest("script not found"));
            }
            return endCheckFileExist(null);
          });
        }],
        checkScriptExecutable: ['checkScriptExist', (endCheckScriptExecutable, results) => {
          var project = results.getConfig;
          fs.access(project.script, fs.X_OK, (err) => {
            if (err) {
              return endCheckScriptExecutable(Boom.badRequest("script not executable"));
            }
            return endCheckScriptExecutable(null);
          });
        }],
        executeScript: ['checkScriptExecutable', (endExecuteScript, results) => {
          var project = results.getConfig;
          const child = exec('sh ' + project.script,
            (error, stdout, stderr) => {
              if (error !== null) {
                return endExecuteScript(Boom.badRequest("script execution failed"));
              }
              return endExecuteScript(null);
            });
        }],
      },
      function(err, results) {
        if (err) {
          console.log(err);
          return reply(err);
        }
        console.log('executing script at '+results.getConfig.script);
        return reply();
      });
  }
});

// Start the server
server.start((err) => {

  if (err) {
    throw err;
  }
  console.log('Server running at:', server.info.uri);
});
