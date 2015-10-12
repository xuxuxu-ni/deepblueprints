/**
 * Module dependencies
 */
var util = require('util'),
	actionUtil = require('../actionUtil');


/**
 * Populate (or "expand") an association
 * base on blueprint's population action
 *
 * get /model/:parentid/relation
 * get /model/:parentid/relation/:id
 */

module.exports = function expand(req, res) {

	var Model = actionUtil.parseModel(req);
	var relation = req.options.alias;
	if (!relation || !Model) return res.serverError();

	// Allow customizable blacklist for params.
	req.options.criteria = req.options.criteria || {};
	req.options.criteria.blacklist = req.options.criteria.blacklist || ['limit', 'skip', 'sort', 'id', 'parentid'];

	var ids = actionUtil.parseParentIdAndChildIdInDeepRouter(req, req.options.model, relation);
	var parentPk = ids.parentId;
	var childPk = ids.childId;

	var child = req.options.association.collection || req.options.association.model;
	ChildModel = sails.models[child];

	//sails.log.silly("populate:", req.options, "-",req.path, "-",parentPk, "-", relation);
	var childPkAttr = Model.primaryKey;
	var childWhere = {};
	if (childPk) childWhere[childPkAttr] = [childPk];
	var where = childPk ? childWhere : actionUtil.parseCriteria(req);
	actionUtil.filterWrongParams(where);
	var populate = sails.util.objCompact({
		where: where,
		skip: actionUtil.parseSkip(req),
		limit: actionUtil.parseLimit(req),
		sort: actionUtil.parseSort(req)
	});
  if(childPk) {
    var Q = ChildModel.findOne(childPk);
    Q = actionUtil.populateEach(Q, ChildModel.associations);

    Q.exec(function found(err, populatedRecord) {
      if (err) return res.serverError(err);
      if (!populatedRecord) return res.serverError('Could not find record!');
      res.ok(populatedRecord);
    });
  }else {
    Model
      .findOne(parentPk)
      .populate(relation, populate)
      .exec(function found(err, matchingRecord) {
        if (err) return res.serverError(err);
        1
        if (!matchingRecord) return res.notFound('No record found with the specified id.');
        if (!matchingRecord[relation]) return res.notFound(util.format('Specified record (%s) is missing relation `%s`', parentPk, relation));

        var where = {};
        var children = matchingRecord[relation];
        where[childPkAttr] = "length" in children ? _.pluck(children, childPkAttr) : [children[childPkAttr]];

        // if childPk exists, then find this one record, or find all records of array
        var Q = ChildModel.find(where);
        Q = actionUtil.populateEach(Q, ChildModel.associations);

        Q.exec(function found(err, populatedRecord) {
          if (err) return res.serverError(err);
          if (!populatedRecord) return res.serverError('Could not find record!');
          res.ok(populatedRecord);
        });
      });
  }
};
