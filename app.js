var express = require('express');
var routes = require('./routes/routes.js');
var cookieParser = require('cookie-parser');
var session = require('express-session');
var app = express();

var db = require('./models/database.js');

const path = require("path");
const JSON5 = require("json5");
const stemmer = require("stemmer");
app.use(express.urlencoded());

var sess = {
  secret: 'secret',
  user: '',
  loggedin: false,
  cookie: {secure: false}
}

setTimeout(() => {
	// 3,600,000 = 1 hr
	runSparkJobPeriodically()}, 10000
)


//enabling cookies
app.use(session(sess));


// routes
app.get('/newssearch', routes.get_main);
app.get('/newsarticleresults', routes.search_for_articles);
app.post('/likingarticle', routes.liking_article_user)
app.post('/dislikingarticle', routes.disliking_article_user)
app.get('/userlookup', routes.user_table_search)
app.post('/likingarticlecount', routes.liking_article_count)
app.post('/dislikingarticlecount', routes.disliking_article_count)
app.get('/blank', routes.blank)
app.get('/spark', routes.spark)
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

const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);


// this is for friend visualizer
var bodyParser = require('body-parser')
var morgan = require('morgan')
var serveStatic = require('serve-static')
//var path = require('path')

app.use(bodyParser.urlencoded({ extended: false }));
app.use(morgan('combined'));
app.use(serveStatic(path.join(__dirname, 'public')))



// this is for hashing passwords- https://www.npmjs.com/package/sha.js


/* Below we install the routes. The first argument is the URL that we
   are routing, and the second argument is the handler function that
   should be invoked when someone opens that URL. Note the difference
   between app.get and app.post; normal web requests are GETs, but
   POST is often used when submitting web forms ('method="post"'). */
// login pages related routes
app.get('/', routes.get_login_page);
app.post('/checklogin', routes.checklogin_page);

// sign up pages and create account related routes
app.get('/signup', routes.get_signup_page);
app.post('/createaccount', routes.create_account);

// logout route
app.get('/logout', routes.get_logout);


// home page related routes
app.get('/homepage', routes.getHome);


// account setting changes routes
app.get('/accountsettingsPage', routes.get_settings_page);
app.get('/updateEmailPage', routes.get_update_email_page);
app.get('/updatePasswordPage', routes.get_update_password_page);
app.get('/updateAffiliationPage', routes.get_update_affiliation_page);
app.get('/updateAddNewsCategoryPage', routes.get_update_add_news_category_page);
app.get('/updateDeleteNewsCategoryPage', routes.get_update_delete_news_category_page);


app.post('/updateEmail', routes.update_email);
app.post('/updatePassword', routes.update_password);
app.post('/updateAffiliation', routes.update_affiliation); 
app.post('/updateAddNewsCategory', routes.update_add_news_category); 
app.post('/updateDeleteNewsCategory', routes.update_delete_news_category); 


/*/user search 
	1) Search suggestion
	2) User Search Results Page
*/
app.post('/userSearchSuggestions', routes.user_search_suggestions);
app.post('/userSearchResultsPage', routes.user_search_results_page);

// wage page related routes
app.get('/wall', routes.getWall);


// friend visualizer
app.get('/friendVisualizationPage', routes.get_friend_visualization_page);
app.get('/friendvisualization',routes.get_friend_visualization);
app.get('/getFriends/:user', routes.get_friends_of_specific_user_visualization);


//app.get('/', routes.getHome);
//app.get('/wall', routes.getWall)
app.get('/getOnline', routes.getOnlineFriends);
app.get('/getFriendships', routes.getFriendships);
app.get('/getFriendsStatusUpdates', routes.getFriendsStatusUpdates);
app.get('/getComments', routes.getComments)
app.get('/getMyStatusUpdates', routes.getMyStatusUpdates);
app.get('/getUser', routes.getUser)
app.get('/friendsList', routes.friendsList)
app.get('/getFriends', routes.getFriends)
app.get('/getUserDetails', routes.getUserDetails)

app.post('/addStatusUpdate', routes.addStatusUpdate)
app.post('/addComment', routes.addComment);
app.post('/addWallPost', routes.addWallPost)
app.post('/addFriend', routes.addFriend);
app.post('/removeFriend', routes.removeFriend);


