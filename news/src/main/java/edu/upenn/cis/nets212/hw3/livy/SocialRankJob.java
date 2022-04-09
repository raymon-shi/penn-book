package edu.upenn.cis.nets212.hw3.livy;

import com.amazonaws.services.dynamodbv2.document.*;
import com.amazonaws.services.dynamodbv2.document.spec.ScanSpec;
import com.amazonaws.services.dynamodbv2.model.*;
import com.google.common.collect.Lists;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import edu.upenn.cis.nets212.config.Config;
import edu.upenn.cis.nets212.storage.DynamoConnector;
import edu.upenn.cis.nets212.storage.SparkConnector;
import org.apache.livy.Job;
import org.apache.livy.JobContext;
import org.apache.spark.api.java.JavaPairRDD;
import org.apache.spark.api.java.JavaRDD;
import org.apache.spark.api.java.JavaSparkContext;
import org.apache.spark.sql.Row;
import org.apache.spark.sql.SparkSession;
import org.apache.spark.sql.catalyst.expressions.GenericRowWithSchema;
import org.apache.spark.sql.types.ArrayType;
import org.apache.spark.sql.types.StructType;
import scala.Tuple2;
import scala.Tuple3;
import scala.Tuple5;

import java.io.IOException;
import java.text.ParseException;
import java.text.SimpleDateFormat;
import java.util.*;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.Collectors;
import java.util.stream.Stream;

public class SocialRankJob implements Job<List<MyPair<String, Tuple2<Tuple3<String, String, Double>, String>>>> {
    /**
     *
     */
    private static final long serialVersionUID = 1L;

    /**
     * Connection to Apache Spark
     */
    SparkSession spark;

    JavaSparkContext context;

    private boolean useBacklinks;

    private String source;
    DynamoDB db;


    /**
     * Initialize the database connection and open the file
     *
     * @throws IOException
     * @throws InterruptedException
    //    * @throws DynamoDbException
     */
    public void initialize() throws IOException, InterruptedException {
        System.out.println("Connecting to Spark...");
        spark = SparkConnector.getSparkConnection();
        context = SparkConnector.getSparkContext();
        db = DynamoConnector.getConnection(Config.DYNAMODB_URL);
        System.out.println("Connected!");
    }

    final StructType rowSchemaArticle = new StructType()
            .add("author", "string")
            .add("category", "string")
            .add("date", "date")
            .add("headline", "string")
            .add("link", "string")
            .add("description", "string");

    static Row createRowArticle(List<String> jsonList, StructType schema) {
        String[] jsonArray = new String[jsonList.size()];
        jsonArray = jsonList.toArray(jsonArray);
        Object[] row = new Object[jsonArray.length];

        int[] indexString = {0, 1, 3, 4, 5};
        int[] indexDate = {2};
        for (int i = 0; i < indexString.length; i++) {
            row[indexString[i]] = jsonArray[indexString[i]];
        }
        for (int i = 0; i < indexDate.length; i++) {
            try {
                SimpleDateFormat articleDateFormat = new SimpleDateFormat("yyyy-MM-dd");
                articleDateFormat.setTimeZone(TimeZone.getTimeZone("EST"));
                Date articleDate = articleDateFormat.parse(jsonArray[indexDate[i]]);
                Calendar cal = Calendar.getInstance(TimeZone.getTimeZone("EST"));
                cal.setTime(articleDate);
                cal.add(Calendar.YEAR, 4);
                Date newArticleDate = cal.getTime();
                row[indexDate[i]] = new Date(newArticleDate.getTime());
            } catch (ParseException e) {
                e.printStackTrace();
            }
        }

        return new GenericRowWithSchema(row, schema);
    }


    JavaRDD<Row> getJSONArticles(String filePath) {
        // note: there are only 200,853 articles
        // used to store each json line
        List<List<String>> rowArrayList = new ArrayList<List<String>>();
        // used to store each row object
        List<Row> rowList = new ArrayList<Row>();
        // format: 0 -> author; 1 -> Category; 2 -> Date; 3 -> Headline; 4 -> Link; 5 -> Description
        JavaRDD<String> rowOfItems = context
                .textFile(filePath);

        rowOfItems.collect().forEach(item -> {
            JsonObject jsonObjectOfLine = new JsonParser().parse(item).getAsJsonObject();
            String author = jsonObjectOfLine.get("authors").getAsString();
            String category = jsonObjectOfLine.get("category").getAsString();
            String date = jsonObjectOfLine.get("date").getAsString();
            String headline = jsonObjectOfLine.get("headline").getAsString();
            String link = jsonObjectOfLine.get("link").getAsString();
            String description = jsonObjectOfLine.get("short_description").getAsString();

            String[] jsonRowArray = {author, category, date, headline, link, description};
            rowArrayList.add(Arrays.asList(jsonRowArray));
        });

//
        // convert list of string arrays into list of rows
        rowArrayList.forEach(listOfString -> {
            Stream<String> stringStream = listOfString.stream();
            Stream<Row> rowStream = stringStream.map(line -> createRowArticle(listOfString, rowSchemaArticle));
            rowList.add(rowStream.collect(Collectors.toList()).get(0));
        });

        // now dates are sql.date objects and +4 years
        return context.parallelize(rowList);
    }


    final StructType rowSchemaUser = new StructType()
            .add("username", "string")
            .add("interests", new ArrayType())
            .add("likednewsarticles", new ArrayType())
            .add("seenarticles", new ArrayType());

    static Row createRowUser(List<List<String>> userList, StructType schema) {
        Object[] userArray = new Object[userList.size()];
        userArray = userList.toArray(userArray);
        Object[] row = new Object[userArray.length];
        String username = userList.get(0).get(0);
        List<String> interests = userList.get(1);
        while (interests.size() < 2) {
            interests.add("none");
        }
        List<String> likedArticles = userList.get(2);
        List<String> seenNewsArticles = userList.get(3);

        row[0] = username;
        row[1] = interests;
        row[2] = likedArticles;
        row[3] = seenNewsArticles;

        return new GenericRowWithSchema(row, schema);
    }

