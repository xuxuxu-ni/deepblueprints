/**
 * Module dependencies
 */
var _ = require('lodash');
var actionUtil = require('../actionUtil');
var q = require("q");


/**
 * Remove a member from an association
 *
 * @param {Integer|String} parentid  - the unique id of the parent record
 * @param {Integer|String} id  - the unique id of the child record to remove
 *
 * @option {String} model  - the identity of the model
 * @option {String} alias  - the name of the association attribute (aka "alias")
 */

module.exports = function remove(req, res) {

	// Ensure a model and alias can be deduced from the request.
	var Model = actionUtil.parseModel(req);
	var relation = req.options.alias;
	if (!relation) {
		return res.serverError(new Error('Missing required route option, `req.options.alias`.'));
	}


	var ids = actionUtil.parseParentIdAndChildIdInDeepRouter(req, req.options.model, relation);
	var parentPk = ids.parentId;
	var childPk = ids.childId;
	var finalCall = function (err) {
		if(err) return res.serverError(err);

		return res.ok();
	};
	(function (Model, relation, parentPk, childPk, cb) {
		sails.log.silly("remove:", "-", relation, "-", parentPk,"-",childPk);
		var callee = arguments.callee;
		var callNextChild = function (ParentModel, childRelation, parentPk, childrenIds, _cb) {
			for(var i=0;i<childrenIds.length;i++){
				callee.call(this, ParentModel, childRelation, parentPk, childrenIds[i], _cb);
			}
		};
		// Get the model class of the child in order to figure out the name of
		// the primary key attribute.
		var associationAttr = _.findWhere(Model.associations, {alias: relation});
		var ChildModel = sails.models[associationAttr.collection || associationAttr.model];


		if (!parentPk || !childPk) {
			return res.serverError('Missing required child or parent PK.');
		}
		Model
			.findOne(parentPk).exec(function found(err, parentRecord) {
				if (err) return cb(err);
				if (!parentRecord) return cb("not found");
				if (!parentRecord[relation]) return cb("not found");

				if(parentRecord[relation].remove) {
					parentRecord[relation].remove(childPk);
				}else{
					// TODO Unknow error when call save
					delete parentRecord[relation];
				}
				parentRecord.save(function (err, result) {
					if (err) return cb(err);
					// through all associations and remove or destroy one by one
					var childAssociations = ChildModel.associations;
					actionUtil.populateEach(ChildModel.findOne(childPk), childAssociations).exec(function (err, childRecord) {
						if(err) return cb(err);
						var promises = [];
						for(var i=0;i<childAssociations.length;i++){
							var grandChidRelation = childAssociations[i].alias;
							var grandChildModel = childAssociations[i].model || childAssociations[i].collection;
							if(childAssociations[i].model || !sails.models[grandChildModel].destroyWhenRemoved) continue;
							if(childRecord[grandChidRelation]) {
								var grandChildrenIds = "length" in childRecord[grandChidRelation] ? _.pluck(childRecord[grandChidRelation], "id")
									: [childRecord[grandChidRelation].id];
								if(grandChildrenIds.length == 0) continue;
								var _cb;
								promises.push((function () {
									var defer = q.defer();
									_cb = function (result) {
										if(result){
											defer.reject(result);
										}else {
											defer.resolve();
										}
									};
									return defer.promise;
								})());
								callNextChild(ChildModel, grandChidRelation, childPk, grandChildrenIds, _cb);
							}
						}
						if(promises.length > 0){
							q.all(promises).then(function (results) {
								ChildModel.destroy(childRecord.id, function (err) {
									cb(err);
								});
							}, function (err) {
								cb(err);
							})
						}else{
							ChildModel.destroy(childRecord.id, function (err) {
								cb(err);
							});
						}
					});
				});
			});

	})(Model, relation, parentPk, childPk, finalCall);
};
