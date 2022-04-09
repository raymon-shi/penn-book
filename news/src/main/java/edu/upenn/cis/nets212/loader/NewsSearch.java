package edu.upenn.cis.nets212.loader;

import com.amazonaws.services.dynamodbv2.document.BatchWriteItemOutcome;
import com.amazonaws.services.dynamodbv2.document.DynamoDB;
import com.amazonaws.services.dynamodbv2.document.Item;
import com.amazonaws.services.dynamodbv2.document.TableWriteItems;
import com.amazonaws.services.dynamodbv2.model.WriteRequest;
import com.google.common.collect.Iterables;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import edu.upenn.cis.nets212.config.Config;
//import edu.upenn.cis.nets212.dynamo.Access;
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

import java.io.BufferedReader;
import java.io.FileReader;
import java.io.IOException;
import java.text.ParseException;
import java.text.SimpleDateFormat;
import java.util.*;
import java.util.stream.Collectors;
import java.util.stream.Stream;

public class NewsSearch {
    DynamoDB db;
    SparkSession spark;
    JavaSparkContext context;
    SimpleTokenizer model;
    Stemmer stemmer;
    String tableName;


    public NewsSearch() throws InterruptedException {
        spark = SparkConnector.getSparkConnection();
        context = SparkConnector.getSparkContext();
        spark.sparkContext().setLogLevel("WARN");
        db = DynamoConnector.getConnection(Config.DYNAMODB_URL);
        model = SimpleTokenizer.INSTANCE;
        stemmer = new PorterStemmer();
        tableName = "NewsSearch";
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

    HashSet<String> getStopwords(String stopwordListFile) {
        HashSet<String> stopwords = new HashSet<String>();

        try {
            BufferedReader buffReader = new BufferedReader(new FileReader(stopwordListFile));
            String nextLine = buffReader.readLine();
            while (nextLine != null) {
                stopwords.add(nextLine);
                nextLine = buffReader.readLine();
            }
            buffReader.close();
        } catch (IOException fileNotFoundError) {
            fileNotFoundError.printStackTrace();
        }
        return stopwords;
    }


    public void run() {
        HashSet<String> stopwords = getStopwords("nlp_stopwords.txt");

        JavaRDD<Row> theArticles = getJSONArticles(Config.NEWS_EXAMPLE_TEXT_FILE);
        List<List<String>> headlineAndLink = theArticles
                .map(article -> Arrays.asList(article.getAs("headline").toString(), article.getAs("link").toString()))
                .collect();

        for (List<String> listOfStrings: headlineAndLink) {
            String headline = "";
            String link = "";
            HashSet<String> tokens = new HashSet<String>();

            if (listOfStrings.size() > 0) {
                headline = listOfStrings.get(0);
            }
            if (listOfStrings.size() > 1) {
                link = listOfStrings.get(1);
            }

            String[] lowercaseHeadlineArray = headline.replaceAll("[\\p{Punct}]", "").toLowerCase().split(" ");
            HashSet<String> wordsToToss = new HashSet<String>();

            for (String word: lowercaseHeadlineArray) {
                char[] characterArrayOfWord = word.toCharArray();
                for (int i = 0; i < characterArrayOfWord.length; i++) {
                    if (!Character.isLetter(characterArrayOfWord[i])) {
                        wordsToToss.add(word);
                    }
                }
                if (!wordsToToss.contains(word)) {
                    tokens.add(word);
                }
            }

            HashSet<String> stemmedTokens = new HashSet<String>();
            tokens.removeAll(stopwords);
            for (String word: tokens) {
                stemmedTokens.add(stemmer.stem(word).toString());
            }

            Iterable<List<String>> chunksOf25Words = Iterables.partition(stemmedTokens, 25);
            chunksOf25Words.forEach(x -> System.out.println(x + " WHAT IS THIS CHUNCK "));
            for (List<String> listOfWord: chunksOf25Words) {
                List<Item> itemsToWriteBatch = new ArrayList<Item>();
                for (String word: listOfWord) {
                    itemsToWriteBatch.add(new Item().withPrimaryKey("keyword", word, "link", link));
                }
                TableWriteItems itemsTableWriteItems = new TableWriteItems(tableName)
                        .withItemsToPut(itemsToWriteBatch);
                BatchWriteItemOutcome outcome = db.batchWriteItem(itemsTableWriteItems);

                do {
                    Map<String, List<WriteRequest>> unprocessedItems = outcome.getUnprocessedItems();
                    if (outcome.getUnprocessedItems().size() == 0) {
                        System.out.println("No unprocessed items found");
                    } else {
                        System.out.println("Retrieving unprocessed items");
                        outcome =db.batchWriteItemUnprocessed(unprocessedItems);
                    }
                } while (outcome.getUnprocessedItems().size() > 0);

            }

        }
    }

    public static void main(final String[] args) throws InterruptedException {
        final NewsSearch ns = new NewsSearch();
        ns.run();
        System.out.println("All the keywords were added to the table!");
    }




}
