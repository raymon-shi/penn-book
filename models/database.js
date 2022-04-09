var AWS = require('aws-sdk');

const { contains } = require('jquery');
AWS.config.update({ region: 'us-east-1' });
var db = new AWS.DynamoDB();
var docClient = new AWS.DynamoDB.DocumentClient();


/*var database_lookup_news_search = function(search_term, callback) {
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
  //console.log("Looking up username: " + current_username);

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
};*/

/* The function below is an example of a database method. Whenever you need to 
   access your database, you should define a function (myDB_addUser, myDB_getPassword, ...)
   and call that function from your routes - don't just call DynamoDB directly!
   This makes it much easier to make changes to your database schema. */


/*
	DB function to check for valid username and password
	
	Use Case
	1) Login Page - people are allowed to login or not
	2) Sign up page - people are allowed or not to create account with specific username
*/

var myDB_lookup_check_valid_username_and_password = function (usernameToLookUp, callback) {
	//console.log('Looking up: ' + usernameToLookUp);

	// params to call to AWS
	var params = {
		TableName: "users",
		KeyConditionExpression: "#key = :searchword",
		ExpressionAttributeNames: {
			"#key": "username"
		},
		ExpressionAttributeValues: {
			":searchword": { S: usernameToLookUp }
		}
	};

	db.query(params, function (err, data) {

		// checking not valid username
		if (err || data.Items.length == 0) {
			return callback(err, null);
		} else {

			var arrayPassedBack = [data.Items[0].username.S, data.Items[0].password.S];

			// if valid username, but password not valid
			return callback(err, arrayPassedBack);
		}
	});
}

/*
	DB function to change people logged in status after sign in (NOT for signing up)
	
	Use Case
	1) Login Page -people login and I need to change DB to say there are logged in
*/

var myDB_update_login_status_after_signing_in = function (usernameToUpdate, callback) {

	var tableNameForItem = "users";
	var usernameToUpdateForItem = usernameToUpdate;

	var params = {
		TableName: tableNameForItem,
		Key: {
			"username": usernameToUpdateForItem
		},
		UpdateExpression: "set loggedin = :r",
		ExpressionAttributeValues: {
			":r": true,
		},
		ReturnValues: "UPDATED_NEW"
	};

	docClient.update(params, function (err, data) {
		if (err) {
			//console.log("Update Failed")
		} else {
			//console.log("Update Success")
		}
	});
}

/*
	DB function to update email
	
	Use Case: update email in account setting page
*/

var myDB_update_email = function (usernameToUpdate, newEmail) {

	var tableNameForItem = "users";
	var usernameToUpdateForItem = usernameToUpdate;
	var newEmailForItem = newEmail;

	var params = {
		TableName: tableNameForItem,
		Key: {
			"username": usernameToUpdateForItem
		},
		UpdateExpression: "set email = :r",
		ExpressionAttributeValues: {
			":r": newEmailForItem,
		},
		ReturnValues: "UPDATED_NEW"
	};

	docClient.update(params, function (err, data) {
		if (err) {
			//console.log("Update Failed")
		} else {
			//console.log("Update Success")
		}
	});
}

/*
	DB function to update password
	
	Use Case: update password in account setting page
*/


var myDB_update_password = function (usernameToUpdate, newPasswordHashed) {

	var tableNameForItem = "users";
	var usernameToUpdateForItem = usernameToUpdate;
	var newPasswordForItem = newPasswordHashed;

	var params = {
		TableName: tableNameForItem,
		Key: {
			"username": usernameToUpdateForItem
		},
		UpdateExpression: "set password = :r",
		ExpressionAttributeValues: {
			":r": newPasswordForItem,
		},
		ReturnValues: "UPDATED_NEW"
	};

	docClient.update(params, function (err, data) {
		if (err) {
			//console.log("Update Failed")
		} else {
			//console.log("Update Success")
		}
	});
}


/*
	DB function to update affiliation
	
	Use Case: update affiliation in account setting page
*/



var myDB_update_affiliation = function (usernameToUpdate, affiliation) {

	var tableNameForItem = "users";
	var usernameToUpdateForItem = usernameToUpdate;
	var newAffiliationForItem = affiliation;

	var params = {
		TableName: tableNameForItem,
		Key: {
			"username": usernameToUpdateForItem
		},
		UpdateExpression: "set affiliation = :r",
		ExpressionAttributeValues: {
			":r": newAffiliationForItem,
		},
		ReturnValues: "UPDATED_NEW"
	};

	docClient.update(params, function (err, data) {
		if (err) {
			//console.log("Update Failed")
		} else {
			//console.log("Update Success")
		}
	});
}


