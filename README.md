# Penn Book
### Description
A miniature version of Facebook that has features such as creating accounts, creating posts, editing account settings, chatting with friends, getting news article recommendations, and searching for news articles.

### Features
#### Accounts, Walls, and Home Page
	1. Users can create an account and log into their account with a username, password, first and last name, email, affiliation, and a birthday. Users can also declare at least two news categories they are interested in and they will get news articles related to these categories. The password is hashed using a SHA-256 package.
	2. Users can change their affiliation, news categories, email, and passwords. Changing an affiliation or news category will create an automatic status update.
	3. Users have walls and can post on their own wall and their friend's wall.
	4. Users will see their posts and other friends post on their home page.
	5. Users can comment on posts.
	6. Users can search for friends and get suggested friends.
	7. Users can add and remove friends.
	8. Users can see a network of their friends via a friend visualizer.
#### Chat
	1. Users can invite their friends to a chat room.
	2. Users will have their chat messages persist through multiple sessions.
	3. Users will have the ability to have group chats (3 or more people)
	4. Users will have their chat messages ordered with the latest message appearing at the bottom.
#### News Feed
	1. News articles should appear once an hour or whenever a user changes their news category preferences.
	2. Users should be recommended news articles based on their news category preferences (Adsorption Algorithm)
	3.  Users should be able to use keywords and search for news articles. Their news results will be ranked based on search term and perferences.
  
### Technologies
- Amazon DynamoDB
- Amazon Elastic Map Reduce
- Amazon EC2 (Elastic Compute Cloud)
- Java
- Apache Spark
- Apache Livy
- Apache Maven
- Javascript
- Embedded JavaScript
- JQuery
- Bootstrap CSS
- Node.js
- AJAX
- Socket.io

### Credit
| Names      | Features |
| ----------- | ----------- |
| Anna Orosz      | Chat|
| Raymon Shi   | News Feed |
| Rohan Verma  | Accounts, Walls, and Home Page |
| Alex Zhang  | Accounts, Walls, and Home Page |

