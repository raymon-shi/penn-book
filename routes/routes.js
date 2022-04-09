const { fail } = require("assert");
const { response } = require("express");
const { request } = require("http");
const path = require("path");
const stemmer = require("stemmer");
const LivyClient =  require('node-livy-client');
var db = require('../models/database.js');

// for hashing password
var shajs = require('sha.js')


const AWS = require("aws-sdk");
const { DynamoDB, QueryCommand } = require("@aws-sdk/client-dynamodb-v2-node");
AWS.config.update({ region: "us-east-1" });

var docClient = new AWS.DynamoDB.DocumentClient();

// gets main news search page and recommendations
var get_main_page = function (req, res) {
	if (req.session.user == null || req.session.user.length == 0) {
        res.redirect('/');
    } 
	////console.log(req + " HREQ")
	//console.log(req.session + " HELLO")
  var current_username = req.session.user;

  var article_recommendation_arr = [];
//console.log('here')
  var params = {
    TableName: "ArticleRecommendations",
    ExpressionAttributeValues: {
      ":u": current_username,
    },
    KeyConditionExpression: "username = :u",
  };

  var params_lookup = {
    TableName: "users",
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
//console.log('first promise')

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
//console.log('second promise')
                Promise.all(liked_article_section_promise_arr)
                  .then((all_liked_news_articles_case) => {
                    liked_items_arr = [];
                    for (var i = 0; i < all_liked_news_articles_case.length; i++) {
					  if (all_liked_news_articles_case[i].Items[0] != undefined) {
						                 liked_items_arr.push(all_liked_news_articles_case[i].Items[0]);

					}
                    }
if (final_results_articles[0] == undefined) {
	final_results_articles = null;
}
if (liked_items_arr[0] == undefined || liked_items_arr[0] == null) {
	liked_items_arr = null;
}

                    res.render("news_search_main.ejs", { recommendationData: final_results_articles, likedArticleData: liked_items_arr });
                  })
                  .catch(function (err) {
                    //console.log(err);
                  });
              } else {
	if (final_results_articles[0] == undefined) {
	final_results_articles = null;
}
                res.render("news_search_main.ejs", { recommendationData: final_results_articles, likedArticleData: null });
              }
            }
          });

          // render page
        })
        .catch(function (err) {
          //console.log(err);
        });
    }
  });
};





// used for news search
var search_the_terms = function (req, res) {
	    if (req.session.user == null || req.session.user.length == 0) {
        res.redirect('/');
    } 
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
		var current_user = req.session.user;
        var params = {
          TableName: "ArticleTable",
          ExpressionAttributeValues: {
            ":u": current_user,
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
                    //console.log("This is like_failure_case error: " + like_failure_case);
                  }
                )
                .catch(function (err) {
                  //console.log("This is article like error: " + err);
                });
            },
            (user_failure_case) => {
              //console.log("This is the message from the fail case of the /newsresults user promise: " + user_failure_case);
            }
          )
          .catch(function (error) {
            //console.log("This is the catch function error in user /newsarticleresults: " + error);
          });
      },
      (failure_case) => {
        //console.log("This is the error message for the first outer promise in /newsresults: " + failure_case);
      }
    )
    .catch(function (error) {
      //console.log("This is the catch error function in the first outer promise: " + error);
    });
};

// used to add a new article to user liked articles
var user_liking_article = function (req, res) {
	    if (req.session.user == null || req.session.user.length == 0) {
        res.redirect('/');
    } 
  var article_link = req.body.article_link;
  article_link = article_link.replace(/\s/g, "");

  var current_username = req.body.current_name;
  var docClient = new AWS.DynamoDB.DocumentClient();

  params = {
    TableName: "users",
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
      //console.log(err);
    }
  });
};

// used to delete an article to user liked articles
var user_disliking_article = function (req, res) {
	    if (req.session.user == null || req.session.user.length == 0) {
        res.redirect('/');
    } 
  var article_link = req.body.article_link;
  article_link = article_link.replace(/\s/g, "");
  var current_username = req.body.current_name;
  var docClient = new AWS.DynamoDB.DocumentClient();

  params = {
    TableName: "users",
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
      //console.log(err);
    }
  });
};

// used to get a user's liked news articles
var user_lookup = function (req, res) {
	    if (req.session.user == null || req.session.user.length == 0) {
        res.redirect('/');
    } 
  var current_username = req.session.user;
  var response = [];

  var params = {
    TableName: "users",
    ExpressionAttributeValues: {
      ":u": current_username,
    },
    KeyConditionExpression: "username = :u",
  };

  docClient.query(params, function (err, data) {
    if (data && typeof data.Items[0].likednewsarticles !== "undefined") {
      for (var i = 0; i < data.Items[0].likednewsarticles.values.length; i++) {
		if (data.Items[0].likednewsarticles.values[i] !== "none") {
			response.push(data.Items[0].likednewsarticles.values[i]);

		}
      }
      res.send(JSON.stringify(response));
    }
  });
};

// used to update the likes in the article like table
var article_update_likes = function (req, res) {
	    if (req.session.user == null || req.session.user.length == 0) {
        res.redirect('/');
    } 
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
      //console.log(err);
    }
  });
};

// used to update the dislikes in the article like table
var article_update_dislikes = function (req, res) {
	    if (req.session.user == null || req.session.user.length == 0) {
        res.redirect('/');
    } 
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
      //console.log(err);
    }
  });
};

var get_blank = function (req, res) {
		

	
	res.render("blank.ejs")
}