var myDB_update_news_categories_field = function (usernameToUpdate, newCurrentNewCategoriesUpdated) {

	var tableNameForItem = "users";
	var usernameToUpdateForItem = usernameToUpdate;

	//console.log(newCurrentNewCategoriesUpdated);
	var newsInterestSetForItem = docClient.createSet(newCurrentNewCategoriesUpdated);

	//console.log(newsInterestSetForItem);


	var params = {
		TableName: tableNameForItem,
		Key: {
			"username": usernameToUpdateForItem
		},
		UpdateExpression: "set interests = :r",
		ExpressionAttributeValues: {
			":r": newsInterestSetForItem,
		},
		ReturnValues: "UPDATED_NEW"
	};

	docClient.update(params, function (err, data) {
		if (err) {
			//console.log("Update Failed")
		} else {
			//console.log("Update Success")
		}
	});
}

var getFriends = function (username, callback) {
	var params = {
		TableName: "friends",
		KeyConditionExpression: "username1 = :search",
		ExpressionAttributeValues: { ":search": { "S": username } }
	};

	db.query(params, function (err, data) {
		if (err || (data == null)) {
			//console.log(username);
			//console.log(err);
			callback(err, null);
		} else {
			callback(err, data.Items);
		}
	});

}

var getFriendWallPosts = async function (username) {
	return new Promise((resolve, reject) => {
		var params = {
			TableName: "wallposts",
			KeyConditionExpression: "posterusername = :search",
			ExpressionAttributeValues: { ":search": { "S": username } }

		};
		db.query(params, function (err, data) {
			if (err) {
				reject(err)
			} else {
				send = []
				for (var i = 0; i < data.Items.length; i++) {
					////console.log(data.Items[i].wallusername)
					if (data.Items[i].wallusername.S == username) {
						send.push(data.Items[i]);
					}
				}
				resolve(send)
			}
		});
	});
}

var getOnlineFriends = function (username, callback) {
	getFriends(username, function (err, friends) {
		if (err) {
			callback(err, null)
		}
		var prom = []
		//console.log(friends);
		for (var i = 0; i < friends.length; i++) {
			//console.log("USERNAME OF FRIEND" + friends[i].username2.S)
			prom.push(userLookup(friends[i].username2.S));
		}

		////console.log(prom)
		Promise.all(prom).then(values => {
			//console.log(values.length)
			////console.log(values)
			var result = []
			console.log("LOGGEDIN BOOOOOL");
			
			for (var j = 0; j < values.length; j++) {
				console.log(values[j]);
				if (values[j][0].loggedin.BOOL) {
					result.push(values[j][0]);
				}
			}
			//console.log("SENDING THIS TO ONLINE FRIENDS")
			//console.log(result)
			callback(err, result)
		});
	});
};

var userLookup = async function (username) {
	return new Promise((resolve, reject) => {
		var params = {
			TableName: "users",
			KeyConditionExpression: "username = :search",
			ExpressionAttributeValues: { ":search": { "S": username } }
		};
		db.query(params, function (err, data) {
			if (err) {
				reject(err);
			} else {
				resolve(data.Items);
			}
		})
	})
}

var getComments = function (postuniqueid, callback) {
	var params = {
		TableName: "comments",
		KeyConditionExpression: "postuniqueid = :search",
		ExpressionAttributeValues: { ":search": { "S": postuniqueid } }
	};
	db.query(params, function (err, data) {
		if (err) {
			callback(err, null);
		} else {
			callback(err, data.Items);
		}
	})
}

var getWallPostsHP = function (username, callback) {
	friendsSet = new Set()
	////console.log('Looking up: ' + username);
	var params = {
		TableName: "wallposts",
		KeyConditionExpression: "posterusername = :search",
		ExpressionAttributeValues: { ":search": { "S": username } }
	};

	getFriends(username, function (err1, friends) {
		if (err1) {
			//console.log(err1);
			callback(err1, null);
		}

		prom = []
		if (friends == null) {
			friends = [];
		}

		for (var j = 0; j < friends.length; j++) {
			friendsSet.add(friends[j].username2.S)
			////console.log(friends[j].username2.S)
			prom.push(getFriendWallPosts(friends[j].username2.S))
		}

		Promise.all(prom).then(values => {
			var result = []
			for (var k = 0; k < values.length; k++) {
				result.push.apply(result, values[k]);
			}
			////console.log(result)
			db.query(params, function (err, data) {
				if (err) {
					//console.log(err)
					callback(err, null);
				} else {
					for (var i = 0; i < data.Items.length; i++) {
						if (data.Items[i].wallusername.S != username && friendsSet.has(data.Items[i].wallusername.S)) {
							result.push(data.Items[i]);
						}
					}
					result.sort(function(a, b) { 
						return parseInt(b.timestamp.S) - parseInt(a.timestamp.S);
					})
					callback(err, result)
				}
			});
		})


	})
}