    JavaRDD<Row> getUsers() {
        Table users = db.getTable("UsersTable");
        ItemCollection<ScanOutcome> itemsScanned = users.scan(new ScanSpec());

        List<Row> userRowList = new ArrayList<Row>();
        List<List<List<String>>> itemListList = new ArrayList<List<List<String>>>();

        itemsScanned.forEach(item -> {
            // user properties needed for rdd
            List<String> username = new ArrayList<String>(Collections.singleton(item.get("username").toString()));
            List<String> interest = new ArrayList<>(item.getStringSet("interests"));
            List<String> likednewsarticles = new ArrayList<>(item.getStringSet("likednewsarticles"));
            List<String> seenarticles = new ArrayList<>(item.getStringSet("seenarticles"));

            // send the properties to a list
            List<List<String>> userProperty = new ArrayList<>();
            userProperty.add(username);
            userProperty.add(interest);
            userProperty.add(likednewsarticles);
            userProperty.add(seenarticles);

            itemListList.add(userProperty);
        });

        itemListList.forEach(userList -> {
            // make the rows with a specific schema
            Stream<List<String>> userStringStream = userList.stream();
            Stream<Row> userRowStream = userStringStream.map(line -> createRowUser(userList, rowSchemaUser));
            userRowList.add(userRowStream.collect(Collectors.toList()).get(0));
        });
        return context.parallelize(userRowList);
    }

    // schema for friend relationship rdd
    final StructType rowSchemaFriend = new StructType()
            .add("username1", "string")
            .add("timestamp", "string")
            .add("username2", "string");

    // creates the friend relationship rdd
    static Row createRowFriend(List<String> friendList, StructType schema) {
        String[] friendArray = new String[friendList.size()];
        friendArray = friendList.toArray(friendArray);
        Object[] row = new Object[friendArray.length];

        int[] indexString = {0, 1, 2};
        for (int i = 0; i < indexString.length; i++) {
            row[indexString[i]] = friendArray[indexString[i]];
        }
        return new GenericRowWithSchema(row, schema);
    }

    // returns a row RDD of friend relationships
    JavaRDD<Row> getFriends() {
        Table friends = db.getTable("FriendshipTable");
        ItemCollection<ScanOutcome> itemsScanned = friends.scan(new ScanSpec());
        List<Row> friendRowList = new ArrayList<Row>();
        List<List<String>> friendsListList = new ArrayList<List<String>>();

        itemsScanned.forEach(item -> {
            String currentUser = item.get("username1").toString();
            String timestamp = item.get("timestamp").toString();
            String friend = item.get("username2").toString();

            String[] friendsRelationProperty = {currentUser, timestamp, friend};
            friendsListList.add(Arrays.asList(friendsRelationProperty));
        });

        friendsListList.forEach(friendList -> {
            Stream<String> friendStringStream = friendList.stream();
            Stream<Row> friendRowStream = friendStringStream.map(line -> createRowFriend(friendList, rowSchemaFriend));
            friendRowList.add(friendRowStream.collect(Collectors.toList()).get(0));
        });

        JavaRDD<Row> friendRowRDD = context.parallelize(friendRowList);

        return friendRowRDD;
    }