var run_spark_algorithm = function (req, res) {
	    if (req.session.user == null || req.session.user.length == 0) {
        res.redirect('/');
    } 
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
	//console.log(current_username + " " + interests_name)

  var docClient = new AWS.DynamoDB.DocumentClient();

  params = {
    TableName: "users",
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
      //console.log(err);
    }
  });
}

const { Callbacks } = require('jquery');


/*
Rendering the loginPage based off of certain conditions
Look at method: "getCheckLoginPage" for specific logic

*/
var getLoginPage = function (req, res) {
	if (req.session.loggedin) {
		return res.redirect('/homepage');
	}
	// grabbing the error number - it will be string
	if (req.query.error != null) {
		var specificError = req.query.error

		var specificMessage;

		if (specificError === 'usernameIsBlank') {
			specificMessage = "Username is blank";
			return res.render('loginPage.ejs', { message: specificMessage });
		} else if (specificError === 'passwordIsBlank') {
			specificMessage = "Password is blank";
			return res.render('loginPage.ejs', { message: specificMessage });
		} else if (specificError === 'errorOccured') {
			specificMessage = "Error occured";
			return res.render('loginPage.ejs', { message: specificMessage });
		} else if (specificError === "passwordIsWrong") {
			specificMessage = "Password is Incorrect";
			return res.render('loginPage.ejs', { message: specificMessage });
		} else if (specificError === 'usernameIsWrong') {
			specificMessage = "Username is not found";
			return res.render('loginPage.ejs', { message: specificMessage });
		}

	} else {
		return res.render('loginPage.ejs', { message: null });
	}


};

/*

Logic to figure out which login page to show to the user 
Look at method: "getLoginPage" for the function that actually display ejs file to users

*/


var postCheckLoginPage = function (req, res) {
	var username = req.body.username;
	var password = req.body.password;

	var hashPassword = new shajs.sha256().update(password).digest('hex');
	////console.log(hashPassword);

	// check if username is blank
	if (username.length == 0) {
		return res.redirect("/?error=usernameIsBlank");
	} else if (password.length == 0) {
		// check if password is blank if user name is blank
		return res.redirect("/?error=passwordIsBlank");

	} else {

		////console.log('This is the username:' + username);
		////console.log('This is the password:' + password);

		// query dynamoDb
		db.lookup_valid_username_and_password(username, function (err, data) {

			////console.log('This is the output of the err:' + err);
			////console.log('This is the output of the data:' + data);

			// if there is an error, go back to loginPage
			if (err) {
				return res.redirect("/?error=errorOccured")
			} else if (data) {
				//something was returned - username is correct 

				// check password and correct (username and password correct) - hash password
				if (data[1] === hashPassword) {

					// setting cookie - remembering session of user
					req.session.user = username;
					req.session.loggedin = true;
					res.cookie('currentUser', username);

					// also I need to update DB to say user is logged in
					db.update_login_status_after_signing_in(username);

					return res.redirect("/homepage");

				} else {
					// username is correct and password is wrong
					return res.redirect("/?error=passwordIsWrong")
				}


			} else {
				// nothing found - wrong username 
				return res.redirect("/?error=usernameIsWrong")
			}

		});
	}
	
};


var chats = function (req, res) {
    if (req.session.user == null || req.session.user.length == 0) {
        res.redirect('/');
    } else {
        res.render('chats.ejs', {theInput: null, result: null, message: null});
    }
};


var get_users_for_chat = function (req, res) {
    if (req.session.user == null || req.session.user.length == 0) {
        res.redirect('/');
    } else {

        const currentUser = req.session.user

        db.getFriendsByUser(currentUser, function (err, friends) {
            res.json(friends)
        })
    }
}

var get_chat_history_by_user = function (req, res) {
    if (req.session.user == null || req.session.user.length == 0) {
        res.redirect('/');
    } else {
        const currentUser = req.session.user
        const partnerUser = req.query.userName
        let chatHistory = req.app.locals.chatHistory

        const conversationKey = [currentUser, partnerUser].sort().join('__');
        results = []
        if (conversationKey in chatHistory) {
            for (var i=0; i<chatHistory[conversationKey].length; i++){
                results.push(chatHistory[conversationKey][i])
            }
        }

        res.json(results)

    }
};


var start_group_chat = function (req, res) {
    if (req.session.user == null || req.session.user.length == 0) {
        res.redirect('/');
    } else {
        const currentUser = req.session.user
        const initiatorUser = req.body.initiator
        const participantUsers = req.body.participantUsers


        participantUsers.push(initiatorUser)
        const groupChatRoomKey = participantUsers.sort().join('__');
        //console.log(groupChatRoomKey)
        let chatHistory = req.app.locals.chatHistory

        if (groupChatRoomKey in chatHistory) {
            //console.log(`group chat already exists with key: ${groupChatRoomKey}`)
        } else {

            req.app.locals.chatHistory[groupChatRoomKey] = []
        }
        res.json(results)

    }
};

var get_active_group_chats = function (req, res) {
    if (req.session.user == null || req.session.user.length == 0) {
        res.redirect('/');
    } else {
        let chatHistory = req.app.locals.chatHistory;
        results = [];
        const currentUser = req.session.user;



        db.getGroupChatRoomsByUser(currentUser, function (err, data) {
            res.json(data);
        });


    }


};


var get_history_by_group_chat_id = function(req, res){
    if (req.session.user == null || req.session.user.length == 0) {
        res.redirect('/');
    } else {
        const roomId = req.query.roomId;
        db.getHistoryByGroupChatId(roomId, function(err, data){
            if (data === null){
                res.json([]);
            } else {
                res.json(data);
            }

        });
    }
};

