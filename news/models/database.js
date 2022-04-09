var AWS = require('aws-sdk');
AWS.config.update({region:'us-east-1'});
var db = new AWS.DynamoDB();

var database_lookup_news_search = function(search_term, callback) {
  var params = {
    KeyConditions: {
      keyword: {
        ComparisonOperator: 'EQ',
        AttributeValueList: [{ S: search_term }]
      }
    },
    TableName: 'NewsSearch',
    AttributesToGet: ['keyword', "link"]
  };

  db.query(params, function(err, data) {
    if (err) {
      callback(err, null)
    } else if (data) {
      callback(err, data.Items)
    }
  })
}


var database_article_weights = function(current_username) {
  console.log("Looking up username: " + current_username);

  var params = {
    KeyConditions: {
      username: {
        ComparisonOperator: 'EQ',
        AttributeValueList: [{ S: current_username }]
      }
    },
    TableName: 'ArticleTable',
      AttributesToGet: ['username', "link", "author", "categroy", "date", "description", "headline"]
  };

  db.query(params, function(err, data) {
    if (err) {
      callback(err, null)
    } else if (data) {
      callback(err, data.Items)
    }
  })
}

var database = {
  db_news_search: database_lookup_news_search,
  db_article_weights: database_article_weights
};

module.exports = database;