/**
 * Module dependencies
 */
var _ = require('lodash');
var async = require('async');
var actionUtil = require('../actionUtil');

/**
 * Add Record To Collection, base on blueprint's add action
 *
 * post  /:modelIdentity/:id/:collectionAttr/:childid
 *  *    /:modelIdentity/:id/:collectionAttr/add/:childid
 */

module.exports = function addToCollection(req, res) {

	// Ensure a model and alias can be deduced from the request.
	var Model = actionUtil.parseModel(req);
	var relation = req.options.alias;
	if (!relation) {
		return res.serverError(new Error('Missing required route option, `req.options.alias`.'));
	}

	// Get the model class of the child in order to figure out the name of
	// the primary key attribute.
	var associationAttr = _.findWhere(Model.associations, {alias: relation});
	var ChildModel = sails.models[associationAttr.collection || associationAttr.model];
	if (!ChildModel) {
		return res.badRequest("Can not add record to a attribute which is not collection");
	}
	var childPkAttr = ChildModel.primaryKey;

	var gNewChildRecord;

	var ids = actionUtil.parseParentIdAndChildIdInDeepRouter(req, req.options.model, relation);
	var parentPk = ids.parentId;
	var supposedChildPk = ids.childId;
	var child = req.body;
	//sails.log.silly("add:", req.options, "-",req.path, "-", parentPk,"-",supposedChildPk, "-", child);
	if (supposedChildPk) {
		return res.badRequest("Record only can add to collection or a model");
	}

	if (!child) {
		res.badRequest('You must specify the record to add (either the primary key of an existing record to link, or a new object without a primary key which will be used to create a record then link it.)');
	}


	var createdChild = false;
	async.auto({

			// Look up the parent record
			parent: function (cb) {
				Model.findOne(parentPk).exec(function foundParent(err, parentRecord) {
					if (err) return cb(err);
					if (!parentRecord) return cb({status: 404});
					if (!parentRecord[relation]) return cb({status: 404});
					cb(null, parentRecord);
				});
			},

			// If a primary key was specified in the `child` object we parsed
			// from the request, look it up to make sure it exists.  Send back its primary key value.
			// This is here because, although you can do this with `.save()`, you can't actually
			// get ahold of the created child record data, unless you create it first.
			actualChildPkValue: ['parent', function (cb) {

				// Below, we use the primary key attribute to pull out the primary key value
				// (which might not have existed until now, if the .add() resulted in a `create()`)

				// If the primary key was specified for the child record, we should try to find
				// it before we create it.
				if (child[childPkAttr]) {
					ChildModel.findOne(child[childPkAttr]).exec(function foundChild(err, childRecord) {
						if (err) return cb(err);
						// Didn't find it?  Then try creating it.
						if (!childRecord) {
							return createChild();
						}
						// Otherwise use the one we found.
						return cb(null, childRecord[childPkAttr]);
					});
				}
				// Otherwise, it must be referring to a new thing, so create it.
				else {
					return createChild();
				}

				// Create a new instance and send out any required pubsub messages.
				function createChild() {
					ChildModel.create(child).exec(function createdNewChild(err, newChildRecord) {
						if (err) return cb(err);
						createdChild = true;
						gNewChildRecord = newChildRecord;
						return cb(null, newChildRecord[childPkAttr]);
					});
				}

			}],

			// Add the child record to the parent's collection
			add: ['parent', 'actualChildPkValue', function (cb, async_data) {
				try {
					// `collection` is the parent record's collection we
					// want to add the child to.
					var collection = async_data.parent[relation];
					collection.add(async_data.actualChildPkValue);
					return cb();
				}
					// Ignore `insert` errors
				catch (err) {
					// if (err && err.type !== 'insert') {
					if (err) {
						return cb(err);
					}
					// else if (err) {
					//   // if we made it here, then this child record is already
					//   // associated with the collection.  But we do nothing:
					//   // `add` is idempotent.
					// }

					return cb();
				}
			}]
		},

		// Save the parent record
		function readyToSave(err, async_data) {

			if (err) return res.negotiate(err);
			//console.log("async_data.parent:", async_data.parent);
			async_data.parent.save(function saved(err, newRecord) {

				// Ignore `insert` errors for duplicate adds
				// (but keep in mind, we should not publishAdd if this is the case...)
				var isDuplicateInsertError = (err && typeof err === 'object' && err.length && err[0] && err[0].type === 'insert');
				if (err && !isDuplicateInsertError) return res.negotiate(err);

				res.ok(newRecord);
			});

		}); // </async.auto>
};
