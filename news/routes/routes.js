const { fail } = require("assert");
const { response } = require("express");
const { request } = require("http");
const path = require("path");
const stemmer = require("stemmer");
const LivyClient =  require('node-livy-client');


const AWS = require("aws-sdk");
const { DynamoDB, QueryCommand } = require("@aws-sdk/client-dynamodb-v2-node");
AWS.config.update({ region: "us-east-1" });

const client = new AWS.DynamoDB();
var docClient = new AWS.DynamoDB.DocumentClient();

// gets main news search page and recommendations
var get_main_page = function (req, res) {
  var current_username = "raymons";
  var article_recommendation_arr = [];

  var params = {
    TableName: "ArticleRecommendations",
    ExpressionAttributeValues: {
      ":u": current_username,
    },
    KeyConditionExpression: "username = :u",
  };

  var params_lookup = {
    TableName: "UsersTable",
    ExpressionAttributeValues: {
      ":u": current_username,
    },
    KeyConditionExpression: "username = :u",
  };

  all_results = [];
  // query the recommendations
  docClient.query(params, function (err, data) {
    if (!err) {
      // get recommendation items
      for (var i = 0; i < data.Items.length; i++) {
        all_results.push(data.Items[i]);
      }

      var recommendation_article_promises = [];
      // make an array of promises to look up in the article likes table to get likes
      for (var i = 0; i < all_results.length; i++) {
        var params_like = {
          TableName: "ArticleLikeTable",
          ExpressionAttributeValues: {
            ":l": all_results[i].link,
          },
          KeyConditionExpression: "link = :l",
        };
        article_promise = docClient.query(params_like).promise();
        recommendation_article_promises.push(article_promise);
      }

      // execute all the promises
      Promise.all(recommendation_article_promises)
        .then((like_data) => {
          items_arr = [];
          // get the items from the article like table
          for (var i = 0; i < like_data.length; i++) {
            if (like_data[i].Items.length > 0) {
              items_arr.push(like_data[i].Items);
            }
          }

          // create a new mapping for link -> article attributes
          article_mapping = new Map();
          for (var i = 0; i < items_arr.length; i++) {
            article_mapping.set(items_arr[i][0].link, { likes: items_arr[i][0].likes, headline: "", description: "", category: "", author: "", date: "" });
          }

          // update the mapping with all the article data
          for (var i = 0; i < all_results.length; i++) {
            object_mapping = article_mapping.get(all_results[i].link);
            object_mapping["headline"] = all_results[i].headline;
            object_mapping["description"] = all_results[i].description;
            object_mapping["category"] = all_results[i].category;
            object_mapping["author"] = all_results[i].author;
            object_mapping["date"] = all_results[i].date;
            article_mapping.set(all_results[i].link, object_mapping);
          }

          // loop through the map and get all the article attributes in a new JSON
          final_results_articles = [];
          for (var [key, value] of article_mapping) {
            new_object = { link: key, headline: value["headline"], description: value["description"], category: value["category"], author: value["author"], date: value["date"], likes: value["likes"] };
            final_results_articles.push(new_object);
          }

          docClient.query(params_lookup, function (err, data) {
            if (data) {
              liked_news_arr = [];
              if (data.Items[0].likednewsarticles) {
                for (var i = 0; i < data.Items[0].likednewsarticles.values.length; i++) {
                  if (data.Items[0].likednewsarticles.values[i] !== "none" || data.Items[0].likednewsarticles.values[i] !== "") {
                    liked_news_arr.push(data.Items[0].likednewsarticles.values[i]);
                  }
                }
                liked_article_section_promise_arr = [];
                for (var i = 0; i < liked_news_arr.length; i++) {
                  var params_like = {
                    TableName: "ArticleLikeTable",
                    ExpressionAttributeValues: {
                      ":l": liked_news_arr[i],
                    },
                    KeyConditionExpression: "link = :l",
                  };
                  liked_article_section_promise = docClient.query(params_like).promise();
                  liked_article_section_promise_arr.push(liked_article_section_promise);
                }
                Promise.all(liked_article_section_promise_arr)
                  .then((all_liked_news_articles_case) => {
                    liked_items_arr = [];
                    for (var i = 0; i < all_liked_news_articles_case.length; i++) {
                      liked_items_arr.push(all_liked_news_articles_case[i].Items[0]);
                    }
                    res.render("news_search_main.ejs", { recommendationData: final_results_articles, likedArticleData: liked_items_arr });
                  })
                  .catch(function (err) {
                    console.log(err);
                  });
              } else {
                res.render("news_search_main.ejs", { recommendationData: final_results_articles, likedArticleData: null });
              }
            }
          });

          // render page
        })
        .catch(function (err) {
          console.log(err);
        });
    }
  });
};