var leave_chat = function(req, res){
    if (req.session.user == null || req.session.user.length == 0) {
        res.redirect('/');
    } else {
        const roomId = req.body.roomId;
        const userName = req.body.userName;

        db.leaveChat(userName, roomId, function(err, data){
            //console.log(`user ${userName} left room: ${roomId}`);
            res.json(roomId);
        });
    }
};



/*
Rendering the SignUpPage based off of certain conditions
Look at method: "getCreateAccount" for specific logic

*/

var getSignUpPage = function (req, res) {
	if (req.session.loggedin) {
		res.redirect('/homepage');
	}


	// grabbing the error number - it will be string
	if (req.query.error != null) {
		var specificError = req.query.error

		var specificMessage;

		if (specificError === 'invalidnewsinterest1') {
			specificMessage = "Invalid First News Interest";
			return res.render('signupPage.ejs', { message: specificMessage });
		} else if (specificError === 'invalidnewsinterest2') {
			specificMessage = "Invalid Second News Interest";
			return res.render('signupPage.ejs', { message: specificMessage });
		} else if (specificError === 'bothnewsinterestsaresame') {
			specificMessage = "Both New Interests are the same. They need to be Unique";
			return res.render('signupPage.ejs', { message: specificMessage });
		} else if (specificError === 'usernameIsBlank') {
			specificMessage = "Username is blank";
			return res.render('signupPage.ejs', { message: specificMessage });
		} else if (specificError === 'passwordIsBlank') {
			specificMessage = "Password is blank";
			return res.render('signupPage.ejs', { message: specificMessage });
		} else if (specificError === 'firstnameIsBlank') {
			specificMessage = "First Name is blank";
			return res.render('signupPage.ejs', { message: specificMessage });
		} else if (specificError === 'lastnameIsBlank') {
			specificMessage = "Last Name is blank";
			return res.render('signupPage.ejs', { message: specificMessage });
		} else if (specificError === 'emailaddressIsBlank') {
			specificMessage = "Email Address is blank";
			return res.render('signupPage.ejs', { message: specificMessage });
		} else if (specificError === 'affiliationIsBlank') {
			specificMessage = "Affiliation is blank";
			return res.render('signupPage.ejs', { message: specificMessage });
		} else if (specificError === 'birthdayIsBlank') {
			specificMessage = "Birthday is blank";
			return res.render('signupPage.ejs', { message: specificMessage });
		} else if (specificError === 'newsinterest1IsBlank') {
			specificMessage = "News Interest 1 is blank";
			return res.render('signupPage.ejs', { message: specificMessage });
		} else if (specificError === 'newsinterest2IsBlank') {
			specificMessage = "News Interest 2 is blank";
			return res.render('signupPage.ejs', { message: specificMessage });
		} else if (specificError === 'errorOccured') {
			specificMessage = "errorOccured - please try again";
			return res.render('signupPage.ejs', { message: specificMessage });
		} else if (specificError === "usernameAlreadyTaken") {
			specificMessage = "Username is already taken, try another one";
			return res.render('signupPage.ejs', { message: specificMessage });
		}
	} else {

		// the regular page
		return res.render('signupPage.ejs', { message: null });
	}

};


/*

Logic to figure out which sign up page to show to the user 
Look at method: "getSignUpPage" for the function that actually display ejs file to users

*/

var postCreateAccount = function (req, res) {

	var username = req.body.username;
	var password = req.body.password;
	var firstnametemp = req.body.firstname;
	var lastnametemp = req.body.lastname;
	var emailaddress = req.body.emailaddress;
	var affiliation = req.body.affiliation;
	var birthday = req.body.birthday;
	var newsinterest1 = req.body.newsinterest1;
	var newsinterest2 = req.body.newsinterest2;


	// make all first and last names to have capitalized first letter and lower case rest of letters
	var firstNameLowerCase = firstnametemp.toLowerCase();
	var firstname = firstNameLowerCase.charAt(0).toUpperCase() + firstNameLowerCase.slice(1);


	var lastNameLowerCase = lastnametemp.toLowerCase();
	var lastname = lastNameLowerCase.charAt(0).toUpperCase() + lastNameLowerCase.slice(1);

	// hash password
	var hashPassword = new shajs.sha256().update(password).digest('hex');
	////console.log(hashPassword);

	// make sure all upper case
	newsinterest1 = newsinterest1.toUpperCase();
	newsinterest2 = newsinterest2.toUpperCase();



	var listOfValidNewsInterests = ["ARTS", "ARTS & CULTURE", "BLACK VOICES", "BUSINESS", "COLLEGE", "COMEDY",
		"CRIME", "CULTURE & ARTS", "DIVORCE", "EDUCATION", "ENTERTAINMENT", "ENVIRONMENT", "FIFTY", "FOOD & DRINK", "GOOD NEWS"
		, "GREEN", "HEALTHY LIVING", "HOME & LIVING", "IMPACT", "LATINO VOICES", "MEDIA", "MONEY", "PARENTING", "PARENTS", "POLITICS"
		, "QUEER VOICES", "RELIGION", "SCIENCE", "SPORTS", "STYLE", "STYLE & BEAUTY", "TASTE", "TECH", "THE WORLDPOST", "TRAVEL", "WEDDINGS"
		, "WEIRD NEWS", "WELLNESS", "WOMEN", "WORLD NEWS", "WORLDPOST"];


	if (!(listOfValidNewsInterests.includes(newsinterest1))) {
		return res.redirect("/signup?error=invalidnewsinterest1");
	} else if (!(listOfValidNewsInterests.includes(newsinterest2))) {
		return res.redirect("/signup?error=invalidnewsinterest2");
	} else if (newsinterest1 === newsinterest2) {
		return res.redirect("/signup?error=bothnewsinterestsaresame");
	} else if (username.length == 0) {
		return res.redirect("/signup?error=usernameIsBlank");
	} else if (password.length == 0) {
		return res.redirect("/signup?error=passwordIsBlank");
	} else if (firstname.length == 0) {
		return res.redirect("/signup?error=firstnameIsBlank");
	} else if (lastname.length == 0) {
		return res.redirect("/signup?error=lastnameIsBlank");
	} else if (emailaddress.length == 0) {
		return res.redirect("/signup?error=emailaddressIsBlank");
	} else if (affiliation.length == 0) {
		return res.redirect("/signup?error=affiliationIsBlank");
	} else if (birthday.length == 0) {
		return res.redirect("/signup?error=birthdayIsBlank");
	} else if (newsinterest1.length == 0) {
		return res.redirect("/signup?error=newsinterest1IsBlank");
	} else if (newsinterest2.length == 0) {
		return res.redirect("/signup?error=newsinterest2IsBlank");
	} else {

		// query dynamo and see whether or not username exists in the user table
		db.lookup_valid_username_and_password(username, function (err, data) {
			if (err) {
				return res.redirect("/signup?error=errorOccured");
			} else if (data) {

				// if returned is valid data (not null), then username taken and CAN NOT insert account
				return res.redirect("/signup?error=usernameAlreadyTaken");

			} else {

				////console.log("adding user in table");
				// null case - this is when the username is NEW and you be able to create account	

				// setting cookie to the username created
				req.session.user = username;
				req.session.loggedin = true;

				// insert into user table
				db.insert_new_account_into_user_table(username, hashPassword, firstname, lastname,
					emailaddress, affiliation, birthday, newsinterest1, newsinterest2);

				//insert into user search table
				db.insert_new_account_into_user_search_table(firstname, lastname, username);

				// redirect into restaurants - POTENTIAL CONFLICT HERE
				return res.redirect("/homepage");

			}
		});

	}
};