var getFriendshipPosts = function (username, callback) {
	//console.log('Looking up: ' + username);
	results = []
	getFriends(username, function (err, friends) {
		if (err) {
			return callback(err, null)
		}
		for (var j = 0; j < friends.length; j++) {
			if (Date.now() - parseInt(friends[j].timestamp.S) < 86400000) {
				results.push(friends[j].username2.S);
			}
		}
		//console.log(results);
		callback(err, results);
		////console.log("SENDING THIS TO FRIENDSHIP POSTS")
		////console.log(result)
		//callback(err, result);
		//efficeitnly sort here and send top "n" results, efficient sort could be linear here
		// (merge sort combine)	


	})

}

var getFriendsStatusUpdates = function (username, callback) {
	getFriends(username, function (err, friends) {
		prom = []
		if (err) {
			callback(err, null);
		} else {
			for (var i = 0; i < friends.length; i++) {
				var params = {
					TableName: "statusposts",
					KeyConditionExpression: "posterusername = :search",
					ExpressionAttributeValues: { ":search": { "S": friends[i].username2.S } }
				};
				prom.push(db.query(params).promise())
			}
			Promise.all(prom).then(values => {
				var result = []
				for (var j = 0; j < values.length; j++) {
					if (values[j].Items.length > 0) {
						for (var k = 0; k < values[j].Items.length; k++) {
							result.push(values[j].Items[k]);
						}
					}
				}
				result.sort(function(a, b) { 
					return parseInt(a.timestamp.S) - parseInt(b.timestamp.S);
				})
				callback(err, result);
			})

		}

	})
}

var addComment = function (data, callback) {
	////console.log(data)
	////console.log(data.timestamp)
	var params = {
		TableName: 'comments',
		Item: {
			'usernameofcommentor': { "S": data.usernameofcommentor },
			'postuniqueid': { "S": data.postuniqueid },
			'timestamp': { "S": data.timestamp },
			'content': { "S": data.content },
		}
	};

	db.putItem(params, function (err, data) {
		//if err adding return false else return true
		if (err) {
			//console.log(err);
			return callback(err, false);
		} else {
			return callback(err, true);
		}
	});
}

var addWallPost = function (data, callback) {
	//console.log("DATA ADD WALL POST")

	var params = {
		TableName: 'wallposts',
		Item: {
			'posterusername': { "S": data.posterusername.S },
			'postuniqueid': { "S": data.postuniqueid.S },
			'timestamp': { "S": data.timestamp.S },
			'content': { "S": data.content.S },
			'wallusername': { "S": data.wallusername.S },
			'flipped': { "BOOL": data.flipped.BOOL === 'true' }
		}
	};
	//console.log(params.Item)

	db.putItem(params, function (err, data) {
		//if err adding return false else return true
		if (err) {
			//console.log(err);
			return callback(err, false);
		} else {
			params.Item.flipped.BOOL = !(params.Item.flipped.BOOL);
			var temp = params.Item.posterusername.S
			params.Item.posterusername.S = params.Item.wallusername.S
			params.Item.wallusername.S = temp;
			//console.log(params.Item)
			db.putItem(params, function (err1, data) {
				if (err1) {
					//console.log(err1)
					callback(null, false)
				} else {
					//console.log("ADDED WALL POST TO TABLE")
					callback(err1, true)
				}
			})
		}
	});
}


var addStatusUpdate = function (data, callback) {
	////console.log(data)
	var params = {
		TableName: 'statusposts',
		Item: {
			'posterusername': { "S": data.posterusername.S },
			'postuniqueid': { "S": data.postuniqueid.S },
			'timestamp': { "S": data.timestamp.S },
			'content': { "S": data.content.S },
		}
	};

	db.putItem(params, function (err, data) {
		//if err adding return false else return true
		if (err) {
			//console.log(err);
			return callback(err, false);
		} else {
			return callback(err, true);
		}
	});
}

