package edu.upenn.cis.nets212.hw3.livy;

import java.io.File;
import java.io.FileWriter;
import java.io.IOException;
import java.net.URI;
import java.net.URISyntaxException;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ExecutionException;
import java.util.stream.Collectors;

import org.apache.livy.LivyClient;
import org.apache.livy.LivyClientBuilder;

import edu.upenn.cis.nets212.config.Config;
import scala.Tuple2;
import scala.Tuple3;

public class ComputeRanksLivy {
	public static void main(String[] args) throws IOException, URISyntaxException, InterruptedException, ExecutionException {
		
        System.out.println("Test");
        LivyClient client = new LivyClientBuilder()
                //insert ec2 uri
                .setURI(new URI(""))
                .build(); 

        System.out.println("Test Afterward");

        try {

            String jar = "target/nets212-hw3-0.0.1-SNAPSHOT.jar";

            System.out.printf("Uploading %s to the Spark context...\n", jar);
            client.uploadJar(new File(jar)).get();

            String sourceFile = Config.NEWS_S3_PATH;//.BIGGER_SOCIAL_NET_PATH;
            System.out.printf("Running SocialRankJob with %s as its input...\n", sourceFile);

            // with case
            List<MyPair<String, Tuple2<Tuple3<String, String, Double>, String>>> results = client.submit(new SocialRankJob(sourceFile)).get();
            System.out.println("JOB COMPLETE!!!!");

            

        } finally {
            client.stop(true);
        }
	}
}