/*

Rendering the HomePage based off of certain conditions
Look at method:  for specific logic

*/



/*
Functions to display basic page of setting pages

*/

var getAccountSettingPage = function (req, res) {
	if (!req.session.loggedin) {
		res.redirect('/'); return;;
	}

	return res.render('accountsettingsPage.ejs');
}

var getUpdateEmailPage = function (req, res) {
	if (!req.session.loggedin) {
		res.redirect('/'); return;;
	}

	return res.render('changeEmailPage.ejs', { messageForEmail: null });
}

var getUpdatePasswordPage = function (req, res) {
	if (!req.session.loggedin) {
		res.redirect('/'); return;;
	}

	return res.render('changePasswordPage.ejs', { messageForPassword: null });
}


var getUpdateAffiliationPage = function (req, res) {
	if (!req.session.loggedin) {
		res.redirect('/'); return;;
	}

	return res.render('changeAffiliationPage.ejs', { messageForAffiliation: null });

}

var getUpdateAddNewsCategoryPage = function (req, res) {
	if (!req.session.loggedin) {
		res.redirect('/'); return;;
	}

	return res.render('changeAddNewsCategoryPage.ejs', { messageForAddNewsCategory: null });

}

var getUpdateDeleteNewsCategoryPage = function (req, res) {
	if (!req.session.loggedin) {
		res.redirect('/'); return;;
	}

	return res.render('changeDeleteNewsCategoryPage.ejs', { messageForDeleteNewsCategory: null });
}

/*

Functions to update settings and display extra message

*/


var postUpdateEmail = function (req, res) {
	if (!req.session.loggedin) {
		res.redirect('/'); return;;
	}

	////console.log("Update Email")

	var newEmail = req.body.newEmail;

	// using the cookie
	var username = req.session.user;

	////console.log(username);

	db.update_email(username, newEmail);

	var message = "Updated Email"

	return res.render('changeEmailPage.ejs', { messageForEmail: message });
}

var postUpdatePassword = function (req, res) {
	if (!req.session.loggedin) {
		res.redirect('/'); return;;
	}

	////console.log("Update Password")

	var newPassword = req.body.newPassword;
	var hashPassword = new shajs.sha256().update(newPassword).digest('hex');

	// using the cookie
	var username = req.session.user;


	db.update_password(username, hashPassword);

	var message = "Updated Password"

	return res.render('changePasswordPage.ejs', { messageForPassword: message });
}

var postUpdateAffiliation = function (req, res) {
	if (!req.session.loggedin) {
		res.redirect('/');
		return;
	}

	////console.log("Update Affiliation")

	var newAffiliation = req.body.newAffiliation;

	// using the cookie
	var username = req.session.user;

	////console.log(username);

	// checking if updated affilation is actually different than old affilation 	
	db.get_current_affiliation_of_user(username, function (err, data) {

		////console.log("The error returned is" + err);
		////console.log("The current affiliation returned is" + data);
		// error
		if (err) {
			////console.log("error")
			var message = "Error Occurred"
			return res.render('changeAffiliationPage.ejs', { messageForAffiliation: message });
		} else if (data) {
			// something was found
			var currentAffiliation = data[0];
			////console.log("This user current affiliation is:" + currentAffiliation);

			// if current affiliation and new affiliation are not equal - update affiliation

			if (!(currentAffiliation === newAffiliation)) {
				//STATUS POST HERE
				db.update_affiliation(username, newAffiliation);
				var timestamp = Date.now()
				var statusUpdate = {
					"timestamp": { "S": timestamp.toString() },
					"content": { "S": "Changed affiliation to " + newAffiliation },
					"postuniqueid": { "S": timestamp.toString() + "-" + username },
					"posterusername": { "S": username },
				}
				db.addStatusUpdate(statusUpdate, function (err, bool) {
					if (bool) {
						var message = "Updated Affiliation"
						//console.log("SENDING PAGE")
						return res.render('changeAffiliationPage.ejs', { messageForAffiliation: message });
					} else {
						return res.send("Fail")
					}
				});


			} else {
				// if affiliation equal
				var message = "Try again - Same Affiliation As Before"
				return res.render('changeAffiliationPage.ejs', { messageForAffiliation: message });

			}


		} else {
			// nothing found - wrong username 
			////console.log("wrong username")
			var message = "Error Occurred"
			return res.render('changeAffiliationPage.ejs', { messageForAffiliation: message });
		}

	});


}