// chat - Anna stuff
app.get('/chats', routes.chats);
app.get('/socketioclient', (req, res) => {
    res.sendFile(__dirname + '/node_modules/socket.io/client-dist/socket.io.js');
});
app.get('/socketioclient', (req, res) => {
    res.sendFile(__dirname + '/node_modules/socket.io/client-dist/socket.io.js');
});
app.get('/get_users_for_chat', routes.get_users_for_chat)
app.get('/get_chat_history_by_user', routes.get_chat_history_by_user)
app.post('/start_group_chat', routes.start_group_chat)
app.get('/get_active_group_chats', routes.get_active_group_chats)
app.get('/get_history_by_group_chat_id', routes.get_history_by_group_chat_id)
app.post('/leave_chat', routes.leave_chat)

var userNameSocketMap = {};
app.locals.chatHistory = {}; //keys: set of participants, value: list of chat messages


io.on('connection', (socket) => {
    console.log(`a user connected on socket: ${socket.id}`);


    socket.on('send-message', (msg, fromUser, toUser) => {
        const timestamp = new Date();
        console.log('message: ' + msg + ' from user: ' + fromUser + ' to users: ' + toUser);


        // add to server side history
        const conversationKey = [fromUser, toUser].sort().join('__');
        const historyEntry = {timestamp: timestamp, fromUser: fromUser, toUser: toUser, message: msg};
        if (conversationKey in app.locals.chatHistory) {
            app.locals.chatHistory[conversationKey].push(historyEntry)
        } else {
            app.locals.chatHistory[conversationKey] = [historyEntry]
        }
        console.log(app.locals.chatHistory[conversationKey])

        // broadcast to participants over socket
        const receiverUserSocketIds = userNameSocketMap[toUser];
        const otherSocketsOfSendingUserIds = userNameSocketMap[fromUser];
        if (!receiverUserSocketIds) {
            return;
        }

        for (var i = 0; i < receiverUserSocketIds.length; i++) {
            const receiverSocketId = receiverUserSocketIds[i];
            socket.to(receiverSocketId).emit('receive-message', fromUser, msg, timestamp);
        }

        if (!otherSocketsOfSendingUserIds) {
            return;
        }

        for (var i = 0; i < otherSocketsOfSendingUserIds.length; i++) {
            const receiverSocketId = otherSocketsOfSendingUserIds[i];
            if (receiverSocketId !== socket.id) {
                socket.to(receiverSocketId).emit('receive-message', fromUser, msg, timestamp);
            }

        }


    });

    socket.on('send-message-to-group-chat', (msg, fromUser, roomId) => {
        console.log('sending message to GROUP CHAT');

        const timestamp = new Date();

        // add to server side history

        console.log('message: ' + msg + ' from user: ' + fromUser + ' to room ID: ' + roomId);


        db.addMessage(roomId, fromUser, msg, timestamp, function (err, data) {

            if (err) {
                return;
            }


            db.getParticipantsByGroupChatId(roomId, function (err, toUsers) {

                if (err) {
                    return;
                }

                // send to all other participants in conversation than sender
                for (i = 0; i < toUsers.length; i++) {
                    const toUser = toUsers[i];
                    const receiverUserSocketIds = userNameSocketMap[toUser];

                    if (!receiverUserSocketIds) {
                        continue;
                    }

                    for (var j = 0; j < receiverUserSocketIds.length; j++) {
                        const receiverSocketId = receiverUserSocketIds[j];
                        socket.to(receiverSocketId).emit('receive-message-from-group-chat', roomId, fromUser, toUsers, msg, timestamp.getTime());
                    }

                }

                // send to other live sockets of current sender user
                const otherSocketsOfSendingUserIds = userNameSocketMap[fromUser];
                if (!otherSocketsOfSendingUserIds) {
                    return;
                }

                for (var i = 0; i < otherSocketsOfSendingUserIds.length; i++) {
                    const receiverSocketId = otherSocketsOfSendingUserIds[i];
                    if (receiverSocketId !== socket.id) {
                        socket.to(receiverSocketId).emit('receive-message', fromUser, msg, timestamp);
                    }

                }
            });

        });


    });


    socket.on('disconnect', (socket) => {
        console.log(`user disconnected on socket: ${socket}`);
    });

    socket.on('register-user-to-socket', (userName) => {
        if (userName in userNameSocketMap) {
            userNameSocketMap[userName].push(socket.id);
        } else {
            userNameSocketMap[userName] = [socket.id];
        }

        console.log(`user name: ${userName} registered on socket: ${socket.id}`)
        console.log(userNameSocketMap)
    })

    socket.on('start-group-chat', (initiator, participantUsers) => {

        const allUsersInChat = participantUsers.concat(initiator);
        db.getGroupChatRoomIdByParticipants(allUsersInChat, function (err, result) {
            console.log(result)
            if (result === null) {
                db.createGroupChatWithUsers(allUsersInChat, function (createdRoomId) {
                    notifyAllSocketsOnGroupChatCreated(socket, allUsersInChat, false, createdRoomId);
                    return;
                });
            } else {
                const roomId = parseInt(result);
                // notifyAllSocketsOnGroupChatCreated(socket, allUsersInChat, true, roomId);
                return;

            }

        });


        const conversationKey = allUsersInChat.sort().join('__');
        console.log(`${initiator} started a chat with: ${participantUsers} -- room key: ${conversationKey}`)


    })

    socket.on('invite-to-group-chat', (initiator, checkedUsers, roomId) => {


        console.log(`>>>> ${initiator} invited users: ${checkedUsers} to room: ${roomId}`);

        // add invited users to room
        db.addUsersToGroupChat(checkedUsers, roomId, function (usersToNotify) {
            console.log(usersToNotify);

            db.getParticipantsByGroupChatId(roomId, function(err, allUsersInChat){
                notifyAllSocketsOnGroupChatInvite(socket, usersToNotify, roomId, allUsersInChat, initiator)
            });
            // notify invited users

        });




    })
});


