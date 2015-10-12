sails-hook-deepblueprints is sails [hook](http://sailsjs.org/documentation/concepts/extending-sails/hooks), provide more than two layer level route which is provided by [blueprints](http://sailsjs.org/documentation/reference/blueprint-api?q=blueprint-routes) in sails [native hook](https://github.com/balderdashy/sails/tree/master/lib/hooks/blueprints)  

## Features

 * generate more than two layer route like `/deep/company/1/team/2/project/3`
 * validate association between each layer in route path
    like: if team id 2 is not belong to company id 1, then will return 400 error

## Installation
install in sails project

`npm install sails-hook-deepblueprints --save`

## Usage

 * put config `deepBluePrint : true` into controller which one you want it have deep blueprint routes

    ```javascript
    /**
     * CompanyController
     *
     * @description :: Server-side logic for managing companies
     * @help        :: See http://sailsjs.org/#!/documentation/concepts/Controllers
     */
    
    module.exports = {
      _config : {
        deepBluePrint : true
      }
    };
    ```
 * after sails start, there will auto generate deep-blueprints' routes with the prefix in the path: /deep

## Example

[here](https://github.com/hcnode/deep-blueprints-sample) is complete sample

here are 4 models below, and they have One-to-many associations of one and the next one.

```javascript
/**
* Company.js
*/
module.exports = {

  attributes: {
    name : "string",
    team:{
      collection: 'team'
    }
  }
};
```

```javascript
/**
* Team.js
*/
module.exports = {

  attributes: {
    name : "string",
    project : {
      collection: 'project'
    }
  }
};

```


```javascript
/**
* Project.js
*/

module.exports = {

  attributes: {
    name : "string",
    todolist : {
      collection: 'todolist'
    }
  }
};

```

```javascript
/**
* Todolist.js
*/

module.exports = {

  attributes: {
    name : "string"
  }
};
```

after sails start, there will generate the deep-blueprints routes(these can see in the sails logs when log level is silly):

```bash
silly: Binding RESTful deepblueprint/shadow routes for model+controller: company
silly: Binding RESTful association deepblueprint `team` for company
silly: Binding route ::  post /deep/company/:parentid/team/:id? (ACTION: company/_config)
silly: Binding route ::  post /deep/company/:parentid/team/:id? (ACTION: company/_config)
silly: Binding route ::  delete /deep/company/:parentid/team/:id? (ACTION: company/_config)
silly: Binding route ::  delete /deep/company/:parentid/team/:id? (ACTION: company/_config)
silly: Binding route ::  put /deep/company/:parentid/team/:id? (ACTION: company/_config)
silly: Binding route ::  put /deep/company/:parentid/team/:id? (ACTION: company/_config)
silly: Binding route ::  get /deep/company/:parentid/team/:id? (ACTION: company/_config)
silly: Binding route ::  get /deep/company/:parentid/team/:id? (ACTION: company/_config)
silly: Binding RESTful association deepblueprint `project` for team
silly: Binding route ::  post /deep/company/*/team/:parentid/project/:id? (ACTION: company/_config)
silly: Binding route ::  post /deep/company/*/team/:parentid/project/:id? (ACTION: company/_config)
silly: Binding route ::  delete /deep/company/*/team/:parentid/project/:id? (ACTION: company/_config)
silly: Binding route ::  delete /deep/company/*/team/:parentid/project/:id? (ACTION: company/_config)
silly: Binding route ::  put /deep/company/*/team/:parentid/project/:id? (ACTION: company/_config)
silly: Binding route ::  put /deep/company/*/team/:parentid/project/:id? (ACTION: company/_config)
silly: Binding route ::  get /deep/company/*/team/:parentid/project/:id? (ACTION: company/_config)
silly: Binding route ::  get /deep/company/*/team/:parentid/project/:id? (ACTION: company/_config)
silly: Binding RESTful association deepblueprint `todolist` for project
silly: Binding route ::  post /deep/company/*/team/*/project/:parentid/todolist/:id? (ACTION: company/_config)
silly: Binding route ::  post /deep/company/*/team/*/project/:parentid/todolist/:id? (ACTION: company/_config)
silly: Binding route ::  delete /deep/company/*/team/*/project/:parentid/todolist/:id? (ACTION: company/_config)
silly: Binding route ::  delete /deep/company/*/team/*/project/:parentid/todolist/:id? (ACTION: company/_config)
silly: Binding route ::  put /deep/company/*/team/*/project/:parentid/todolist/:id? (ACTION: company/_config)
silly: Binding route ::  put /deep/company/*/team/*/project/:parentid/todolist/:id? (ACTION: company/_config)
silly: Binding route ::  get /deep/company/*/team/*/project/:parentid/todolist/:id? (ACTION: company/_config)
silly: Binding route ::  get /deep/company/*/team/*/project/:parentid/todolist/:id? (ACTION: company/_config)
```

when the request path match these routes, deep-blueprints will take the data processing job and in it is way, mostly like the blueprints do:

```
add: post %s/:parentid/%s/:id?
remove: delete %s/:parentid/%s/:id?
update: put %s/:parentid/%s/:id?
populate: get %s/:parentid/%s/:id?
```

## Notice
 * the association attribute name in the model should EXACTLY same as the associate model's name, like :
 
```javascript
/**
* Company.js
*/
module.exports = {

    attributes: {
     name : "string",
     team:{ // team is OK, teams is NOT OK
       collection: 'team'
     }
    }
};
```

```javascript
/**
* Team.js
*/
module.exports = {

    attributes: {
     name : "string"
    }
};
```
 
 * because deep-blueprints will find the associations and create the route, so avoid circle routes, DON'T DEFINE TWO-WAY associations in two models like:

```javascript
/**
* Company.js
*/
module.exports = {

  attributes: {
    name : "string",
    team:{
      collection: 'team'
    }
  }
};
```

```javascript
/**
* Team.js
*/
module.exports = {

  attributes: {
    name : "string",
    company : {
        model : 'company'
    },
    project : {
      collection: 'project'
    }
  }
};

```

## Test
in [deep-blueprints sample](https://github.com/hcnode/deep-blueprints-sample), clone repo and run npm test