var postUpdateAddNewsCategory = function (req, res) {
	if (!req.session.loggedin) {
		res.redirect('/'); return;; return;;
	}


	// need to make upper case since I'm storing all news categoires as upper case
	var newNews = req.body.newAddNews;
	newNews = newNews.toUpperCase();

	// using the cookie
	var username = req.session.user;

	////console.log(username);

	// checking if updated affilation is actually different than old affilation 	
	db.get_current_news_categories_of_user(username, function (err, currentNewsList) {

		////console.log(currentNewsList);
		////console.log(" The current News Interest is:" + currentNewsList);
		// if error
		if (err) {
			var message = "Error Occurred"
			return res.render('changeAddNewsCategoryPage.ejs', { messageForAddNewsCategory: message });
		} else {

			// logic imposes that the user must have at least two news categories at a time (I enforce this logic)
			var arrayLength = currentNewsList.length;
			for (var i = 0; i < arrayLength; i++) {

				////console.log()

				// if newNews equals old news - no update
				if (currentNewsList[i] === newNews) {
					var message = "Try again - You are already interested in this news category"
					return res.render('changeAddNewsCategoryPage.ejs', { messageForAddNewsCategory: message });
				}
			}

			// if different than current news category need to check if its valid news category

			var listOfValidNewsInterests = ["ARTS", "ARTS & CULTURE", "BLACK VOICES", "BUSINESS", "COLLEGE", "COMEDY",
				"CRIME", "CULTURE & ARTS", "DIVORCE", "EDUCATION", "ENTERTAINMENT", "ENVIRONMENT", "FIFTY", "FOOD & DRINK", "GOOD NEWS"
				, "GREEN", "HEALTHY LIVING", "HOME & LIVING", "IMPACT", "LATINO VOICES", "MEDIA", "MONEY", "PARENTING", "PARENTS", "POLITICS"
				, "QUEER VOICES", "RELIGION", "SCIENCE", "SPORTS", "STYLE", "STYLE & BEAUTY", "TASTE", "TECH", "THE WORLDPOST", "TRAVEL", "WEDDINGS"
				, "WEIRD NEWS", "WELLNESS", "WOMEN", "WORLD NEWS", "WORLDPOST"];

			// valid news category and different from my current news
			if (listOfValidNewsInterests.includes(newNews)) {

				currentNewsList.push(newNews);

				db.update_news_categories_field(username, currentNewsList);
				var timestamp = Date.now()
				var statusUpdate = {
					"timestamp": { "S": timestamp.toString() },
					"content": { "S": "Added news interest: " + newNews },
					"postuniqueid": { "S": timestamp.toString() + "-" + username },
					"posterusername": { "S": username },
				}
				db.addStatusUpdate(statusUpdate, function (err, bool) {
					if (bool) {
						var message = "Updated Affiliation"
						//console.log("SENDING PAGE")
						var message = "Added News Interest"
						//STATUS POST HERE, newNews
						run_spark_algorithm(req, null);
						console.log(req + "AA")
						return res.render('changeAddNewsCategoryPage.ejs', { messageForAddNewsCategory: message });
					} else {
						return res.send("Fail")
					}
				});

			} else {
				// if NOT valid news category
				var message = "Invalid News Category - Try again";
				return res.render('changeAddNewsCategoryPage.ejs', { messageForAddNewsCategory: message });

			}




		}


	});

}

var postUpdateDeleteNewsCategory = function (req, res) {
	if (!req.session.loggedin) {
		res.redirect('/'); return;; return;;
	}

	var deleteNewsCategory = req.body.deleteNewsCategory;
	deleteNewsCategory = deleteNewsCategory.toUpperCase();

	// using the cookie
	var username = req.session.user;

	db.get_current_news_categories_of_user(username, function (err, currentNewsList) {

		if (err) {
			var message = "Error Occurred"

			return res.render('changeDeleteNewsCategoryPage.ejs', { messageForDeleteNewsCategory: message });
		} else {

			// logic imposes that the user must have at least two news categories at a time (I enforce this logic)
			var arrayLength = currentNewsList.length;


			// if at least three current news categories right now - you can delete
			if (arrayLength >= 3) {

				// if news category wanted to be deleted is in current new category list
				const index = currentNewsList.indexOf(deleteNewsCategory);
				if (index > -1) {
					currentNewsList.splice(index, 1);
					db.update_news_categories_field(username, currentNewsList);
					var message = "Success: Deleted News Category"
					//STATUS POST, deleted news cat
					var timestamp = Date.now()
					var statusUpdate = {
						"timestamp": { "S": timestamp.toString() },
						"content": { "S": "Delete news interest: " + deleteNewsCategory },
						"postuniqueid": { "S": timestamp.toString() + "-" + username },
						"posterusername": { "S": username },
					}
					db.addStatusUpdate(statusUpdate, function (err, bool) {
						if (bool) {
							//console.log("SENDING PAGE")
							//STATUS POST HERE, newNews
						     run_spark_algorithm(req, null);

							return res.render('changeDeleteNewsCategoryPage.ejs', { messageForDeleteNewsCategory: message });
						} else {
							return res.send("Fail")
						}
					});


				} else {
					// if news category wanted to be deleted is NOT in current new category list
					var message = "Error: You are not currently interested in this news category "
					return res.render('changeDeleteNewsCategoryPage.ejs', { messageForDeleteNewsCategory: message });
				}
			} else {
				// if less than three current news categories right now - can NOT delete
				var message = "Error: You are interested in less than 3 news categories currently. You can not remove news categories."
				return res.render('changeDeleteNewsCategoryPage.ejs', { messageForDeleteNewsCategory: message });
			}




		}



	});



}