var addFriendshipposts = function (data, callback) {
	var params = {
		TableName: 'friendshipposts',
		Item: {
			'posterusername': { "S": data.posterusername },
			'postuniqueid': { "S": data.postuniqueid },
			'timestamp': { "S": data.timestamp },
			'friendofuser': { "S": data.friendofuser },
		}
	};

	db.putItem(params, function (err, data) {
		//if err adding return false else return true
		if (err) {
			//console.log(err);
			return callback(err, false);
		} else {
			var posterusername = params.Item.posterusername.S
			params.Item.posterusername.S = params.Item.friendofuser.S
			params.Item.friendofuser.S = posterusername
			db.putItem(params, function (err1, data1) {
				if (err1) {
					callback(err1, false);
				} else {
					callback(err1, true);
				}
			})
		}
	});
}

var getWallPostsWP = function (username, callback) {
	friendsSet = new Set()
	////console.log('Looking up: ' + username);
	var params = {
		TableName: "wallposts",
		KeyConditionExpression: "posterusername = :search",
		ExpressionAttributeValues: { ":search": { "S": username } }
	};

	getFriends(username, function (err1, friends) {
		if (err1) {
			//console.log(err1);
			callback(err1, null);
		}
		for (var i = 0; i < friends.length; i++) {
			friendsSet.add(friends[i].username2.S)
		}
		////console.log(result) 
		db.query(params, function (err, data) {
			var result = []
			if (err) {
				//console.log(err)
				callback(err, null);
			} else {

				for (var i = 0; i < data.Items.length; i++) {
					if (data.Items[i].wallusername.S == username ||
						(data.Items[i].flipped.BOOL &&
							friendsSet.has(data.Items[i].wallusername.S))) {
						result.push(data.Items[i]);
					}
				}
				result.sort(function(a, b) { 
					return parseInt(b.timestamp.S) - parseInt(a.timestamp.S);
				})
				callback(err, result)
			}
		});

		//efficeitnly sort here and send top "n" results, efficient sort could be linear here
		// (merge sort combine)	
	})
}

var getMyStatusPosts = function (username, callback) {
	var params = {
		TableName: "statusposts",
		KeyConditionExpression: "posterusername = :search",
		ExpressionAttributeValues: { ":search": { "S": username } }
	};
	db.query(params, function (err, data) {
		if (err) {
			callback(err, null);
		} else {
			data.Items.sort(function(a, b) { 
				return parseInt(b.timestamp.S) - parseInt(a.timestamp.S);
			})
			callback(err, data.Items);
		}
	})
}

var addFriend = function (data, callback) {
	var params = {
		TableName: 'friends',
		Item: {
			'username1': { "S": data.u1 },
			'username2': { "S": data.u2 },
			'timestamp': { "S": data.timestamp },
		}
	};

	db.putItem(params, function (err, data) {
		if (err) {
			//console.log(err);
			return callback(err, false);
		} else {
			var u1temp = params.Item.username1.S
			params.Item.username1.S = params.Item.username2.S
			params.Item.username2.S = u1temp
			db.putItem(params, function (err1, data1) {
				if (err1) {
					callback(err1, false);
				} else {
					callback(err1, true);
				}
			})
		}
	});

}

var removeFriend = function (data, callback) {
	var timestamp = '';
	var params = {
		TableName: "friends",
		KeyConditionExpression: "username1 = :search",
		ExpressionAttributeValues: { ":search": { "S": data.u1 } }
	};
	db.query(params, function (err, friends) {
		if (err) {
			//console.log(err);
			return callback(err, false);
		}
		for (var i = 0; i < friends.Items.length; i++) {
			if (friends.Items[i].username2.S == data.u2) {
				timestamp = friends.Items[i].timestamp.S;
				params = {
					TableName: 'friends',
					Key: {
						'username1': { "S": data.u1 },
						'timestamp': { "S": timestamp }
					}
				}
				//console.log(params);
				db.deleteItem(params, function (err, ret) {
					if (err) {
						//console.log(err)
						return callback(err, false);
					} else {
						params = {
							TableName: 'friends',
							Key: {
								'username1': { "S": data.u2 },
								'timestamp': { "S": timestamp }
							}
						}
						db.deleteItem(params, function (err2, rett) {
							if (err2) {
								//console.log(err2);
								return callback(err, false);
							} else {
								return callback(err, true);
							}
						})
					}
				});
			}
		}
		//return callback(err, true);

	})



}



/*
	DB function to get current affiliation of user
	
	Use Case:
	1) Called in "postUpdateAffiliation" route to check if affiliation is different
*/