var notifyAllSocketsOnGroupChatInvite = function (socket, usersToNotify, roomId, allUsersInChat, initiator) {
    for (var i = 0; i < allUsersInChat.length; i++) {
        const receiverUserSocketIds = userNameSocketMap[allUsersInChat[i]];

        if (!receiverUserSocketIds) {
            continue;
        }

        for (var j = 0; j < receiverUserSocketIds.length; j++) {
            const receiverSocketId = receiverUserSocketIds[j];
            if (socket.id === receiverSocketId) {
                // if (groupChatExists) {
                    socket.emit('invited-group-chat', roomId, allUsersInChat, initiator, false);
                // } else {
                //     socket.emit('invited-group-chat', roomId, allUsersInChat, false);
                // }
                continue; ///// shouldn't notify initiator user

            } else {
                if (usersToNotify.includes(allUsersInChat[i])){
                    socket.to(receiverSocketId).emit('invited-group-chat', roomId, allUsersInChat, initiator, true);
                }
                else{
                    socket.to(receiverSocketId).emit('invited-group-chat', roomId, allUsersInChat, initiator, false);
                }
            }
        }
    }

}


var notifyAllSocketsOnGroupChatCreated = function (socket, allUsersInChat, groupChatExists, roomId) {
    for (var i = 0; i < allUsersInChat.length; i++) {
        const receiverUserSocketIds = userNameSocketMap[allUsersInChat[i]];

        if (!receiverUserSocketIds) {
            continue;
        }

        for (var j = 0; j < receiverUserSocketIds.length; j++) {
            const receiverSocketId = receiverUserSocketIds[j];
            if (socket.id === receiverSocketId) {
                if (groupChatExists) {
                    socket.emit('entered-group-chat', null, null, null);
                } else {
                    socket.emit('entered-group-chat', roomId, allUsersInChat, false);
                }
            } else {
                if (!groupChatExists) {
                    socket.to(receiverSocketId).emit('entered-group-chat', roomId, allUsersInChat, true);
                }
            }
            console.log(`    --- added ${allUsersInChat[i]} users receiver socket (${receiverSocketId}) to group room: ${roomId}. Participants: ${allUsersInChat}`)
        }
    }

}

var loadChatHistoryCache = function () {
    console.log('loading chat history to server-side cache')
    db.getAllChatMessages(function (err, results) {
//        console.log(results.length);

        for (i = 0; i < results.length; i++) {
            const record = results[i]
            const sender = record['sender']['S']
            const content = record['content']['S']
            const roomUniqueId = record['roomuniqueid']['N']
            const timestamp = record['timestamp']['S']

            const historyItem = {timestamp: timestamp, sender: sender, content: content};

            if (roomUniqueId in app.locals.chatHistory) {
                app.locals.chatHistory[roomUniqueId].push(historyItem);
            } else {
                app.locals.chatHistory[roomUniqueId] = [historyItem];
            }
        }
    });
};


/* Run the server */
console.log('NETS 212 final project');
server.listen(8080, () => {
    console.log('listening on *:8080');
    loadChatHistoryCache();
});