/*

Getting the user search suggestions (for ajax call)

Use Case:
	1) A user is typing in the HomePage and I need recommend search suggestions


*/

var userSearchSuggestions = function (req, res) {
	if (!req.session.loggedin) {
		res.redirect('/'); return;; return;;
	}

	//////console.log(req.body.searchterm);

	// need to query this word on user_search_table
	var currentUserSearchWord = req.body.searchterm;

	var emptyArray = [];

	//////console.log("user search suggestion before query")

	db.query_user_search_table_for_search_suggestions(currentUserSearchWord, function (err, data) {
		if (err) {
			res.send(emptyArray);
		} else if (data) {

			// DO NEED TO STRINGIFY HERE 
			////console.log(data);
			//var dataJson = JSON.stringify(data);
			//////console.log(dataJson);

			res.send(data);

		} else {
			// if data is null  - no results
			res.send(emptyArray);
		}

	});


}

/*

Getting the user search results after user searches page

Use Case:
	1) A user searches for users
	
Notes: Basically the same exact code as "userSearchSuggestions" but grabbing input differently

*/

var postUserSearchResultsPage = function (req, res) {
	if (!req.session.loggedin) {
		res.redirect('/'); return;;
	}

	// only difference - need to grab data from button
	var currentUserSearchWord = req.body.usersearch;

	var emptyArray = [];

	//////console.log("user search suggestion before query")

	db.query_user_search_table_for_search_suggestions(currentUserSearchWord, function (err, data) {
		if (err) {
			res.send(emptyArray);
		} else if (data) {

			////console.log(data);

			return res.render('userSearchPage.ejs', { table: data, message: null });

		} else {
			// if data is null  - no results
			////console.log(data);

			var tempMessage = "No users matched your search."

			// no results - so need to send a message telling users
			return res.render('userSearchPage.ejs', { table: null, message: tempMessage });
		}

	});

}


/*

Getting the wall page of specific user

Use Case:
	1) After a user searches for users and clicks the link and is directed to specific wall page


*/





/*

Friend Visualizer - displaying initial graph - ejs

*/


var getFriendVisualizationPage = function(req, res) {
	if (!req.session.loggedin) {
		res.redirect('/'); return;; return;;
	}
	
	return res.render('friendvisualizer.ejs');
}


/*

Friend Visualizer - displaying initial graph - the route called here

*/

var getFriendsVisualization = function(req, res) {
	
	if (!req.session.loggedin) {
		res.redirect('/'); return;; return;;
	}
	
	// getting person of the center of the graph we want to initialize
	 var currentUser = req.session.user;

	////console.log("get friends visualization")
	
	// data to be returned
	var dataSetToVisualizer = new Object();
	
	// id and name will be the same - simplier for implementation
	dataSetToVisualizer.id =  currentUser;
	dataSetToVisualizer.name = currentUser;


	db.get_friends_of_specified_user(currentUser, function(err,friendSet) {	
			
		// if there is an error or empoty
		if (err) {
		
			var friendsList = [];
			dataSetToVisualizer.children = friendsList;
			return res.send(dataSetToVisualizer)
			
		} else if (friendSet) {
			//something was returned 
			
			var friendsList = [];
			
			// converting 
			var friendListOfUserConvertedFromSet = Array.from(friendSet);
			
			//console.log("Convering Set to List:" + friendListOfUserConvertedFromSet);
		
			var lengthOfArray = friendListOfUserConvertedFromSet.length;
			
			//console.log("Length of Array is" + lengthOfArray);
			
			for(var i = 0; i < lengthOfArray; i++) {
				var ObjectForEachFriend = new Object();
				
				ObjectForEachFriend.id = friendListOfUserConvertedFromSet[i];
				ObjectForEachFriend.name = friendListOfUserConvertedFromSet[i];
				
				//console.log("pushing object into list");
				// adding the map to the friends List
				friendsList.push(ObjectForEachFriend);
			}

			
			dataSetToVisualizer.children = friendsList;

		
			//console.log("This is data before JSON");
			//console.log(dataSetToVisualizer);
			
			//var dataJson = JSON.stringify(dataSetToVisualizer);
			
			////console.log("This is data after JSON");
			////console.log(dataJson);

			// send data over
			return res.send(dataSetToVisualizer);

		} else {
			var friendsList = [];
			dataSetToVisualizer.children = friendsList;
			return res.send(dataSetToVisualizer)
			
		}
		
	});
	 


}