var myDB_get_current_affiliation_of_user = function (username, callback) {


	var tableNameForItem = "users";
	var searchWordForItem = username;

	// params to call to AWS
	var params = {
		TableName: tableNameForItem,
		KeyConditionExpression: "#key = :searchword",
		ExpressionAttributeNames: {
			"#key": "username"
		},
		ExpressionAttributeValues: {
			":searchword": searchWordForItem
		}
	};

	docClient.query(params, function (err, data) {

		// checking not valid username
		if (err || data.Items.length == 0) {
			return callback(err, null);
		} else {

			////console.log(data.Items)
			//console.log(data.Items[0].affiliation)
			////console.log(data.Items[0].affiliation.S);

			var arrayPassedBack = [data.Items[0].affiliation];

			return callback(err, arrayPassedBack);
		}
	});

}



var myDB_get_current_news_categories_of_user = function (username, callback) {


	var tableNameForItem = "users";
	var searchWordForItem = username;

	// params to call to AWS
	var params = {
		TableName: tableNameForItem,
		KeyConditionExpression: "#key = :searchword",
		ExpressionAttributeNames: {
			"#key": "username"
		},
		ExpressionAttributeValues: {
			":searchword": searchWordForItem
		}
	};

	docClient.query(params, function (err, data) {

		// checking not valid username
		if (err || data.Items.length == 0) {
			return callback(err, null);
		} else {

			////console.log(data.Items)
			//console.log(data.Items[0].interests)

			//console.log(data.Items[0].interests.values)

			////console.log(data.Items[0].affiliation.S);

			var listOfCurrentNewsInterests = data.Items[0].interests.values;


			return callback(err, listOfCurrentNewsInterests);
		}
	});

}




/*
	DB function to add new account to the users table

	Use Case
	1) Sign up page - adding new account to the users table
	
*/



var myDB_add_account_into_user_table = function (username, hashpassword, firstname, lastname, emailaddress, affiliation,
	birthday, newsinterest1, newsinterest2) {

	//console.log('Adding account: ' + username);

	var table = "users";

	var usernameForItem = username;
	var passwordForItem = hashpassword;
	var emailaddressForItem = emailaddress;
	var affiliationForItem = affiliation;
	var birthdayForItem = birthday;
	var firstnameForItem = firstname;
	var lastnameForItem = lastname;


	// already made them upper case when I called function, but doing upper case just in case
	var newsinterest1ForItem = newsinterest1.toUpperCase();
	var newsinterest2ForItem = newsinterest2.toUpperCase();

	// this is how you create set in DynamoDB

	// var newsInterestSetForItem = docClient.createSet([newsinterest1ForItem, newsinterest2ForItem]);


	var newsInterestSetForItem = [newsinterest1ForItem, newsinterest2ForItem];
	
	var likedNewsArticlesSetForItem = ["none"];
	var likedSeenArticlesSetForItem = ["none"];

	// need to make the user to get logged in
	var params = {
		TableName: table,
		Item: {
			"username": { "S": usernameForItem },
			"password": { "S": passwordForItem },
			"firstname": { "S": firstnameForItem },
			"lastname": { "S": lastnameForItem },
			"email": { "S": emailaddressForItem },
			"affiliation": { "S": affiliationForItem },
			"birthday": { "S": birthdayForItem },
			"interests": { "SS": newsInterestSetForItem },
			"loggedin": { "BOOL": true },
			"likednewsarticles": { "SS": likedNewsArticlesSetForItem},
			"seenarticles": { "SS": likedSeenArticlesSetForItem}
		}
	};

	//console.log("Adding a new item...");
	db.putItem(params, function (err, data) {
		if (err) {
			//console.error("Unable to add item. Error JSON:", JSON.stringify(err, null, 2));
		} else {
			//console.log("Added item:", JSON.stringify(data, null, 2));
		}
	});

}


/*
	DB function to add new account to the user search table

	Use Case
	1) Sign up page - adding fullname and username to the user search table
	
*/

var myDB_add_account_into_user_search_table = function (firstname, lastname, username) {

	//console.log('Adding account into user search table: ' + username);

	var table = "usersearch";

	var fullNameForItem = firstname + " " + lastname;
	var userNameForItem = username;

	// need to make the user to get logged in
	var params = {
		TableName: table,
		Item: {
			"fullname": fullNameForItem,
			"username": userNameForItem,

		}
	};

	//console.log("Adding a new item...");
	docClient.put(params, function (err, data) {
		if (err) {
			//console.error("Unable to add item. Error JSON:", JSON.stringify(err, null, 2));
		} else {
			//console.log("Added item:", JSON.stringify(data, null, 2));
		}
	});

}


/*
	DB function to query user search table to show search suggestions

	Use Case
	1) Sign up page - adding fullname and username to the user search table
	
*/

