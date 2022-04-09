package edu.upenn.cis.nets212.loader;

import com.amazonaws.services.dynamodbv2.document.BatchWriteItemOutcome;
import com.amazonaws.services.dynamodbv2.document.DynamoDB;
import com.amazonaws.services.dynamodbv2.document.Item;
import com.amazonaws.services.dynamodbv2.document.TableWriteItems;
import com.google.common.collect.Lists;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import edu.upenn.cis.nets212.config.Config;
import edu.upenn.cis.nets212.storage.DynamoConnector;
import edu.upenn.cis.nets212.storage.SparkConnector;
import opennlp.tools.stemmer.PorterStemmer;
import opennlp.tools.stemmer.Stemmer;
import opennlp.tools.tokenize.SimpleTokenizer;
import org.apache.spark.api.java.JavaRDD;
import org.apache.spark.api.java.JavaSparkContext;
import org.apache.spark.sql.Row;
import org.apache.spark.sql.SparkSession;
import org.apache.spark.sql.catalyst.expressions.GenericRowWithSchema;
import org.apache.spark.sql.types.StructType;
import scala.Tuple6;

import java.text.ParseException;
import java.text.SimpleDateFormat;
import java.util.*;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.Collectors;
import java.util.stream.Stream;

public class ArticleLikeTable {
    DynamoDB db;
    SparkSession spark;
    JavaSparkContext context;
    SimpleTokenizer model;
    Stemmer stemmer;
    String tableName;


    public ArticleLikeTable() throws InterruptedException {
        spark = SparkConnector.getSparkConnection();
        context = SparkConnector.getSparkContext();
        spark.sparkContext().setLogLevel("WARN");
        db = DynamoConnector.getConnection(Config.DYNAMODB_URL);
//        Access.initializeTable();
        model = SimpleTokenizer.INSTANCE;
        stemmer = new PorterStemmer();
        tableName = "ArticleLikeTable";
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
                Date articleDate = new SimpleDateFormat("yyyy-MM-dd").parse(jsonArray[indexDate[i]]);
                Calendar cal = Calendar.getInstance();
                cal.setTime(articleDate);
                cal.add(Calendar.YEAR, 4);
                Date newArticleDate = cal.getTime();
//                System.out.println("OLD DATE: " + articleDate.getTime() + "NEW DATE: " + newArticleDate.getTime());
//                System.out.println("OLD: " + articleDate + "NEW: " + newArticleDate);

                row[indexDate[i]] = new java.sql.Date(newArticleDate.getTime());
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
//
        return context.parallelize(rowList);
    }

//    HashSet<String> getStopwords(String stopwordListFile) {
//        HashSet<String> stopwords = new HashSet<String>();
//
//        try {
//            BufferedReader buffReader = new BufferedReader(new FileReader(stopwordListFile));
//            String nextLine = buffReader.readLine();
//            while (nextLine != null) {
//                stopwords.add(nextLine);
//                nextLine = buffReader.readLine();
//            }
//            buffReader.close();
//        } catch (IOException fileNotFoundError) {
//            fileNotFoundError.printStackTrace();
//        }
//        return stopwords;
//    }


    public void run() {
        TimeZone.setDefault(TimeZone.getTimeZone("EST"));
        SimpleDateFormat dateFormatter = new SimpleDateFormat("yyyy-MM-dd");
        dateFormatter.setTimeZone(TimeZone.getTimeZone("EST"));
        JavaRDD<Row> theArticles = getJSONArticles(Config.NEWS_S3_PATH);
        JavaRDD<Tuple6<String, String, String, String, String, String>> articleInformation = theArticles
                .map(article -> new Tuple6<String, String, Date, String, String, String>(article.getAs("headline"),
                        article.getAs("link"), article.getAs("date"), article.getAs("author"), article.getAs("description"), article.getAs("category")))
                .map(article -> new Tuple6<String, String, String, String, String, String>(article._1(), article._2(), dateFormatter.format(article._3()), article._4(), article._5(), article._6()));
        articleInformation.repartition(Config.PARTITIONS).foreachPartition(partition -> {
            AtomicInteger writeCounter = new AtomicInteger();
            DynamoDB dynamo = DynamoConnector.getConnection(Config.DYNAMODB_URL);
            List<Item> listOfItems = new ArrayList<>();
            HashSet<String> hashChecker = new HashSet<>();
            partition.forEachRemaining(article -> {
                Item articleItem = new Item()
                        .withPrimaryKey("link", article._2())
                        .withNumber("likes", 0)
                        .withString("headline", article._1())
                        .withString("date", article._3())
                        .withString("author", article._4())
                        .withString("description", article._5())
                        .withString("category", article._6());
                if (!hashChecker.contains(article._2())) {
                    hashChecker.add(article._2());
                    listOfItems.add(articleItem);
                }
            });
            List<List<Item>> chunksOf25Items = Lists.partition(listOfItems, 25);
            for (List<Item> someItemList: chunksOf25Items) {
                if (writeCounter.get() % 10 == 0) {
                    TimeUnit.SECONDS.sleep(5);
                }
                TableWriteItems itemsTableWriteItems = new TableWriteItems("ArticleLikeTable")
                        .withItemsToPut(someItemList);
                writeCounter.getAndIncrement();
                BatchWriteItemOutcome outcome = dynamo.batchWriteItem(itemsTableWriteItems);
                while (outcome.getUnprocessedItems().size() > 0) {
                    if (writeCounter.get() % 10 == 0) {
                        TimeUnit.SECONDS.sleep(5);
                    }
                    outcome = dynamo.batchWriteItemUnprocessed(outcome.getUnprocessedItems());
                    writeCounter.getAndIncrement();
                }
                System.out.println(writeCounter.get() + " HERE IS THE WRITE COUNTER ");
            }
        });

        
    }

    public static void main(final String[] args) throws InterruptedException {
        final ArticleLikeTable alt = new ArticleLikeTable();
        alt.run();
        System.out.println("All the article likes were added to the table!");
    }


}