// used for news search
var search_the_terms = function (req, res) {
  var docClient = new AWS.DynamoDB.DocumentClient();

  var keywords = req.query.keyword;
  var keywords_arr = keywords.split(" ");
  var normalized_keywords = [];

  for (var i = 0; i < keywords_arr.length; i++) {
    normalized_keywords.push(stemmer(keywords_arr[i].toLowerCase()));
  }

  var promise_arr = [];
  // make a promise for each keyword
  for (var i = 0; i < normalized_keywords.length; i++) {
    var params = {
      TableName: "NewsSearch",
      ExpressionAttributeValues: {
        ":k": normalized_keywords[i],
      },
      KeyConditionExpression: "keyword = :k",
    };

    var keyword_promise = docClient.query(params).promise();
    promise_arr.push(keyword_promise);
  }
  // execute all the keyword promises
  Promise.all(promise_arr)
    .then(
      (successful_case) => {
        items_arr = [];
        // get the items
        for (var i = 0; i < successful_case.length; i++) {
          if (successful_case[i].Items.length > 0) {
            for (var j = 0; j < successful_case[i].Items.length; j++) {
              items_arr.push(successful_case[i].Items[j]);
            }
          }
        }

        // create a mapping
        var search_mapping = new Map();
        for (var i = 0; i < items_arr.length; i++) {
          // if the map has the item, increment the amount of keywords the article is linked to
          if (search_mapping.has(items_arr[i].link)) {
            mapping_object = search_mapping.get(items_arr[i].link);
            mapping_object["keyword_linked"] = mapping_object["keyword_linked"] + 1;
            search_mapping.set(items_arr[i].link, mapping_object);
          } else {
            // create the item with default settings
            search_mapping.set(items_arr[i].link, {
              keyword_linked: 1,
              article_weight: 0.0,
              headline: items_arr[i].headline,
              author: items_arr[i].author,
              date: items_arr[i].date,
              description: items_arr[i].description,
              category: items_arr[i].category,
            });
          }
        }

        var params = {
          TableName: "ArticleTable",
          ExpressionAttributeValues: {
            ":u": "raymons",
          },
          KeyConditionExpression: "username = :u",
        };

        // make a promise to look up the user
        var user_article_promise = docClient.query(params).promise();
        var user_promise_arr = [user_article_promise];

        // execute user look up promise
        Promise.all(user_promise_arr)
          .then(
            (user_successful_case) => {
              user_articles_items = [];
              // get the data
              for (var i = 0; i < user_successful_case[0].Items.length; i++) {
                user_articles_items.push(user_successful_case[0].Items[i]);
              }

              // get the weights
              for (var i = 0; i < user_articles_items.length; i++) {
                if (search_mapping.has(user_articles_items[i].link)) {
                  if (user_articles_items[i].weight !== undefined && user_articles_items[i].headline !== undefined && user_articles_items[i].author !== undefined && user_articles_items[i].date !== undefined && user_articles_items[i].description !== undefined) {
                    user_weight_mapping_object = search_mapping.get(user_articles_items[i].link);
                    user_weight_mapping_object["article_weight"] = user_articles_items[i].weight;
                    user_weight_mapping_object["headline"] = user_articles_items[i].headline;
                    user_weight_mapping_object["author"] = user_articles_items[i].author;
                    user_weight_mapping_object["date"] = user_articles_items[i].date;
                    user_weight_mapping_object["description"] = user_articles_items[i].description;
                    user_weight_mapping_object["category"] = user_articles_items[i].category;
                    search_mapping.set(user_articles_items[i].link, user_weight_mapping_object);
                  }
                }
              }

              // get likes
              article_like_mapping = new Map();
              article_search_container = [];
              article_like_promise_arr = [];
              for (var [key, value] of search_mapping) {
                article_like_mapping.set(key, 0);
                article_search_container.push(key);
              }

              // promises for getting article likes
              for (var i = 0; i < article_search_container.length; i++) {
                var like_params = {
                  TableName: "ArticleLikeTable",
                  ExpressionAttributeValues: {
                    ":l": article_search_container[i],
                  },
                  KeyConditionExpression: "link = :l",
                };

                var article_like_promise = docClient.query(like_params).promise();
                article_like_promise_arr.push(article_like_promise);
              }

              // execute all article like query promises
              Promise.all(article_like_promise_arr)
                .then(
                  (like_successful_case) => {
                    like_article_items_arr = [];
                    for (var i = 0; i < like_successful_case.length; i++) {
                      current_mapping_object = search_mapping.get(like_successful_case[i].Items[0].link);
                      current_mapping_object["likes"] = like_successful_case[i].Items[0].likes;
                      search_mapping.set(like_successful_case[i].Items[0].link, current_mapping_object);
                    }

                    // add all finalized objects to array
                    map_object_arr = [];
                    for (var [key, value] of search_mapping) {
                      new_object = {
                        link: key,
                        keyword_count: value["keyword_linked"],
                        weight: value["article_weight"],
                        headline: value["headline"],
                        author: value["author"],
                        date: value["date"],
                        description: value["description"],
                        category: value["category"],
                        likes: value["likes"],
                      };
                      map_object_arr.push(new_object);
                    }

                    // sort by keywords matched, then by weight
                    map_object_arr.sort(function (item_one, item_two) {
                      return item_two["keyword_count"] - item_one["keyword_count"] || item_two["weight"] - item_one["weight"];
                    });

                    // render the search results page
                    res.render("news_results.ejs", {
                      search: req.query.keyword,
                      results: map_object_arr,
                    });
                  },
                  (like_failure_case) => {
                    console.log("This is like_failure_case error: " + like_failure_case);
                  }
                )
                .catch(function (err) {
                  console.log("This is article like error: " + err);
                });
            },
            (user_failure_case) => {
              console.log("This is the message from the fail case of the /newsresults user promise: " + user_failure_case);
            }
          )
          .catch(function (error) {
            console.log("This is the catch function error in user /newsarticleresults: " + error);
          });
      },
      (failure_case) => {
        console.log("This is the error message for the first outer promise in /newsresults: " + failure_case);
      }
    )
    .catch(function (error) {
      console.log("This is the catch error function in the first outer promise: " + error);
    });
};