var myDB_query_user_search_table_for_search_suggestions = function (currentsearch, callback) {

	//console.log("querying user search table");

	var table = "usersearch";

	// var SEARCH_KEYWORD = currentsearch;
	
	var tempSearchKeyword = currentsearch.charAt(0).toUpperCase() + currentsearch.slice(1);
	
	var SEARCH_KEYWORD = tempSearchKeyword;


	let params = {
		TableName: table,
		FilterExpression: "contains(#name, :searchname)",
		ExpressionAttributeNames: {
			"#name": "fullname",
		},
		ExpressionAttributeValues: {
			":searchname": SEARCH_KEYWORD,
		}
	};

	// the list containing all Item objects to be returned
	var allSearchResultsToBeReturned = [];

	//console.log("right before querying DB");
	docClient.scan(params, function (err, data) {

		//console.log(data);

		if (err || data.Items.length == 0) {
			return callback(err, null);
		} else {

			//console.log(data.Items);

			var counter = 0;
			data.Items.forEach(function (item) {

				var fullnametemp = item.fullname;
				var usernametemp = item.username;

				//console.log(fullnametemp);
				//console.log(usernametemp);

				var creatorTempObject = new Object();
				creatorTempObject.fullname = fullnametemp;
				creatorTempObject.username = usernametemp;

				// only return max 5 items
				if (counter < 5) {
					allSearchResultsToBeReturned.push(creatorTempObject);
				}

				counter = counter + 1;
			});


			return callback(err, allSearchResultsToBeReturned);
		}
	});

}


var myDB_get_friends_of_specified_user = function (specifiedUser, callback) {


	var tableNameForItem = "friends";
	var specifiedUserForItem = specifiedUser;

	// params to call to AWS
	var params = {
		TableName: tableNameForItem,
		KeyConditionExpression: "#key = :searchword",
		ExpressionAttributeNames: {
			"#key": "username1"
		},
		ExpressionAttributeValues: {
			":searchword": specifiedUserForItem
		}
	};

	docClient.query(params, function (err, data) {

		//console.log("inside of query");

		// checking not valid username
		if (err || data.Items.length == 0) {
			return callback(err, null);
		} else {

			////console.log(data.Items)
			//console.log(data.Items)

			var listOfFriendsUsernamesToBeReturned = new Array();

			data.Items.forEach(function (item) {

				var usernameOfFriend = item.username2;
				listOfFriendsUsernamesToBeReturned.push(usernameOfFriend);
			});

			//var arrayPassedBack = [data.Items[0].affiliation];

			//console.log(listOfFriendsUsernamesToBeReturned);
			return callback(err, listOfFriendsUsernamesToBeReturned);
		}

	});

}



var get_users = function(callback) {
    var params = {
        TableName: "users",
        AttributesToGet: ["username"]
    };

    db.scan(params, function (err, data) {
        if (err || data.Items.length == 0) {
            //console.log("ERROR");
            callback(err, null);
        } else {
            callback(err, data.Items);

        }
    });
}


var myDB_update_user_log_out = function (username) {

	var tableNameForItem = "users";
	var usernameToUpdateForItem = username;

	var params = {
		TableName: tableNameForItem,
		Key: {
			"username": usernameToUpdateForItem
		},
		UpdateExpression: "set loggedin = :r",
		ExpressionAttributeValues: {
			":r": false,
		},
		ReturnValues: "UPDATED_NEW"
	};

	docClient.update(params, function (err, data) {
		if (err) {
			//console.log("Update Failed")
		} else {
			//console.log("Update Success")
		}
	});
}


var getFriendsByUser = function (userName, callback) {
    var params = {
        KeyConditions: {
            username1: {
                ComparisonOperator: 'EQ',
                AttributeValueList: [{S: userName}]
            }
        },
        TableName: "friends",
        AttributesToGet: ['username2']
    };

    db.query(params, function (err, data) {
        if (err || data.Items.length == 0) {
            callback(err, null);
        } else {
            let friendNames = [];
            for (i = 0; i < data.Items.length; i++) {
                friendNames.push(data.Items[i]['username2']['S']);
            }
            callback(err, friendNames);
        }
    });
};

var getAllChatMessages = function (callback) {
    var params = {
        TableName: "messages",
        AttributesToGet: ["roomuniqueid", "timestamp", "sender", "content"]
    };

    db.scan(params, function (err, data) {
        if (err) {
            //console.log("ERROR in getAllChatMessages");
            callback(err, null);
        } else {
            callback(err, data.Items);

        }
    });
};

