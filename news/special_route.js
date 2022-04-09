var get_blank = function (req, res) {
/*const client = new LivyClient({ host: 'ec2-18-234-103-201.compute-1.amazonaws.com' });
		   client.postBatch({file: "s3://aws-logs-595147303869-us-east-1/livyspark.jar", className: "edu.upenn.cis.nets212.hw3.ComputeRanks"}, (err, res) => {
		    // will create a spark session by default
		    console.log("res: ", res); 
		});*/
		
var exec = require("child_process").exec;
exec('mvn exec:java@livy', function(error, stdOut, stdErr) {
	console.log("Running")
	console.log(error)
		console.log(stdOut)
	console.log(stdErr)

});

	
	res.render("blank.ejs")
}

var special_route = {
  blank: get_blank
};

module.exports = special_route;
