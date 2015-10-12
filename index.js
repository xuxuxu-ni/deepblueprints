/**
 * Created by harry on 15/5/22.
 */

var _ = require('lodash')
	, util = require('util')
	, pluralize = require('pluralize')
	, actionUtil = require('./actionUtil')
	, DeepBlueprintController = {
		update  : actionUtil.authChain(require('./actions/update'))
		, populate: actionUtil.authChain(require('./actions/populate'))
		, add     : actionUtil.authChain(require('./actions/add'))
		, remove  : actionUtil.authChain(require('./actions/remove'))
	}
	, STRINGFILE = require('sails-stringfile');

module.exports = function (sails) {
	var hook;
	return {
		initialize: function(cb) {
			hook = this;
			var eventsToWaitFor = [];

			eventsToWaitFor.push('router:after');
			if (sails.hooks.policies) {
				eventsToWaitFor.push('hook:policies:bound');
			}
			if (sails.hooks.orm) {
				eventsToWaitFor.push('hook:orm:loaded');
			}
			if (sails.hooks.controllers) {
				eventsToWaitFor.push('hook:controllers:loaded');
			}
			sails.after(eventsToWaitFor, hook.bindShadowRoutes);
			return cb();
		},

		bindShadowRoutes : function() {
      function _getMiddlewareForShadowRoute (controllerId, blueprintId) {
				// Allow custom actions defined in controller to override blueprint actions.
				var middleware = sails.middleware.controllers[controllerId][blueprintId.toLowerCase()] || hook.middleware[blueprintId.toLowerCase()];
				return middleware.slice(0, middleware.length - 1); // remove the blueprint default action
			}
			_.each(sails.middleware.controllers, function eachController (controller, controllerId) {
				if ( !_.isObject(controller) || _.isArray(controller) ) return;

				// Get globalId for use in errors/warnings
				var globalId = sails.controllers[controllerId].globalId;

				// Determine blueprint configuration for this controller
				var config = _.merge({},
					sails.config.deepblueprints,
					controller._config || {});

				// Validate blueprint config for this controller
				if ( config.prefix ) {
					if ( !_(config.prefix).isString() ) {
						sails.after('lifted', function () {
							sails.log.blank();
							sails.log.warn(util.format('Ignoring invalid blueprint prefix configured for controller `%s`.', globalId));
							sails.log.warn('`prefix` should be a string, e.g. "/api/v1".');
							STRINGFILE.logMoreInfoLink(STRINGFILE.get('links.docs.config.blueprints'), sails.log.warn);
						});
						return;
					}
					if ( !config.prefix.match(/^\//) ) {
						var originalPrefix = config.prefix;
						sails.after('lifted', function () {
							sails.log.blank();
							sails.log.warn(util.format('Invalid blueprint prefix ("%s") configured for controller `%s` (should start with a `/`).', originalPrefix, globalId));
							sails.log.warn(util.format('For now, assuming you meant:  "%s".', config.prefix));
							STRINGFILE.logMoreInfoLink(STRINGFILE.get('links.docs.config.blueprints'), sails.log.warn);
						});

						config.prefix = '/' + config.prefix;
					}
				}

				// Validate REST route blueprint config for this controller
				if ( config.restPrefix ) {
					if ( !_(config.restPrefix).isString() ) {
						sails.after('lifted', function () {
							sails.log.blank();
							sails.log.warn(util.format('Ignoring invalid blueprint rest prefix configured for controller `%s`.', globalId));
							sails.log.warn('`restPrefix` should be a string, e.g. "/api/v1".');
							STRINGFILE.logMoreInfoLink(STRINGFILE.get('links.docs.config.blueprints'), sails.log.warn);
						});
						return;
					}
					if ( !config.restPrefix.match(/^\//) ) {
						var originalRestPrefix = config.restPrefix;
						sails.after('lifted', function () {
							sails.log.blank();
							sails.log.warn(util.format('Invalid blueprint restPrefix ("%s") configured for controller `%s` (should start with a `/`).', originalRestPrefix, globalId));
							sails.log.warn(util.format('For now, assuming you meant:  "%s".', config.restPrefix));
							STRINGFILE.logMoreInfoLink(STRINGFILE.get('links.docs.config.blueprints'), sails.log.warn);
						});

						config.restPrefix = '/' + config.restPrefix;
					}
				}
				// use /deep as root path
				config.prefix = config.prefix || "";
				config.restPrefix = config.restPrefix || "";
				config.prefix = "/deep" + config.prefix;
				// Determine base route
				var baseRoute = config.prefix + '/' + controllerId;

				// Determine base route for RESTful service
				// Note that restPrefix will always start with /
				var baseRestRoute = config.prefix + config.restPrefix + '/' + controllerId;

				if (config.pluralize) {
					baseRoute = pluralize(baseRoute);
					baseRestRoute = pluralize(baseRestRoute);
				}
				var _getAction = _.partial(_getMiddlewareForShadowRoute, controllerId);

				// Build route options for blueprint
				var routeOpts = config;

				// Determine the model connected to this controller either by:
				// -> explicit configuration
				// -> on the controller
				// -> on the routes config
				// -> or implicitly by globalId
				// -> or implicitly by controller id
				var routeConfig = sails.router.explicitRoutes[controllerId] || {};
				var modelFromGlobalId = sails.util.findWhere(sails.models, {globalId: globalId});
				var modelId = config.model || routeConfig.model || (modelFromGlobalId && modelFromGlobalId.identity) || controllerId;

				// If the orm hook is enabled, it has already been loaded by this time,
				// so just double-check to see if the attached model exists in `sails.models`
				// before trying to attach any CRUD blueprint actions to the controller.

				if (sails.hooks.orm && sails.models && sails.models[modelId]) {

					// If a model with matching identity exists,
					// extend route options with the id of the model.
					routeOpts.model = modelId;

					var Model = sails.models[modelId];

					// Mix in the known associations for this model to the route options.
					routeOpts = _.merge({ associations: _.cloneDeep(Model.associations) }, routeOpts);

					// Bind "rest" blueprint/shadow routes
					if ( config.deepBluePrint ) {
						sails.log.silly('Binding RESTful deepblueprint/shadow routes for model+controller:',controllerId);
						(function(baseRestRoute, Model, controllerId, model){
							//sails.log.silly("controllerId:" + controllerId);
							var _bindRoute = function (path, action, options) {
								options = options || routeOpts;
								options = _.extend({}, options, {action: action});
								// bind deepblueprint and default actions
								sails.router.bind ( path, [_getAction(action), DeepBlueprintController[action]], null, options);
							};
							var _opts = _.extend({}, routeOpts, {
								model: model,
								controller : controllerId,
								associations : sails.models[model].associations
							});
							var callee = arguments.callee;
							_(Model.associations).forEach(function (association) {
								var alias = association.alias;
								var opts = _.merge({}, _opts, { alias: alias, association:association});
								var child = association.collection || association.model;
								var optWithChildAssociations = _.extend({}, opts, {associations : sails.models[child].associations});
								var _getAssocRoute = _.partialRight(util.format, baseRestRoute, alias);
								// child model and path and controllerId
								var childModel = sails.models[child];
								var childBaseRestRoute = baseRestRoute + "/*/" + alias;
								var childControllerId = alias;

								sails.log.silly('Binding RESTful association deepblueprint `' + alias + '` for', controllerId);
								_bindRoute( _getAssocRoute('post %s/:parentid/%s/:id?'),     'add', opts );
								_bindRoute( _getAssocRoute('delete %s/:parentid/%s/:id?'),   'remove', opts );
								_bindRoute( _getAssocRoute('put %s/:parentid/%s/:id?'),   'update', optWithChildAssociations);
								_bindRoute( _getAssocRoute('get %s/:parentid/%s/:id?'), 'populate', optWithChildAssociations);

								//sails.log.silly(_.extend({},opts,  {associations : sails.models[child].associations}));
								// { alias: 'creator', type: 'subModel', model: 'people' },
								// call Recursive
								callee.call(this, childBaseRestRoute, childModel, childControllerId, child);
							});

						})(baseRestRoute, Model, controllerId, config.model);
					}
				}
			});
		}
	};
}
module.exports.controllers  = DeepBlueprintController;