var getFriendsOfSpecificUserVisualization = function(req, res) {
	
	if (!req.session.loggedin) {
		res.redirect('/'); return;; 
	}
	
	////console.log("The friend I'm grabbing data for" + req.params.user);
	
	var userOfInterest = req.params.user;
	

	var currentUserLoggedIn = req.session.user;

	
	var affiliationOfCurrentUserLoggedIn = "";
	
	var friendsListOfUserOfInterest = []; 
	
	// the friend username with the affiliation 
	//var friendsListOfObjectsOfUserOfInterest = [];
	
	var finalFriendsList = [];
	
	
	// getting affiliaton of current user logged in 
	db.get_current_affiliation_of_user(currentUserLoggedIn, function(err,data) {
		
		if (err) {
			// of 
			////console.log("error")
			 affiliationOfCurrentUserLoggedIn = null;
		} else {
			// something was found
			affiliationOfCurrentUserLoggedIn = data[0];
					
			// getting friends of specificed user
			db.get_friends_of_specified_user(userOfInterest, function(err,friendSet) {	
				
			// if there is an error or empty friendSet 
			if (err) {
				// do nothing - send OVER object where children list is empty - for error checking!!!
				
				//console.log("Empty or Error Friend Set");
				
				var dataSetToVisualizer = new Object();

				dataSetToVisualizer.id =  userOfInterest;
				dataSetToVisualizer.name = userOfInterest;
				dataSetToVisualizer.children = [];
				
				//console.log(dataSetToVisualizer);
				return res.send (dataSetToVisualizer);

			} else if (friendSet) {
							
				// converting 
				//console.log("Convering Set to List:" + friendsListOfUserOfInterest);
		
				friendsListOfUserOfInterest = Array.from(friendSet);
					
				//console.log("this is the affiliation of user");
				//console.log(affiliationOfCurrentUserLoggedIn);
				//console.log("this is list of friends");
				//console.log(friendsListOfUserOfInterest);
				//console.log('Getting affiliation of each friend now');
			
				var counter = 0;
				// getting affiliation of each friend
				friendsListOfUserOfInterest.forEach((friend) => {
					// getting affiliaton of current user
					db.get_current_affiliation_of_user(friend, function(err,data) {
						counter++;
						//console.log("Next to counter:" + counter);

						if (err) {
							//console.log("error");
					
						} else if (data){															
							
								if(data[0] === affiliationOfCurrentUserLoggedIn) {
									// push username to list
									//console.log("Before push");
									//console.log(friend)
									
									var friendObject = new Object();
									friendObject.id = friend;
									friendObject.name = friend;


									finalFriendsList.push(friendObject);
									
									//console.log("after push");
									//console.log(finalFriendsList);
									
								}
									
								//console.log(counter);
																																
								// check if Bob friends total - counter
								if(counter == friendsListOfUserOfInterest.length) {
									
									var dataSetToVisualizer = new Object();
		
									// id and name will be the same - simplier for implementation
									dataSetToVisualizer.id =  userOfInterest;
									dataSetToVisualizer.name = userOfInterest;
									dataSetToVisualizer.children = finalFriendsList;
									
									//console.log("before sending data");
									//console.log(dataSetToVisualizer);
									return res.send (dataSetToVisualizer);
								}
								
						} else {
						};
				
					});
					
					
				});
				
		
					
	
			
			} 
			
			
			
			
		// get friends one
		});
		
	// if not error 	
	}
  });

}


// logout
var getLogout = function(req, res) {
	
	// update login status of user
	db.update_user_log_out(req.session.user);

	
	// removing the user from session
	req.session.destroy();
	
	return res.redirect('/');	
	
	
}

var getUserDetails = function(req, res) {
	if (!req.session.loggedin) {
		return res.redirect('/');
	} else {
		db.getUserDetails(req.query.user, function(err, data) {
			if (err) {
				res.send("Connection error, please refresh your page and try again.");
			} else {
				res.send(data);
			}
		})
	}
}




var getHome = function (req, res) {
	if (!req.session.loggedin) {
		return res.redirect('/');
	}
	db.getWallPostsHP(req.session.user, function (err, data) {
		if (err) {
			////console.log(err)
			return res.send("FAIL")
		} else {
			return res.render('homepage.ejs', { data: data })
		}
	});
}

var getOnlineFriends = function (req, res) {
	if (!req.session.loggedin) {
		res.redirect('/'); return;;
	}
	db.getOnlineFriends(req.session.user, function (err, data) {
		if (err) {
			//console.log("ERRRORRR DB")
			res.send(null);
		} else {
			//console.log(data);
			res.send(data);
		}
	})
}

var getFriendships = function (req, res) {
	if (!req.session.loggedin) {
		res.redirect('/'); return;;
	}
	db.getFriendshipPosts(req.session.user, function (err, data) {
		if (err) {
			res.send(err)
		} else {
			res.send(data)

		}
	})
}

var getFriendsStatusUpdates = function (req, res) {
	if (!req.session.loggedin) {
		res.redirect('/'); return;;
	}
	db.getFriendsStatusUpdates(req.session.user, function (err, data) {
		if (err) {
			res.send(null);
		}
		/*send = []
		for (var i = 0; i < data.length; i++) {
			for (var j = 0; j < data[i].length; j++) {
				send.push(data[i][j]);
			}
		}*/
		// do time sorting and pick top "n"
		res.send(data)
	});
}

var getWall = function (req, res) {
	if (!req.session.loggedin) {
		res.redirect('/'); return;;
	}
	var username, lookup;
	username = req.session.user;
	var someoneelse = true;
	var friend = false;
	if ('user' in req.query && req.query.user != username) {
		lookup = req.query.user;
	} else {
		someoneelse = false;
		lookup = req.session.user
	}
	////console.log("USERNAME: " + lookup)
	if (!someoneelse) {
		db.getWallPostsWP(username, function (err, data) {
			if (err) {
				////console.log(err)
				res.send("FAIL")
			} else {
				////console.log("SENDING SAME " + username);
				return res.render('mywall.ejs', { data: data })
			}
		});
	}
	if (someoneelse) {
		db.getFriends(username, function (err, friends) {
			for (var i = 0; i < friends.length; i++) {
				if (friends[i].username2.S == lookup) {
					friend = true;
					////console.log("FRIENDS");
					break;
				}
			}
			if (friend) {
				////console.log("FRIENDS SO HERE")
				db.getWallPostsWP(lookup, function (err, data) {
					if (err) {
						////console.log(err)
						res.send("FAIL")
					} else {
						////console.log("SENDING SOMEONE ELSE " + lookup);
						return res.render('wall.ejs', { data: data })
					}
				});
			} else {

				return res.render('wallNF.ejs', { message: null });
			}
		})
	}
}

