var express = require('express');
var routes = require('./routes/routes.js');
var app = express();
const path = require("path");
const JSON5 = require("json5");
const stemmer = require("stemmer");
var session = require('express-session')
app.use(express.urlencoded());


// routes
app.get('/', routes.get_main);
app.get('/newsarticleresults', routes.search_for_articles);
app.post('/likingarticle', routes.liking_article_user)
app.post('/dislikingarticle', routes.disliking_article_user)
app.get('/userlookup', routes.user_table_search)
app.post('/likingarticlecount', routes.liking_article_count)
app.post('/dislikingarticlecount', routes.disliking_article_count)
app.get('/blank', routes.blank)
app.post('/spark', routes.spark)
app.post('/updateinterest', routes.update_interests)

function runSparkJobPeriodically() {
	var exec = require("child_process").exec;
	exec('mvn exec:java@livy', function(error, stdOut, stdErr) {
		console.log("Running")
		console.log(error)
			console.log(stdOut)
		console.log(stdErr)
	
	});
}

/*setTimeout(() => {
	// 3,600,000 = 1 hr
	runSparkJobPeriodically()}, 10000
)*/

// run server
console.log('Author: Raymon Shi (raymons)');
app.listen(8080);
console.log('Server running on port 8080. Now open http://localhost:8080/ in your browser!');
