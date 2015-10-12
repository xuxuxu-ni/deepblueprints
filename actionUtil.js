/**
 * Module dependencies
 * Most of methods below are base on blueprint's actionUtil
 */

var _ = require('lodash'),
	mergeDefaults = require('merge-defaults'),
	util = require('util');


// Parameter used for jsonp callback is constant, as far as
// blueprints are concerned (for now.)
var JSONP_CALLBACK_PARAM = 'callback';


/**
 * Utility methods used in built-in blueprint actions.
 *
 * @type {Object}
 */
module.exports = {

	/**
	 * Given a Waterline query, populate the appropriate/specified
	 * association attributes and return it so it can be chained
	 * further ( i.e. so you can .exec() it )
	 *
	 * @param  {Query} query         [waterline query object]
	 * @param  {Request} req
	 * @return {Query}
	 */
	populateEach: function (query, associations) {
		for (var i = 0; i < associations.length; i++) {
			query = query.populate(associations[i].alias);
		}
		return query;
	},

	/**
	 * Parse `criteria` for a Waterline `find` or `update` from all
	 * request parameters.
	 *
	 * @param  {Request} req
	 * @return {Object}            the WHERE criteria object
	 */
	parseCriteria: function (req) {

		// Allow customizable blacklist for params NOT to include as criteria.
		req.options.criteria = req.options.criteria || {};
		req.options.criteria.blacklist = req.options.criteria.blacklist || ['limit', 'skip', 'sort', 'populate'];

		// Validate blacklist to provide a more helpful error msg.
		var blacklist = req.options.criteria && req.options.criteria.blacklist;
		if (blacklist && !_.isArray(blacklist)) {
			throw new Error('Invalid `req.options.criteria.blacklist`. Should be an array of strings (parameter names.)');
		}

		// Look for explicitly specified `where` parameter.
		var where = req.params.all().where;

		// If `where` parameter is a string, try to interpret it as JSON
		if (_.isString(where)) {
			where = tryToParseJSON(where);
		}

		// If `where` has not been specified, but other unbound parameter variables
		// **ARE** specified, build the `where` option using them.
		if (!where) {

			// Prune params which aren't fit to be used as `where` criteria
			// to build a proper where query
			where = req.params.all();

			// Omit built-in runtime config (like query modifiers)
			where = _.omit(where, blacklist || ['limit', 'skip', 'sort']);

			// Omit any params w/ undefined values
			where = _.omit(where, function (p) {
				if (_.isUndefined(p)) return true;
			});

			// Omit jsonp callback param (but only if jsonp is enabled)
			var jsonpOpts = req.options.jsonp && !req.isSocket;
			jsonpOpts = _.isObject(jsonpOpts) ? jsonpOpts : {callback: JSONP_CALLBACK_PARAM};
			if (jsonpOpts) {
				where = _.omit(where, [jsonpOpts.callback]);
			}
		}

		// Merge w/ req.options.where and return
		where = _.merge({}, req.options.where || {}, where) || undefined;

		return where;
	},


	/**
	 * Determine the model class to use w/ this blueprint action.
	 * @param  {Request} req
	 * @return {WLCollection}
	 */
	parseModel: function (req) {

		// Ensure a model can be deduced from the request options.
		var model = req.options.model || req.options.controller;
		if (!model) throw new Error(util.format('No "model" specified in route options.'));

		var Model = req._sails.models[model];
		if (!Model) throw new Error(util.format('Invalid route option, "model".\nI don\'t know about any models named: `%s`', model));

		return Model;
	},


	/**
	 * @param  {Request} req
	 */
	parseSort: function (req) {
		return req.param('sort') || req.options.sort || undefined;
	},

	/**
	 * @param  {Request} req
	 */
	parseLimit: function (req) {
		var DEFAULT_LIMIT = sails.config.blueprints.defaultLimit || 30;
		var limit = req.param('limit') || (typeof req.options.limit !== 'undefined' ? req.options.limit : DEFAULT_LIMIT);
		if (limit) {
			limit = +limit;
		}
		return limit;
	},


	/**
	 * @param  {Request} req
	 */
	parseSkip: function (req) {
		var DEFAULT_SKIP = 0;
		var skip = req.param('skip') || (typeof req.options.skip !== 'undefined' ? req.options.skip : DEFAULT_SKIP);
		if (skip) {
			skip = +skip;
		}
		return skip;
	},
	/**
	 * Get parent and child ids
	 * @param req
	 * @param parent
	 * @param child
	 * @returns {boolean|{parentId: string, childId: string}}
	 */
	parseParentIdAndChildIdInDeepRouter: function (req, parent, child) {
		var path = req.path;
		return new RegExp("\/" + parent + "\/([^\/]+)\/" + child + "\/?([^\/]+)?", "gi").test(path) && {
				parentId: RegExp.$1,
				childId: RegExp.$2
			}
	},
	/**
	 * Check the path from root to end of the path by associations in each pair of parent and child
	 * @param next the action that called after finish auth checked
	 * @returns {Function}
	 */
	authChain: function (next) {
		return function (req, res) {
			var cb = function (err) {
				if (err) {
					res.badRequest(err);
				} else {
					next(req, res);
				}
			};
			(function (currPath) {
				var callee = arguments.callee;
				var nextPath = /^(\/deep)?\/([^\/]+)\/([^\/]+)(.+)$/gi.test(currPath) && RegExp.$4;
				var callNextPath = function () {
					if (nextPath) {
						callee.call(this, nextPath);
					} else {
						cb();
					}
				}
				var pair = /^(\/deep)?\/([^\/]+)\/([^\/]+)\/([^\/]+)(\/([^\/]+))?/gi.test(currPath) && {
						parent: RegExp.$2,
						parentId: RegExp.$3,
						child: RegExp.$4,
						childId: RegExp.$6
					}
				//console.log(pair);
				if (pair) {
					if (!pair.childId) {
						return cb();
					}
					var parentModel = sails.models[pair.parent];
					if (!parentModel) return cb(pair.parent + " model not exit");
					parentModel.findOne(pair.parentId).populate(pair.child).exec(function (err, result) {
						//console.log(result);
						if (err || !result) return cb(err || "no parent record");
						var children = result[pair.child];
						if ("length" in children) {
							for (var i = 0; i < children.length; i++) {
								if (children[i].id == pair.childId) {
									return callNextPath();
								}
							}
						} else {
							if (children.id == pair.childId) {
								return callNextPath();
							} else {
								return cb(pair.child + " record not exit");
							}
						}
						return cb("child id " + pair.childId + " not match with parent model id " + pair.parentId);
					})
				} else {
					return cb();
				}
			})(req.path);
		}
	},
	/**
	 * Remove the keys which is an integer, this params probably happen by the "*" path param
	 * @param where
	 */
	filterWrongParams: function (where) {
		for (var k in where) {
			/\d/.test(k) && delete where[k];
		}
	}
};


// TODO:
//
// Replace the following helper with the version in sails.util:

// Attempt to parse JSON
// If the parse fails, return the error object
// If JSON is falsey, return null
// (this is so that it will be ignored if not specified)
function tryToParseJSON(json) {
	if (!_.isString(json)) return null;
	try {
		return JSON.parse(json);
	}
	catch (e) {
		return e;
	}
}