var getMyStatusUpdates = function (req, res) {
	if (!req.session.loggedin) {
		res.redirect('/'); return;;
	}
	////console.log(req.query.user + " STATUS UPDATES")
	db.getMyStatusPosts(req.query.user, function (err, data) {
		if (err) {
			res.send(null);
		} else {
			res.send(data)
		}
	})
}
var getUser = function (req, res) {
	if (!req.session.loggedin) {
		res.redirect('/'); return;;
	}
	res.send(req.session.user);
}

var getComments = function (req, res) {
	if (!req.session.loggedin) {
		res.redirect('/'); return;;
	}
	//console.log(req.query.postid)
	db.getComments(req.query.postid, function (err, data) {
		//console.log("GETTING COMMENTS FOR " + req.query.postid);
		if (err) {
			res.send(null)
		} else {
			res.send(data)
		}
	})

}

var addComment = function (req, res) {
	if (!req.session.loggedin) {
		res.redirect('/'); return;;
	}
	////////console.log(req.body);
	db.addComment(req.body, function (err, data) {
		if (err) {
			//////console.log(err)
			//res.redirect('/restaurants?error=1')
		} else {
			res.send("SUCCESS");
		}
	});
}

var addStatusUpdate = function (req, res) {
	if (!req.session.loggedin) {
		res.redirect('/'); return;;
	}
	//////console.log(req.body)
	db.addStatusUpdate(req.body, function (err, bool) {
		if (bool) {
			res.send("Success")
		} else {
			res.send("Fail")
		}
	});
}

var addWallPost = function (req, res) {
	if (!req.session.loggedin) {
		res.redirect('/'); return;;
	}
	////console.log(req.body);
	db.addWallPost(req.body, function (err, result) {
		if (result) {
			res.send(true);
		} else {
			res.send(false);
		}
	});
}

var addFriend = function (req, res) {
	if (!req.session.loggedin) {
		res.redirect('/'); return;;
	}
	////console.log(req.body);
	db.addFriend(req.body, function (err, bool) {
		if (bool) {
			res.send(true);
		} else {
			res.send(false);
		}
	})
}

var removeFriend = function (req, res) {
	if (!req.session.loggedin) {
		res.redirect('/'); return;;
	}
	////console.log(req.body);
	db.removeFriend(req.body, function (err, bool) {
		if (bool) {
			res.send(true);
		} else {
			res.send(false);
		}
	})
}

var friendsList = function (req, res) {
	if (!req.session.loggedin) {
		return res.redirect('/');
	}
	return res.render('friendsList.ejs');
}

var getFriends = function (req, res) {
	if (!req.session.loggedin) {
		return res.redirect('/');
	}
	db.getFriends(req.session.user, function (err, data) {
		if (err) {
			//console.log(err);
			return res.send("ERROR occured");
		} else {
			return res.send(data);
		}
	})
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
  update_interests: update_interest,


	get_login_page: getLoginPage,
	checklogin_page: postCheckLoginPage,
	get_signup_page: getSignUpPage,
	create_account: postCreateAccount,
	//get_home_page: getHomePage,
	get_settings_page: getAccountSettingPage,
	user_search_suggestions: userSearchSuggestions,
	user_search_results_page: postUserSearchResultsPage,
	//get_wall_page: getWallPage,
	update_email: postUpdateEmail,
	update_password: postUpdatePassword,
	update_affiliation: postUpdateAffiliation,
	update_add_news_category: postUpdateAddNewsCategory,
	update_delete_news_category: postUpdateDeleteNewsCategory,
	get_update_email_page: getUpdateEmailPage,
	get_update_password_page: getUpdatePasswordPage,
	get_update_affiliation_page: getUpdateAffiliationPage,
	get_update_add_news_category_page: getUpdateAddNewsCategoryPage,
	get_update_delete_news_category_page: getUpdateDeleteNewsCategoryPage,
	get_friend_visualization_page: getFriendVisualizationPage,
	get_friend_visualization: getFriendsVisualization,
	get_friends_of_specific_user_visualization: getFriendsOfSpecificUserVisualization,
	get_logout: getLogout,
	

	getHome: getHome,
	getOnlineFriends: getOnlineFriends,
	getFriendships: getFriendships,
	getFriendsStatusUpdates: getFriendsStatusUpdates,
	getWall: getWall,
	getMyStatusUpdates: getMyStatusUpdates,
	getComments: getComments,
	getUser: getUser,
	getUserDetails: getUserDetails,
	friendsList: friendsList,
	addStatusUpdate: addStatusUpdate,
	addWallPost: addWallPost,
	addComment: addComment,
	addFriend: addFriend,
	removeFriend: removeFriend,
	getFriends: getFriends,
    chats: chats,
    get_users_for_chat: get_users_for_chat,
    get_chat_history_by_user: get_chat_history_by_user,
	start_group_chat: start_group_chat,
    get_active_group_chats: get_active_group_chats,
    get_history_by_group_chat_id: get_history_by_group_chat_id,
    leave_chat: leave_chat
};


module.exports = routes;
