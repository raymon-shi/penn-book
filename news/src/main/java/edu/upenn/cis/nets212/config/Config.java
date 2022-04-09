package edu.upenn.cis.nets212.config;

/**
 * Global configuration for NETS 212 homeworks.
 * 
 * A better version of this would read a config file from the resources,
 * such as a YAML file.  But our first version is designed to be simple
 * and minimal. 
 * 
 * @author zives
 *
 */
public class Config {

    /**
     * The path to the space-delimited social network data
     */
    public static String LOCAL_SPARK = "local[*]";
    public static String SIMPLE_EXAMPLE_PATH = "simple-example.txt";
    public static String NEWS_S3_PATH = "s3a://penn-cis545-files/News_Category_Dataset_v2.json";
    public static String NEWS_LOCAL_PATH = "News_Category_Dataset_v2.json";
    public static String NEWS_SIMPLE_EXAMPLE_LOCAL_PATH = "news_subset.json";
    public static String NEWS_EXAMPLE_TEXT_FILE = "small_example_textfile.txt";

    public static String TWITTER_LOCAL_PATH = "twitter_combined.txt";



    public static String DYNAMODB_URL = "https://dynamodb.us-east-1.amazonaws.com";

    /**
     * How many RDD partitions to use?
     */
    public static int PARTITIONS = 5;
}