var getGroupChatRoomIdByParticipants = function (participants, callback) {
    const queryConvKey = participants.sort().join('__')
    var params = {
        TableName: "dm_or_groupchat",
        AttributesToGet: ["roomuniqueid", "member", "roomname"]
    };

    db.scan(params, function (err, data) {
        if (err || data.Items.length == 0) {
            //console.log("ERROR in getGroupChatRoomIdByParticipants");
            callback(err, null);
        } else {

            let roomIdToMembersMap = {};

            for (i = 0; i < data.Items.length; i++) {
                const item = data.Items[i];
                const member = item['member']['S'];
                const roomName = item['roomname']['S'];
                const roomUniqueId = item['roomuniqueid']['N'];

                if (roomUniqueId in roomIdToMembersMap) {
                    roomIdToMembersMap[roomUniqueId].push(member);
                } else {
                    roomIdToMembersMap[roomUniqueId] = [member];
                }
            }

            for (const [roomId, members] of Object.entries(roomIdToMembersMap)) {
                const convKey = members.sort().join('__');
                if (convKey === queryConvKey) {
                    callback(err, roomId);
                    return;
                }
            }
            callback(err, null);
        }
    });
}


var createGroupChatWithUsers = function(users, callback) {
    let putRequests = [];
    let newRoomId = Math.floor(Math.random() * 10000000).toString();
    for (i = 0; i < users.length; i++) {
        const req = {
            PutRequest: {
                Item: {
                    "roomuniqueid": {"N": newRoomId},
                    "member": {"S": users[i]},
                    "roomname": {"S": "test"}
                }
            }
        };

        putRequests.push(req);
    }


    var params = {
        RequestItems: {
            "dm_or_groupchat": putRequests
        }
    };

    db.batchWriteItem(params, function(err, data) {
        if (err) {
            //console.log("Error in createGroupChatWithUsers", err);
        } else {
            //console.log("Success", data);
            callback(newRoomId);
        }
    });


};

var getGroupChatRoomsByUser = function(userName, callback) {
    var params = {

        TableName: "dm_or_groupchat",
        AttributesToGet: ["roomuniqueid", "member", "roomname"]
    };



    db.scan(params, function (err, data) {
        if (err) {
            //console.log("ERROR in getGroupChatRoomsByUser");
            callback(err, null);
        } else {

            let results = {}; // keys: roomIds, value: string list of participant user names
            for (i = 0; i < data.Items.length; i++) {
                const roomId = parseInt(data.Items[i]['roomuniqueid']['N']);
                const member = data.Items[i]['member']['S'];
                const roomName = data.Items[i]['roomname']['S'];
                if (roomId in results){
                    results[roomId].push(member);
                }
                else{
                    results[roomId] = [member];
                }

            }
            let roomIdsToRemove = [];
            for (const [roomId, members] of Object.entries(results)) {
                if (!members.includes(userName)){
                    roomIdsToRemove.push(roomId);
                }
            }

            for(i=0;i<roomIdsToRemove.length;i++){
                delete results[roomIdsToRemove[i]];
            }

            callback(err, results);
        }
    });

};

var getHistoryByGroupChatId = function(roomId, callback) {
    var params = {
        KeyConditions: {
            roomuniqueid: {
                ComparisonOperator: 'EQ',
                AttributeValueList: [{N: roomId}]
            }
        },
        TableName: "messages",
        AttributesToGet: ["timestamp", "content", "sender"]
    };

    db.query(params, function (err, data) {
        if (err) {
            callback(err, null);
        } else {
            var results = [];
            for (i = 0; i< data.Items.length; i++){
                const content = data.Items[i]['content']['S']
                const sender = data.Items[i]['sender']['S']
                const timestamp = data.Items[i]['timestamp']['S']

                results.push({content: content, sender: sender, timestamp: timestamp});
            }


            callback(err, results);

        }
    });




};

var getParticipantsByGroupChatId = function(roomId, callback) {
    var params = {
        KeyConditions: {
            roomuniqueid: {
                ComparisonOperator: 'EQ',
                AttributeValueList: [{N: roomId}]
            }
        },
        TableName: "dm_or_groupchat",
        AttributesToGet: ["member"]
    };

    db.query(params, function (err, data) {
        if (err) {
            callback(err, null);
        } else {
            var results = [];
            for (i = 0; i< data.Items.length; i++){
                const member = data.Items[i]['member']['S']


                results.push(member);
            }


            callback(err, results);

        }
    });




};

