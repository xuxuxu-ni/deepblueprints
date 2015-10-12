/**
 * Module dependencies
 */

var util = require('util');
var _ = require('lodash');
var actionUtil = require('../actionUtil');


/**
 * Update One Record
 * base on blueprint's update action
 *
 */
module.exports = function updateOneRecord(req, res) {

	// Omit the path parameter `id` from values, unless it was explicitly defined
	// elsewhere (body/query):
	// in deepRouter mode
	var ids = actionUtil.parseParentIdAndChildIdInDeepRouter(req, req.options.model, req.options.alias);
	var pk = ids.childId;
	var model = req.options.association.collection || req.options.association.model;
	if (!model) throw new Error(util.format('No "model" specified in route options.'));
	var Model = req._sails.models[model];
	var values = req.body;
	//sails.log.silly("update:", req.options, "-",req.path, "-", pk, "-", req.options.alias);
	// No matter what, don't allow changing the PK via the update blueprint
	// (you should just drop and re-add the record if that's what you really want)
	if (typeof values[Model.primaryKey] !== 'undefined') {
		sails.log.warn('Cannot change primary key via update blueprint; ignoring value sent for `' + Model.primaryKey + '`');
	}
	delete values[Model.primaryKey];

	// Find and update the targeted record.
	//
	Model.findOne(pk).exec(function found(err, matchingRecord) {

		if (err) return res.serverError(err);
		if (!matchingRecord) return res.notFound();

		Model.update(pk, values).exec(function updated(err, records) {

			// Differentiate between waterline-originated validation errors
			// and serious underlying issues. Respond with badRequest if a
			// validation error is encountered, w/ validation info.
			if (err) return res.negotiate(err);


			// Because this should only update a single record and update
			// returns an array, just use the first item.  If more than one
			// record was returned, something is amiss.
			if (!records || !records.length || records.length > 1) {
				req._sails.log.warn(
					util.format('Unexpected output from `%s.update`.', Model.globalId)
				);
			}else {
        var updatedRecord = records[0];
        var Q = Model.findOne(updatedRecord[Model.primaryKey]);
        Q = actionUtil.populateEach(Q, req);
        Q.exec(function foundAgain(err, populatedRecord) {
          if (err) return res.serverError(err);
          if (!populatedRecord) return res.serverError('Could not find record after updating!');
          res.ok(populatedRecord);
        }); // </foundAgain>
      }

		});// </updated>
	}); // </found>
};