// used to add a new article to user liked articles
var user_liking_article = function (req, res) {
  var article_link = req.body.article_link;
  article_link = article_link.replace(/\s/g, "");

  var current_username = req.body.current_name;
  var docClient = new AWS.DynamoDB.DocumentClient();

  params = {
    TableName: "UsersTable",
    Key: {
      username: current_username,
    },
    AttributeUpdates: {
      likednewsarticles: {
        Action: "ADD",
        Value: docClient.createSet([article_link]),
      },
    },
  };

  docClient.update(params, function (err, data) {
    if (err) {
      console.log(err);
    }
  });
};

// used to delete an article to user liked articles
var user_disliking_article = function (req, res) {
  var article_link = req.body.article_link;
  article_link = article_link.replace(/\s/g, "");
  var current_username = req.body.current_name;
  var docClient = new AWS.DynamoDB.DocumentClient();

  params = {
    TableName: "UsersTable",
    Key: {
      username: current_username,
    },
    AttributeUpdates: {
      likednewsarticles: {
        Action: "DELETE",
        Value: docClient.createSet([article_link]),
      },
    },
  };

  docClient.update(params, function (err, data) {
    if (err) {
      console.log(err);
    }
  });
};

// used to get a user's liked news articles
var user_lookup = function (req, res) {
  var current_username = "raymons";
  var response = [];

  var params = {
    TableName: "UsersTable",
    ExpressionAttributeValues: {
      ":u": current_username,
    },
    KeyConditionExpression: "username = :u",
  };

  docClient.query(params, function (err, data) {
    if (data && typeof data.Items[0].likednewsarticles !== "undefined") {
      for (var i = 0; i < data.Items[0].likednewsarticles.values.length; i++) {
        response.push(data.Items[0].likednewsarticles.values[i]);
      }
      res.send(JSON.stringify(response));
    }
  });
};

// used to update the likes in the article like table
var article_update_likes = function (req, res) {
  var article_link = req.body.article_link;
  article_link = article_link.replace(/\s/g, "");

  var params = {
    TableName: "ArticleLikeTable",
    Key: {
      link: article_link,
    },
    UpdateExpression: "set likes = likes + :l",
    ExpressionAttributeValues: {
      ":l": 1,
    },
    ReturnValues: "UPDATED_NEW",
  };

  docClient.update(params, function (err, data) {
    if (err) {
      console.log(err);
    }
  });
};

// used to update the dislikes in the article like table
var article_update_dislikes = function (req, res) {
  var article_link = req.body.article_link;
  article_link = article_link.replace(/\s/g, "");

  var params = {
    TableName: "ArticleLikeTable",
    Key: {
      link: article_link,
    },
    UpdateExpression: "set likes = likes - :l",
    ExpressionAttributeValues: {
      ":l": 1,
    },
    ReturnValues: "UPDATED_NEW",
  };

  docClient.update(params, function (err, data) {
    if (err) {
      console.log(err);
    }
  });
};

var get_blank = function (req, res) {
		

	
	res.render("blank.ejs")
}

var run_spark_algorithm = function (req, res) {
	var exec = require("child_process").exec;
	exec('mvn exec:java@livy', function(error, stdOut, stdErr) {
		console.log("Running")
		console.log(error)
			console.log(stdOut)
		console.log(stdErr)
	
	});
}

var update_interest = function (req, res) {
  var current_username = req.body.current_name;
  var interests_name = req.body.interests_name;
	console.log(current_username + " " + interests_name)

  var docClient = new AWS.DynamoDB.DocumentClient();

  params = {
    TableName: "UsersTable",
    Key: {
      username: current_username,
    },
    AttributeUpdates: {
      interests: {
        Action: "ADD",
        Value: docClient.createSet([interests_name]),
      },
    },
  };
  docClient.update(params, function (err, data) {
    if (err) {
      console.log(err);
    }
  });
}


var routes = {
  search_for_articles: search_the_terms,
  get_main: get_main_page,
  liking_article_user: user_liking_article,
  disliking_article_user: user_disliking_article,
  user_table_search: user_lookup,
  liking_article_count: article_update_likes,
  disliking_article_count: article_update_dislikes,
  blank: get_blank,
  spark: run_spark_algorithm,
  update_interests: update_interest
};

module.exports = routes;