var addMessage = function (roomId, fromUser, msg, timestamp, callback) {


    const formattedTimestamp = timestamp.getTime().toString();

    var params = {
        TableName: "messages",
        Item: {
            'roomuniqueid': {N: roomId},
            'timestamp': {S: formattedTimestamp},
            'content': {S: msg},
            'sender': {S: fromUser}
        }

    };

    db.putItem(params, function (err, data) {
        if (err) {
            //console.log(err);
            callback(err, null);
        } else {
            //console.log("Successful insert into messages table", data);
            callback(err, data);

        }
    });
}

var leaveChat = function(userName, roomId, callback){
    params = {
        TableName: 'dm_or_groupchat',
        Key: {
            'roomuniqueid': { "N": roomId},
            'member': {"S": userName}
        }
    }

    db.deleteItem(params, function(err, data) {
        if (err) {
            //console.error("Unable to delete item. Error JSON:", JSON.stringify(err, null, 2));
        } else {
            //console.log("DeleteItem succeeded:", JSON.stringify(data, null, 2));
            callback(roomId)
        }
    });
};

var addUsersToGroupChat = function(users, roomId, callback){
    let putRequests = [];
    for (i = 0; i < users.length; i++) {
        const req = {
            PutRequest: {
                Item: {
                    "roomuniqueid": {"N": roomId},
                    "member": {"S": users[i]},
                    "roomname": {"S": "test"}
                }
            }
        };

        putRequests.push(req);
    }


    var params = {
        RequestItems: {
            "dm_or_groupchat": putRequests
        }
    };

    db.batchWriteItem(params, function(err, data) {
        if (err) {
            //console.log("Error in createGroupChatWithUsers", err);
        } else {
            //console.log(`Successfully added users: ${users} to ${roomId}`);
            callback(users);
        }
    });
}

var getUserDetails = function(username, callback) {
	var params = {
		TableName: "users",
		KeyConditionExpression: "username = :search",
		ExpressionAttributeValues: { ":search": { "S": username } }
	};
	////console.log("LOOOKING UPPPPPP USERERRERERRE " + username)
	db.query(params, function(err, data) {
		if (err) {
			//console.log(err);
			callback(err, null);
		} else {
			abstract = {
				firstname : {"S" : data.Items[0].firstname.S},
				lastname : {"S" : data.Items[0].lastname.S},
				birthday : {"S" : data.Items[0].birthday.S},
				affiliation: {"S": data.Items[0].affiliation.S},
				interests : {"SS" : data.Items[0].interests.SS}
			}
			callback(err, abstract);
		}
	})
}


var database = {
	lookup_valid_username_and_password: myDB_lookup_check_valid_username_and_password,
	insert_new_account_into_user_table: myDB_add_account_into_user_table,
	insert_new_account_into_user_search_table: myDB_add_account_into_user_search_table,
	update_login_status_after_signing_in: myDB_update_login_status_after_signing_in,
	query_user_search_table_for_search_suggestions: myDB_query_user_search_table_for_search_suggestions,
	update_email: myDB_update_email,
	update_password: myDB_update_password,
	update_affiliation: myDB_update_affiliation,
	update_news_categories_field: myDB_update_news_categories_field,
	update_user_log_out: myDB_update_user_log_out,
	get_current_affiliation_of_user: myDB_get_current_affiliation_of_user,
	get_current_news_categories_of_user: myDB_get_current_news_categories_of_user,
	get_friends_of_specified_user: myDB_get_friends_of_specified_user,
	getWallPostsHP: getWallPostsHP,
	getFriendshipPosts: getFriendshipPosts,
	getOnlineFriends: getOnlineFriends,
	getFriendsStatusUpdates: getFriendsStatusUpdates,
	getWallPostsWP: getWallPostsWP,
	getMyStatusPosts: getMyStatusPosts,
	getComments: getComments,
	getFriends: getFriends,
	addWallPost: addWallPost,
	addComment: addComment,
	addFriendshipposts: addFriendshipposts,
	addStatusUpdate: addStatusUpdate,
	addFriend: addFriend,
	removeFriend: removeFriend,
	getUsers: get_users,
	getFriendsByUser: getFriendsByUser,
    getAllChatMessages: getAllChatMessages,
    getGroupChatRoomIdByParticipants: getGroupChatRoomIdByParticipants,
    createGroupChatWithUsers: createGroupChatWithUsers,
    getGroupChatRoomsByUser: getGroupChatRoomsByUser,
    getHistoryByGroupChatId: getHistoryByGroupChatId,
    addMessage: addMessage,
    getParticipantsByGroupChatId: getParticipantsByGroupChatId,
    leaveChat: leaveChat,
    addUsersToGroupChat: addUsersToGroupChat,
	getUserDetails: getUserDetails
};

module.exports = database;

