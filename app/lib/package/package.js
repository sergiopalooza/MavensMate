/**
 * @file Represents a package.xml file
 * @author Joseph Ferraro <@joeferraro>
 */

'use strict';

var Promise = require('bluebird');
var _       = require('lodash');
var swig    = require('swig');
var fs      = require('fs-extra');
var path    = require('path');
var logger  = require('winston');
var config  = require('../../config');
var xmldoc  = require('xmldoc');
var sax     = require('sax');

function Package(project) {
  this.apiVersion = project ? project.config.get('mm_api_version') : config.get('mm_api_version');
  this.contents = {};
}

/**
 * Populates package from an array of documents
 * @param  {Array} documents
 * @return {void}
 */
Package.prototype.initializeFromDocuments = function(documents) {
  var self = this;
  _.each(documents, function(d) {
    var type = d.getServerProperties().type;
    var name = d.getServerProperties().fullName;
    if (!_.has(self.contents, type)) {
      self.contents[type] = [name];
    } else {
      var value = self.contents[type];
      value.push(name);
    }
  });
};

/**
 * Populates package from an existing path on the disk
 * @param  {Array} documents
 * @return {void}
 */
Package.prototype.initializeFromPath = function(packagePath) {
  var self = this;
  return new Promise(function(resolve, reject) {
    self._deserialize(packagePath)
      .then(function(pkg) {
        self.contents = pkg;
        resolve();
      })
      .catch(function(err) {
        reject(err);
      });
  });
};

Package.prototype.writeToDisk = function(location, fileName) {
  if (fileName === undefined) fileName = 'package.xml';
  fs.outputFileSync(path.join(location,fileName), this._serialize());
};

/**
 * Take JS object representation of package.xml, serializes to XML
 * @param  {Object} packageXmlObject
 * @return {String}
 */
Package.prototype._serialize = function() {
  var serialized = swig.renderFile(path.join(__dirname, '..', 'templates', 'package.xml'), {
    obj: this.contents,
    apiVersion: this.apiVersion
  });
  return serialized;
};

/**
 * Parses package.xml to JS object
 * @param {String} path - disk path of package.xml
 * @return {Promise} - resolves to JavaScript object
 */
Package.prototype._deserialize = function(packagePath) {
  var self = this;
  return new Promise(function(resolve, reject) {
    var pkg = {};
    logger.debug('deserializing', packagePath);
    fs.readFile(packagePath, function(err, data) {
      if (err) return reject(err);
      try {
        var parser = sax.parser(true);
        var isValidPackage = true;

        parser.onerror = function(e) {
          logger.debug('Parse error: package.xml', e);
          isValidPackage = false;
          parser.resume();
        };

        parser.onend = function () {
          if (!isValidPackage) return reject(new Error('Could not parse package.xml, invalid XML'));

          var doc = new xmldoc.XmlDocument(data);
          _.each(doc.children, function(type) {
            var metadataType;
            var val = [];

            if (type.name !== 'types') {
              return;
            }
            _.each(type.children, function(node) {
              if (node.name === 'name' && node.val !== undefined) {
                metadataType = node.val;
                return false;
              }
            });
            _.each(type.children, function(node) {
              if (node.name === 'members') {
                if (node.val === '*') {
                  val = '*';
                  return false;
                } else {
                  val.push(node.val);
                }
              }
            });
            pkg[metadataType] = val;
          });

          logger.debug('parsed package.xml to -->'+JSON.stringify(pkg));
          resolve(pkg);
        };

        parser.write(data.toString().trim()).close();

      } catch(e) {
        reject('Could not deserialize package: '+e.message);
      }
    });
  });
};

module.exports = Package;