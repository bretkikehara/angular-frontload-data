var fs = require('fs'),
    util = require('util'),

    Promise = require('bluebird'),
    request = require('request-promise'),
    template = require('lodash.template'),
    beautify = require('js-beautify'),
    colors = require('chalk'),
    symbols = require('log-symbols'),
    beep = require('beepbeep'),

    TEMPLATE_HEADER = 'angular.module(\'<%= name %>\'<%= standalone %>)',
    TEMPLATE_BODY = '.constant(\'<%= key %>\', <%= value %>)',
    TEMPLATE_FOOTER = ';',

    DEFAULT_FILE = './constants.js',
    DEFAULT_MODULE = 'constants',

    MODULE_WRAPPERS = {
        requirejs: {
            header: 'define([\'angular\'], function(angular) { \'use strict\'; return ',
            footer: '});'
        },
        browserify: {
            header: '\'use strict\'; module.exports = '
        },
        iife: {
            header: ';(function (angular, window, document, undefined) { \'use strict\';',
            footer: '})(this.angular, this, this.document);'
        },
        strict: {
            header: '\'use strict\'; '
        }
    };

function formatUri(href) {
    var uri = href.url;

    Object.keys(href.qs).forEach(function(qs, i) {
        uri += (i === 0 ? '?' : '&') + qs + '=' + href.qs[qs];
    });

    return uri;
}

module.exports = function(options, cb) {
    var requests = [],
        consts = [],
        errors = 0,
        logging = util.isString(options.logLevel) && options.logLevel.trim().toLowerCase() || 'default',
        pretty = options.beautify,
        constants = options.constants,
        system = util.isString(options.moduleSystem) && options.moduleSystem.trim().toLowerCase()
            || options.strictMode ? 'strict' : '',
        header = (system ? (MODULE_WRAPPERS[system] && MODULE_WRAPPERS[system].header) || '' : '')
            + ((util.isString(options.templateHeader) && options.templateHeader) || TEMPLATE_HEADER),
        footer = ((util.isString(options.templateFooter) && options.templateFooter) || TEMPLATE_FOOTER)
            + (system ? (MODULE_WRAPPERS[system] && MODULE_WRAPPERS[system].footer) || '' : ''),
        content = template(header)({
            name: options.moduleName || DEFAULT_MODULE,
            standalone: options.moduleDeclaration ? ', []' : ''
        });

    if (!util.isObject(constants)) {
        console.log();
        console.log(colors.yellow(
            symbols.warning,
            !constants ? ' required option constants is missing.' : ' defined contants must be of type object.'
        ));

        beep();

        return;
    }

    Object.keys(constants).forEach(function (constant) {
        consts.push(constant);
        requests.push(request(constants[constant]));
    });

    console.log();

    Promise.settle(requests).then(function(results) {
        var error;

        results.forEach(function(result, i) {
            if (result.isFulfilled()) {
                content += template(options.templateBody || TEMPLATE_BODY)({
                    key: consts[i],
                    value: result.value()
                });

                console.log(colors.green(symbols.success, requests[i].response.request.uri.href));
            } else if (result.isRejected()) {
                ++errors;

                error = result.error();

                if (logging === 'verbose') {
                    console.log(colors.red.underline(formatUri(error.options)));
                    console.log(error.message);
                } else {
                    console.log(colors.red(symbols.error, formatUri(error.options)));
                }
            }
        });

        content += footer;

        if (!(errors && options.allOrNothing)) {
            fs.writeFile(options.filename || DEFAULT_FILE, pretty ? beautify(content, pretty) : content, function(err) {
                if (err) {
                    throw err;
                }

                cb();
            });
        }

        console.log();

        if (errors) {
            beep();
        }
    });
};