    /**
     * Main functionality in the program: read and process the social network
     *
     * @throws IOException          File read, network, and other errors
     * @throws InterruptedException User presses Ctrl-C
     */
    public List<MyPair<String, Tuple2<Tuple3<String, String, Double>, String>>> run() throws IOException, InterruptedException {
        // set the timezone to EST
        TimeZone.setDefault(TimeZone.getTimeZone("EST"));

        // rdd with article information
        SimpleDateFormat filterFormatter = new SimpleDateFormat("E MMM dd HH:mm:ss Z yyyy");
        
        // fetch articles and filter by date
        JavaRDD<Row> articles = getJSONArticles(Config.NEWS_S3_PATH)
                .filter(article -> new Date(filterFormatter.parse(article.getAs("date").toString()).getTime()).before(new Date(new Date().getTime())) ||
                        new Date(filterFormatter.parse(article.getAs("date").toString()).getTime()).equals(new Date(new Date().getTime())));
        
        JavaPairRDD<String, Tuple2<String, String>> categoryArticlePair = articles
                .mapToPair(article -> new Tuple2<String, Tuple2<String, String>>(article.getAs("category"), new Tuple2<String, String>(article.getAs("link"), article.getAs("headline"))));

        // rdd with of row user(username, list<interests>)
        JavaRDD<Row> users = getUsers();
        // make a pair rdd of username, list<interest>
        JavaPairRDD<String, List<String>> usersAndInterests = users.mapToPair(rowUser -> new Tuple2<String, List<String>>(rowUser.getString(0), rowUser.getAs("interests")));
        JavaRDD<List<String>> userInterestEdgesPairs = usersAndInterests
                .flatMap(userInterest -> {
                    Iterator<List<String>> output = userInterest
                            ._2()
                            .stream()
                            .map(interest -> Arrays.asList(userInterest._1, interest))
                            .iterator();
                    return output;
                });
        // make each user-interest a row in the pair rdd
        JavaPairRDD<String, String> userInterestEdges = userInterestEdgesPairs
                .mapToPair(user -> new Tuple2<String, String>(user.get(0), user.get(1)))
                .filter(userInterestPair -> !Objects.equals(userInterestPair._2, "none"))
                .distinct(Config.PARTITIONS);
        
        userInterestEdges.sortByKey().collect().forEach(x -> System.out.println(x + " WHAT IS X CATEGORY?"));

        // make a pair rdd of username, list<likedArticleLinks>
        JavaPairRDD<String, List<String>> usersAndArticleLiked = users
                .mapToPair(rowUser -> new Tuple2<String, List<String>>(rowUser.getString(0), rowUser.getAs("likednewsarticles")));
        // make a rdd of username, articleLink arrays for each
        JavaRDD<List<String>> userAndArticleLinkPairs = usersAndArticleLiked
                .flatMap(userArticle -> {
                    // make a list iterator for each username, link pair
                    Iterator<List<String>> output = userArticle
                            // get the list of article links
                            ._2()
                            // convert the list into a stream, so we can map it
                            .stream()
                            // create a list with username, articleLink
                            .map(articleLink -> Arrays.asList(userArticle._1(), articleLink))
                            // make an iterator because that's what flatmap needs to return
                            .iterator();
                    return output;
                });

        // convert the previous rdd<list<string>> into a pair rdd <string, string> for username, link
        JavaPairRDD<String, String> userArticlePairRDD = userAndArticleLinkPairs
                .mapToPair(user -> new Tuple2<String, String>(user.get(0), user.get(1)))
                // if the second item is none, then that means that the user has no articles
                .filter(userPair -> !Objects.equals(userPair._2(), "none"))
                // just in case, we only want distinct pairs
                .distinct(Config.PARTITIONS);

        // get the friend pairs
        JavaRDD<Row> friends = getFriends();

        JavaPairRDD<String, String> userToFriendPairRDD = friends
                .mapToPair(user -> new Tuple2<String, String>(user.getAs("username1").toString(), user.getAs("username2").toString()))
                .distinct(Config.PARTITIONS);


        // get the counts
        // each category and how many articles they're connected to
        JavaPairRDD<String, Tuple2<Integer, String>> categoryArticleCount = categoryArticlePair
                .mapToPair(cat -> new Tuple2<>(cat._1(), 1))
                .reduceByKey((x, y) -> x + y, Config.PARTITIONS)
                .mapToPair(category -> new Tuple2<String, Tuple2<Integer, String>>(category._1, new Tuple2<Integer, String>(category._2, "category-to-article-connections")));

        JavaRDD<String> listOfAllCategories = categoryArticlePair.map(category -> category._1);
        JavaRDD<String> listOfAllUsers = users.map(user -> user.getAs("username"));

        // category connected to how many users
        JavaPairRDD<String, Tuple2<Integer, String>> categoryToUserCount = userInterestEdges
                .mapToPair(userEdge -> new Tuple2<String, Integer>(userEdge._2(), 1))
                .reduceByKey((categoryPairX, categoryPairY) -> categoryPairX + categoryPairY, Config.PARTITIONS)
                .union(listOfAllCategories.mapToPair(user -> new Tuple2<String, Integer>(user, 0)).subtractByKey(userInterestEdges.mapToPair(category -> new Tuple2<String, String>(category._2, category._1)), Config.PARTITIONS))
                .mapToPair(category -> new Tuple2<String, Tuple2<Integer, String>>(category._1, new Tuple2<Integer, String>(category._2, "category-to-user-connections")));

        // users connected to how many categories
        JavaPairRDD<String, Tuple2<Integer, String>> userToCategoryCount = userInterestEdges
                .mapToPair(userEdge -> new Tuple2<String, Integer>(userEdge._1(), 1))
                .reduceByKey((userPairX, userPairY) -> userPairX + userPairY, Config.PARTITIONS)
                .union(listOfAllUsers.mapToPair(user -> new Tuple2<String, Integer>(user, 0)).subtractByKey(userInterestEdges, Config.PARTITIONS))
                .mapToPair(user -> new Tuple2<String, Tuple2<Integer, String>>(user._1, new Tuple2<Integer, String>(user._2, "user-to-category-connection")));

        // users connected to how many articles
        JavaPairRDD<String, Tuple2<Integer, String>> userArticleLikedCount = userArticlePairRDD
                .mapToPair(userArticle -> new Tuple2<String, Integer>(userArticle._1(), 1))
                .reduceByKey((x, y) -> x + y, Config.PARTITIONS)
                .union(listOfAllUsers.mapToPair(user -> new Tuple2<String, Integer>(user, 0)).subtractByKey(userArticlePairRDD.mapToPair(user -> new Tuple2<String, Integer>(user._1, 0)), Config.PARTITIONS))
                .mapToPair(user -> new Tuple2<String, Tuple2<Integer, String>>(user._1, new Tuple2<Integer, String>(user._2, "user-to-article-connection")));

        // users connected to how many other users
        JavaPairRDD<String, Tuple2<Integer, String>> userToFriendCount = userToFriendPairRDD
                .mapToPair(userFriend -> new Tuple2<String, Integer>(userFriend._1(), 1))
                .reduceByKey((x, y) -> x + y, Config.PARTITIONS)
                .union(listOfAllUsers.mapToPair(user -> new Tuple2<String, Integer>(user, 0)).subtractByKey(userToFriendPairRDD.mapToPair(user -> new Tuple2<String, Integer>(user._1, 0)), Config.PARTITIONS))
                .mapToPair(user -> new Tuple2<String, Tuple2<Integer, String>>(user._1, new Tuple2<Integer, String>(user._2, "user-to-user-connection")));

        // articles connected to how many categories
        JavaPairRDD<String, Integer> articleToCategoryCount = categoryArticlePair
                .mapToPair(article -> new Tuple2<String, String>(article._2()._1(), article._1()))
                .distinct(Config.PARTITIONS)
                .mapToPair(article -> new Tuple2<String, Integer>(article._1(), 1))
                .reduceByKey((x, y) -> x + y, Config.PARTITIONS);

        // articles connected to how many users
        JavaPairRDD<String, Integer> articleToUserCount = userArticlePairRDD
                .mapToPair(articlePair -> new Tuple2<String, String>(articlePair._2(), articlePair._1()))
                .mapToPair(articlePair -> new Tuple2<String, Integer>(articlePair._1(), 1))
                .reduceByKey((x, y) -> x + y, Config.PARTITIONS);

        // shows how the different nodes that users are connected to
        JavaPairRDD<String, Tuple2<Tuple2<Tuple2<Integer, String>, Tuple2<Integer, String>>, Tuple2<Integer, String>>> allUserOutwardConnectionCount = userToCategoryCount
                .join(userToFriendCount, Config.PARTITIONS)
                .join(userArticleLikedCount, Config.PARTITIONS);

        // shows how the different nodes that categories are connected to
        JavaPairRDD<String, Tuple2<Tuple2<Integer, String>, Tuple2<Integer, String>>> allCategoryOutwardConnectionCount = categoryToUserCount
                .join(categoryArticleCount, Config.PARTITIONS);

        // shows how the different nodes that articles are connected to
        JavaPairRDD<String, Integer> articleOutwardCount = articleToCategoryCount
                .union(articleToUserCount)
                .reduceByKey((x, y) -> x + y, Config.PARTITIONS)
                .distinct(Config.PARTITIONS);

        // calculates how much weight goes from category to user
        JavaPairRDD<String, Double> categoryToUserWeights = allCategoryOutwardConnectionCount
                .mapToPair(category -> {
                    if (category._2._1._1 == 0) {
                        return new Tuple2<String, Double>(category._1, 0.0);
                    }
                    return new Tuple2<String, Double>(category._1, 0.5 / category._2._1._1);
                });

        // calculates how much weight goes from category to article
        JavaPairRDD<String, Double> categoryToArticleWeights = allCategoryOutwardConnectionCount
                .mapToPair(category -> {
                    if (category._2._1._1 == 0) {
                        return new Tuple2<String, Double>(category._1, 1.0 / category._2._2._1);
                    }
                    return new Tuple2<String, Double>(category._1, 0.5 / category._2._2._1);
                });

        // calculates how much weight goes from user to category; accounts for edge cases; scale other weights
        JavaPairRDD<String, Double> userToCategoryWeights = allUserOutwardConnectionCount
                .mapToPair(user -> {
                    if (user._2._1._1._1 == 0) {
                        return new Tuple2<String, Double>(user._1, 0.0);
                    }
                    // if user -> cat > 0, user -> user > 0, user -> art > 0
                    if (user._2._1._1._1 > 0 && user._2._1._2._1 > 0 && user._2._2._1 > 0) {
                        double scaledUserToCategoryWeight = 0.3;
                        return new Tuple2<String, Double>(user._1, scaledUserToCategoryWeight / user._2._1._1._1);
                    }
                    // if user -> cat > 0, user -> user = 0, user -> art = 0
                    if (user._2._1._1._1 > 0 && user._2._1._2._1 == 0 && user._2._2._1 == 0) {
                        return new Tuple2<String, Double>(user._1, 1.0 / user._2._1._1._1);
                    }
                    // if user -> cat > 0, user -> user > 0, user -> art = 0
                    if (user._2._1._1._1 > 0 && user._2._1._2._1 > 0 && user._2._2._1 == 0) {
                        double scaledUserToCategoryWeight = 0.3 / 0.6;
                        return new Tuple2<String, Double>(user._1, scaledUserToCategoryWeight / user._2._1._1._1);
                    }
                    // if user -> cat > 0, user -> user = 0, user -> art > 0
                    if (user._2._1._1._1 > 0 && user._2._1._2._1 == 0 && user._2._2._1 > 0) {
                        double scaledUserToCategoryWeight = 0.3 / 0.7;
                        return new Tuple2<String, Double>(user._1, scaledUserToCategoryWeight / user._2._1._1._1);
                    }

                    System.out.println("it should not reach here in userToCategoryWeights");
                    return new Tuple2<String, Double>(user._1, 0.3 / user._2._1._1._1);
                });

        // calculates how much weight goes from user to articles; accounts for edge cases; scale other weights
        JavaPairRDD<String, Double> userToLikedArticleWeights = allUserOutwardConnectionCount
                .mapToPair(user -> {
                    // if user -> art = 0
                    if (user._2._2._1 == 0) {
                        return new Tuple2<String, Double>(user._1, 0.0);
                    }
                    // user -> art > 0; user -> cat > 0; user -> user > 0
                    if (user._2._2._1 > 0 && user._2._1._1._1 > 0 && user._2._1._2._1 > 0) {
                        double scaledUserToArticleWeight = 0.4;
                        return new Tuple2<String, Double>(user._1, scaledUserToArticleWeight / user._2._2._1);
                    }
                    // user -> art > 0; user -> cat = 0; user -> user = 0
                    if (user._2._2._1 > 0 && user._2._1._1._1 == 0 && user._2._1._2._1 == 0) {
                        return new Tuple2<String, Double>(user._1, 1.0 / user._2._2._1);
                    }
                    // user -> art > 0; user -> cat > 0; user -> user = 0
                    if (user._2._2._1 > 0 && user._2._1._1._1 > 0 && user._2._1._2._1 == 0) {
                        double scaledUserToArticleWeight = 0.4 / 0.7;
                        return new Tuple2<String, Double>(user._1, scaledUserToArticleWeight / user._2._2._1);
                    }
                    // user -> art > 0; user -> cat = 0; user -> user > 0
                    if (user._2._2._1 > 0 && user._2._1._1._1 == 0 && user._2._1._2._1 > 0) {
                        double scaledUserToArticleWeight = 0.4 / 0.7;
                        return new Tuple2<String, Double>(user._1, scaledUserToArticleWeight / user._2._2._1);
                    }

                    System.out.println("it should not reach here in userToArticleWeights");
                    return new Tuple2<String, Double>(user._1, 0.4 / user._2._2._1);
                });

        // calculates how much weight goes from user to other users; accounts for edge cases; scale other weights
        JavaPairRDD<String, Double> userToFriendWeights = allUserOutwardConnectionCount
                .mapToPair(user -> {
                    // user -> user = 0
                    if (user._2._1._2._1 == 0) {
                        return new Tuple2<String, Double>(user._1, 0.0);
                    }
                    // user -> user > 0; user -> cat = 0; user -> article = 0
                    if (user._2._1._2._1 > 0 && user._2._1._1._1 == 0 && user._2._2._1 == 0) {
                        return new Tuple2<String, Double>(user._1, 1.0 / user._2._1._2._1);
                    }
                    // user -> user > 0; user -> cat > 0; user -> article = 0
                    if (user._2._1._2._1 > 0 && user._2._1._1._1 > 0 && user._2._2._1 == 0) {
                        double scaledUserToFriendWeight = 0.3 / 0.6;
                        return new Tuple2<String, Double>(user._1, scaledUserToFriendWeight / user._2._1._2._1);
                    }
                    // user -> user > 0; user -> cat = 0; user -> article > 0
                    if (user._2._1._2._1 > 0 && user._2._1._1._1 == 0 && user._2._2._1 > 0) {
                        double scaledUserToFriendWeight = 0.3 / 0.7;
                        return new Tuple2<String, Double>(user._1, scaledUserToFriendWeight / user._2._1._2._1);
                    }
                    // user -> user > 0; user -> cat > 0; user -> article > 0
                    if (user._2._1._2._1 > 0 && user._2._1._1._1 > 0 && user._2._2._1 > 0) {
                        double scaledUserToFriendWeight = 0.3;
                        return new Tuple2<String, Double>(user._1, scaledUserToFriendWeight / user._2._1._2._1);
                    }
                    System.out.println("it should not reach here in userToFriendWeights");
                    return new Tuple2<String, Double>(user._1, 0.3 / user._2._1._2._1);

                });

        // calculates how much weight goes from article to user/category
        JavaPairRDD<String, Double> articleToOutwardWeight = articleOutwardCount
                .mapToPair(article -> new Tuple2<String, Double>(article._1(), 1.0 / article._2()));

        JavaRDD<String> individualUserRDD = users.map(user -> user.getAs("username"));
        // makes user user-weight labels
        JavaPairRDD<String, Tuple3<String, String, Double>> userUserWeightLabel = individualUserRDD
                .cartesian(individualUserRDD)
                .mapToPair(user -> {
                    if (Objects.equals(user._1, user._2)) {
                        return new Tuple2<String, Tuple3<String, String, Double>>(user._1, new Tuple3<String, String, Double>("user", user._2, 1.0));
                    }
                    return new Tuple2<String, Tuple3<String, String, Double>>(user._1, new Tuple3<String, String, Double>("user", user._2, 0.0));
                });

        JavaRDD<String> individualCategoryRDD = userInterestEdges
                .map(interestEdge -> interestEdge._2)
                .union(categoryArticlePair.map(category -> category._1))
                .distinct(Config.PARTITIONS);

        // makes category user-weight labels
        JavaPairRDD<String, Tuple3<String, String, Double>> categoryUserWeightLabel = individualCategoryRDD
                .cartesian(individualUserRDD)
                .mapToPair(category -> new Tuple2<String, Tuple3<String, String, Double>>(category._1, new Tuple3<String, String, Double>("category", category._2, 0.0)));

        JavaRDD<String> allCategoryArticle = categoryArticlePair.map(article -> article._2._1);

        JavaRDD<String> individualArticleRDD = userArticlePairRDD
                .map(article -> article._2)
                .union(allCategoryArticle)
                .distinct(Config.PARTITIONS);

        // makes article user-weight labels
        JavaPairRDD<String, Tuple3<String, String, Double>> articleUserWeightLabel = individualArticleRDD
                .cartesian(individualUserRDD)
                .mapToPair(article -> new Tuple2<String, Tuple3<String, String, Double>>(article._1, new Tuple3<String, String, Double>("article", article._2, 0.0)));

        // compile all the nodes user-weight labels together
        JavaPairRDD<String, Tuple3<String, String, Double>> iterationUserWeightLabel = userUserWeightLabel
                .union(categoryUserWeightLabel)
                .union(articleUserWeightLabel);

        // edge transfers
        // user transfers
        JavaPairRDD<String, Tuple2<Double, String>> edgeTransferForUserToUser = userToFriendWeights
                .join(userToFriendPairRDD, Config.PARTITIONS)
                .mapToPair(user -> new Tuple2<String, Tuple2<Double, String>>(user._2._2, new Tuple2<Double, String>(user._2._1, user._1)));

        JavaPairRDD<String, Tuple2<Double, String>> edgeTransferForUserToCategory = userToCategoryWeights
                .join(userInterestEdges, Config.PARTITIONS)
                .mapToPair(category -> new Tuple2<String, Tuple2<Double, String>>(category._2._2, new Tuple2<Double, String>(category._2._1, category._1)));

        JavaPairRDD<String, Tuple2<Double, String>> edgeTransferForUserToArticle = userToLikedArticleWeights
                .join(userArticlePairRDD, Config.PARTITIONS)
                .mapToPair(article -> new Tuple2<String, Tuple2<Double, String>>(article._2._2, new Tuple2<Double, String>(article._2._1, article._1)));

        // category transfers
        JavaPairRDD<String, Tuple2<Double, String>> edgeTransferForCategoryToUser = categoryToUserWeights
                .join(userInterestEdges.mapToPair(user -> new Tuple2<String, String>(user._2, user._1)), Config.PARTITIONS)
                .mapToPair(user -> new Tuple2<String, Tuple2<Double, String>>(user._2._2, new Tuple2<Double, String>(user._2._1, user._1)));

        JavaPairRDD<String, Tuple2<Double, String>> edgeTransferForCategoryToArticle = categoryToArticleWeights
                .join(categoryArticlePair.mapToPair(article -> new Tuple2<String, String>(article._1, article._2._1())), Config.PARTITIONS)
                .mapToPair(article -> new Tuple2<String, Tuple2<Double, String>>(article._2._2, new Tuple2<Double, String>(article._2._1, article._1)));


        // article transfers
        JavaPairRDD<String, Tuple2<Double, String>> edgeTransferForArticleToUser = articleToOutwardWeight
                .join(userArticlePairRDD.mapToPair(user -> new Tuple2<String, String>(user._2, user._1)), Config.PARTITIONS)
                .mapToPair(user -> new Tuple2<String, Tuple2<Double, String>>(user._2._2, new Tuple2<Double, String>(user._2._1, user._1)));

        JavaPairRDD<String, Tuple2<Double, String>> edgeTransferForArticleToCategory = articleToOutwardWeight
                .join(categoryArticlePair.mapToPair(category -> new Tuple2<String, String>(category._2._1, category._1)), Config.PARTITIONS)
                .mapToPair(category -> new Tuple2<String, Tuple2<Double, String>>(category._2._2, new Tuple2<Double, String>(category._2._1, category._1)));

        // all edge transfers compiled together
        JavaPairRDD<String, Tuple2<Double, String>> allEdgeTransfers = edgeTransferForUserToUser
                .union(edgeTransferForCategoryToUser.distinct())
                .union(edgeTransferForArticleToUser.distinct())
                .union(edgeTransferForUserToCategory.distinct())
                .union(edgeTransferForArticleToCategory.distinct())
                .union(edgeTransferForUserToArticle.distinct())
                .union(edgeTransferForCategoryToArticle.distinct());

        // used to check for convergence to stop early
        boolean convergenceChecker = false;
        double convergenceValue = 0.05;

        // for loop things
        for (int i = 0; i < 15; i++) {
            if (convergenceChecker) {
                System.out.println("Convergence was reached!");
                break;
            }

            // calculate new weights
            JavaPairRDD<Tuple3<String, String, String>, Double> joinedTogether = iterationUserWeightLabel
                    .join(allEdgeTransfers, Config.PARTITIONS)
                    .mapToPair(together -> new Tuple2<String, Tuple2<Tuple3<String, String, Double>, Tuple2<Double, String>>>(together._2._2._2, new Tuple2<Tuple3<String, String, Double>, Tuple2<Double, String>>(
                            new Tuple3<String, String, Double>(together._2._1._1(), together._2._1._2(), together._2._1._3()), new Tuple2<Double, String>(together._2._2._1, together._1)
                    )))
                    .mapToPair(x -> new Tuple2<Tuple2<String, String>, Tuple2<Tuple3<String, String, Double>, Tuple2<Double, String>>>(
                            new Tuple2<String, String>(x._1, x._2._1._2()), new Tuple2<Tuple3<String, String, Double>, Tuple2<Double, String>>(new Tuple3<String, String, Double>(x._2._1._1(), x._2._1._2(), x._2._1._3()), new Tuple2<Double, String>(x._2._2._1, x._2._2._2))))
                    .join(iterationUserWeightLabel.mapToPair(a -> new Tuple2<Tuple2<String, String>, Tuple3<String, String, Double>>(new Tuple2<String, String>(a._1, a._2._2()), new Tuple3<String, String, Double>(a._2._1(), a._2._2(), a._2._3()))), Config.PARTITIONS)
                    .mapToPair(w -> new Tuple2<Tuple3<String, String, String>, Double>(new Tuple3<String, String, String>(w._2._1._2._2, w._2._1._1._1(), w._2._1._1._2()), w._2._2._3() * w._2._1._2._1))
                    .reduceByKey((x, y) -> x + y, Config.PARTITIONS)
                    .mapToPair(x -> {
                        if (Objects.equals(x._1._1(), x._1._3()) && x._2 < 1.0) {
                            return new Tuple2<Tuple3<String, String, String>, Double>(new Tuple3<String, String, String>(x._1._1(), x._1._2(), x._1._3()), 1.0);
                        }
                        return x;
                    });

            JavaPairRDD<String, Tuple3<String, String, Double>> oldIterationUserWeightLabel = iterationUserWeightLabel;

            // normalize the weights back to 1.0
            iterationUserWeightLabel = joinedTogether
                    .mapToPair(sum -> new Tuple2<String, Double>(sum._1._1(), sum._2))
                    .reduceByKey((x, y) -> x + y, Config.PARTITIONS)
                    .join(joinedTogether.mapToPair(together -> new Tuple2<String, Tuple3<String, String, Double>>(together._1._1(), new Tuple3<String, String, Double>(together._1._2(), together._1._3(), together._2))), Config.PARTITIONS)
                    .mapToPair(together -> {
                        if (Double.isNaN(together._2._2._3() / together._2._1)) {
                            return new Tuple2<String, Tuple3<String, String, Double>>(together._1, new Tuple3<String, String, Double>(together._2._2._1(), together._2._2._2(), 0.0));
                        }
                        return new Tuple2<String, Tuple3<String, String, Double>>(together._1, new Tuple3<String, String, Double>(together._2._2._1(), together._2._2._2(), together._2._2._3() / together._2._1));
                    });

            // check for nodes that have higher difference than the convergence value
            JavaPairRDD<Tuple3<String, String, String>, Tuple2<Double, Double>> convergenceRDD = oldIterationUserWeightLabel.mapToPair(a ->
                            new Tuple2<Tuple3<String, String, String>, Double>(new Tuple3<String, String, String>(a._1, a._2._1(), a._2._2()), a._2._3()))
                    .join(iterationUserWeightLabel.mapToPair(b -> new Tuple2<Tuple3<String, String, String>, Double>(new Tuple3<String, String, String>(b._1, b._2._1(), b._2._2()), b._2._3())), Config.PARTITIONS)
                    .filter(x -> Math.abs(x._2._1 - x._2._2) > convergenceValue);

            // check if the values reached convergence this round
            if (convergenceRDD.count() == 0) {
                convergenceChecker = true;
            }
            System.out.println("iteration count: " + i);
        }

        // getting seen articles for each user
        JavaPairRDD<String, String> seenArticlePairRDD = users.mapToPair(user -> new Tuple2<String, List<String>>(user.getString(0), user.getAs("seenarticles")))
                .flatMap(userSeenArticle -> {
                    Iterator<List<String>> output = userSeenArticle
                            ._2()
                            .stream()
                            .map(articleLink -> Arrays.asList(userSeenArticle._1, articleLink))
                            .iterator();
                    return output;
                })
                .mapToPair(user -> new Tuple2<String, String>(user.get(0), user.get(1)))
                .filter(user -> !Objects.equals(user._2, "none"))
                .distinct(Config.PARTITIONS);

        // rdd with all relevant article information
        JavaPairRDD<String, Tuple5<String, String, Date, String, String>> articleDatePairRDD = articles
                .mapToPair(article -> new Tuple2<String, Tuple5<String, String, Date, String, String>>(article.getAs("link"),
                        new Tuple5<String, String, Date, String, String>(article.getAs("author"), article.getAs("category"), article.getAs("date"), article.getAs("headline"), article.getAs("description"))))
                .distinct(Config.PARTITIONS);

        // filter the results so its just the article nodes
        JavaPairRDD<String, Tuple2<Tuple3<String, String, Double>, Tuple5<String, String, Date, String, String>>> onlyArticlesRDD = iterationUserWeightLabel
                .join(articleDatePairRDD, Config.PARTITIONS)
                .filter(value -> value._2._1._3() > 0.0)
                .filter(currentDate -> currentDate._2._2._3().before(new Date(new Date().getTime())) || currentDate._2._2._3().equals(new Date(new Date().getTime())));

        // date formatter
        SimpleDateFormat dateFormatter = new SimpleDateFormat("yyyy-MM-dd");
        dateFormatter.setTimeZone(TimeZone.getTimeZone("EST"));
        String dateToday = dateFormatter.format(new Date().getTime());

        System.out.println(dateToday + " HELLO WORLD ");

        // filter out just today's date for recommendations
        JavaPairRDD<String, Tuple2<Tuple3<String, String, Double>, Tuple5<String, String, Date, String, String>>> sameDateArticle = onlyArticlesRDD
                .filter(date -> Objects.equals(dateFormatter.format(date._2._2._3()), dateToday))
                .mapToPair(article -> new Tuple2<Tuple2<String, String>, Tuple2<Tuple2<String, Double>, Tuple5<String, String, Date, String, String>>>(
                        new Tuple2<String, String>(article._2._1._2(), article._1), new Tuple2<Tuple2<String, Double>, Tuple5<String, String, Date, String, String>>(new Tuple2<String, Double>(article._2._1._1(), article._2._1._3()),
                        new Tuple5<String, String, Date, String, String>(article._2._2._1(), article._2._2._2(), article._2._2._3(), article._2._2._4(), article._2._2._5()))))
                // filters out seen articles
                .subtractByKey(seenArticlePairRDD.mapToPair(userArticlePair -> new Tuple2<Tuple2<String, String>, String>(new Tuple2<String, String>(userArticlePair._1, userArticlePair._2), "filler")))
                .mapToPair(article -> new Tuple2<String, Tuple2<Tuple3<String, String, Double>, Tuple5<String, String, Date, String, String>>>(article._1._2, new Tuple2<Tuple3<String, String, Double>, Tuple5<String, String, Date, String, String>>
                        (new Tuple3<String, String, Double>(article._2._1._1, article._1._1, article._2._1._2), new Tuple5<String, String, Date, String, String>(article._2._2._1(), article._2._2._2(), article._2._2._3(), article._2._2._4(), article._2._2._5()))));


//        // writing to db section
        System.out.println("STARTING TO WRITE TO DYNAMODB");
        Table articleRecommendationsTable = db.getTable("ArticleRecommendations");

        // delete the current table and remake it, because old recommendations might be irrelevant
        try {
            articleRecommendationsTable.delete();
            articleRecommendationsTable.waitForDelete();
        } catch (Exception e) {
            System.out.println(e.getMessage());
        }

        try {
            ArrayList<AttributeDefinition> attributes = new ArrayList<AttributeDefinition>();
            attributes.add(new AttributeDefinition().withAttributeName("username").withAttributeType("S"));
            attributes.add(new AttributeDefinition().withAttributeName("link").withAttributeType("S"));

            ArrayList<KeySchemaElement> keys = new ArrayList<KeySchemaElement>();
            keys.add(new KeySchemaElement().withAttributeName("username").withKeyType(KeyType.HASH));
            keys.add(new KeySchemaElement().withAttributeName("link").withKeyType(KeyType.RANGE));


            articleRecommendationsTable = db.createTable("ArticleRecommendations", keys, attributes, new ProvisionedThroughput(100L, 100L));
            articleRecommendationsTable.waitForActive();
        } catch (Exception e) {
            System.out.println(e.getMessage());
        }

        // add the recommendations to db in parallel
        sameDateArticle.foreachPartition(partition -> {
            DynamoDB dynamo = DynamoConnector.getConnection(Config.DYNAMODB_URL);
            List<Item> listOfItems = new ArrayList<>();
            HashSet<Tuple2<String, String>> hashSortChecker = new HashSet<>();
            partition.forEachRemaining(article -> {
                double randomValue = Math.random();
                if (randomValue <= article._2._1._3()) {
                    Item articleRecommendation = new Item()
                            .withPrimaryKey("username", article._2._1._2(), "link", article._1)
                            .withString("author", article._2._2._1())
                            .withString("category", article._2._2._2())
                            .withString("date", dateFormatter.format(article._2._2._3()))
                            .withString("headline", article._2._2._4())
                            .withString("description", article._2._2._5())
                            .withNumber("weight", article._2()._1._3());
                    if (!hashSortChecker.contains(new Tuple2<String, String>(article._2._1._2(), article._1))) {
                        hashSortChecker.add(new Tuple2<String, String>(article._2._1._2(), article._1));
                        listOfItems.add(articleRecommendation);
                    }
                    // updates articles of user seen
                    HashMap<String, String> expressionAttributeName = new HashMap<>();
                    expressionAttributeName.put("#S", "seenarticles");
                    HashMap<String, Object> expressionAttributeValues = new HashMap<>();
                    expressionAttributeValues.put(":newvalue", new HashSet<String>(Collections.singleton(article._1)));
                    UpdateItemOutcome outcome = dynamo.getTable("UsersTable").updateItem("username", article._2._1._2(), "add #S :newvalue", expressionAttributeName, expressionAttributeValues);
                }
            });

            // batch writes chunks of 25
            List<List<Item>> chunksOf25Items = Lists.partition(listOfItems, 25);
            for (List<Item> someItemList: chunksOf25Items) {
                TableWriteItems itemsTableWriteItems = new TableWriteItems("ArticleRecommendations")
                        .withItemsToPut(someItemList);
                BatchWriteItemOutcome outcome = dynamo.batchWriteItem(itemsTableWriteItems);
                while (outcome.getUnprocessedItems().size() > 0) {
                    outcome = dynamo.batchWriteItemUnprocessed(outcome.getUnprocessedItems());
                }
            }
        });
        System.out.println("All article recommendations have been made!");

        // upload the articles weights
        Table articleTable = db.getTable("ArticleTable");
        try {
            articleTable.delete();
            articleTable.waitForDelete();
        } catch (Exception e) {
            System.out.println(e.getMessage());
        }

        try {
            ArrayList<AttributeDefinition> attributes = new ArrayList<AttributeDefinition>();
            attributes.add(new AttributeDefinition().withAttributeName("username").withAttributeType("S"));
            attributes.add(new AttributeDefinition().withAttributeName("link").withAttributeType("S"));

            ArrayList<KeySchemaElement> keys = new ArrayList<KeySchemaElement>();
            keys.add(new KeySchemaElement().withAttributeName("username").withKeyType(KeyType.HASH));
            keys.add(new KeySchemaElement().withAttributeName("link").withKeyType(KeyType.RANGE));


            articleTable = db.createTable("ArticleTable", keys, attributes, new ProvisionedThroughput(200L, 200L));
            articleTable.waitForActive();
        } catch (Exception e) {
            System.out.println(e.getMessage());
        }

        System.out.println("Writing to ArticleTable");
        // add the article weights into the db in parallel
        onlyArticlesRDD.foreachPartition(partition -> {
            AtomicInteger writeCounter = new AtomicInteger();
            DynamoDB dynamo = DynamoConnector.getConnection(Config.DYNAMODB_URL);
            List<Item> listOfItems = new ArrayList<>();
            HashSet<Tuple2<String, String>> hashSortChecker = new HashSet<>();
            partition.forEachRemaining(article -> {
                Item userArticleItem = new Item()
                        .withPrimaryKey("username", article._2._1._2(), "link", article._1)
                        .withString("author", article._2._2._1())
                        .withString("category", article._2._2._2())
                        .withString("date", dateFormatter.format(article._2._2._3()))
                        .withString("headline", article._2._2._4())
                        .withString("description", article._2._2._5())
                        .withNumber("weight", article._2()._1._3());
                if (!hashSortChecker.contains(new Tuple2<String, String>(article._2._1._2(), article._1))) {
                    hashSortChecker.add(new Tuple2<String, String>(article._2._1._2(), article._1));
                    listOfItems.add(userArticleItem);
                }
            });

            List<List<Item>> chunksOf25Items = Lists.partition(listOfItems, 25);
            for (List<Item> someItemList: chunksOf25Items) {
                // my attempt at limiting the rates so I don't get a exceeding throughput error
                if (writeCounter.get() % 10 == 0) {
                    TimeUnit.SECONDS.sleep(2);
                }
                TableWriteItems itemsTableWriteItems = new TableWriteItems("ArticleTable")
                        .withItemsToPut(someItemList);
                writeCounter.getAndIncrement();

                BatchWriteItemOutcome outcome = dynamo.batchWriteItem(itemsTableWriteItems);
                while (outcome.getUnprocessedItems().size() > 0) {
                    // my attempt at limiting the rates so I don't get a exceeding throughput error
                    if (writeCounter.get() % 10 == 0) {
                        TimeUnit.SECONDS.sleep(2);
                    }
                    outcome = dynamo.batchWriteItemUnprocessed(outcome.getUnprocessedItems());
                    writeCounter.getAndIncrement();
                }
                System.out.println(writeCounter.get() + " HERE IS THE WRITE COUNTER ");
            }
        });
        System.out.println("All article have been updated!");

        //-----------------------------------------------------------------------------------------------------------//
        List<MyPair<String, Tuple2<Tuple3<String, String, Double>, String>>> somePairList = new ArrayList<>();
        return somePairList;
    }

    public SocialRankJob(String source) {
        System.setProperty("file.encoding", "UTF-8");
    }

    @Override
    public List<MyPair<String, Tuple2<Tuple3<String, String, Double>, String>>> call(JobContext arg0) throws Exception {
        initialize();
        return run();
    }

}
