//require express and set up express/handlebars for main workload
var express = require('express');
var app=express();
//set deafult layout to main and add support for sections
var handlebars = require('express-handlebars').create({ defaultLayout:'main' , helpers: {
    section: function(name, options){
	if(!this._sections) this._sections={};
	this._sections[name]=options.fn(this);
	return null;
    }
}});
var errorHandler=require('./lib/errorHandle.js');
var mysql=require('mysql');
var credentials=require('./credentials.js');
connectionpool=mysql.createPool({
    host: credentials.database.server,
    user: credentials.database.user,
    password: credentials.database.pass,
    database: credentials.database.database
});

//Array of game names for quick conversion
var games=["hearts", "blukes", "spades", "500"];

//add body parser to get body for post requests to api
var bodyParser=require('body-parser');
app.use(bodyParser.urlencoded());
//use handlebars for templating
app.engine('handlebars', handlebars.engine);
//set public to usable
app.use(express.static(__dirname + '/public'));
//allow for tests to be show
app.use(function(req, res, next){
    res.locals.showTests=app.get('env') !== 'production' && req.query.test=='1';
    next();
});
//set view engine to handlebars
app.set('view engine', 'handlebars');
//set port to 3666
app.set('port', process.env.PORT || 3666);


/*
 * PUT /game/submitturn
 * Submits a players turn and adjusts their entry as well as advancing the cycle
 * @id - ID of game
 * @player - player submitting the turn
 * @card - Card being played
 */
app.put('/game/submitturn', function(req, res){
    connectionpool.getConnection(function(err, connection){
	if(err){
	    res=errorHandler.errorAlert(err, 'PUT: /game/submitturn connection', res);
	}
	else{
	    var getQuery="SELECT * FROM `games` WHERE `id`="+req.body.id;
	    connection.query(getQuery, function(err, rows, fields){
		if(err){
		    res=errorHandler.errorAlert(err, 'POST: /game/submitturn query', res);
		}
		var data=rows[0];
		var players=JSON.parse(data['players']);
		var playedcards=JSON.parse(data['played_cards']);
		var gameManager=require('./games/'+data['game']+".js");
		if(Object.keys(players)[data['current_player']]==req.body.player){
		    playerHand=players[req.body.player][0];
		    if(playerHand.includes(JSON.parse(req.body.card))){
			players[req.body.player][0].splice(playerHand.indexOf(JSON.parse(req.body.card)), 1);
			playedcards.put(JSON.parse(req.body.card));
			var updateQuery="UPDATE `games` SET players=`"+JSON.stringify(players)+"', played_cards='"+JSON.stringify(playedcards)+"', current_player="+((data['current_player']+1)%gameManager.gameStats.maxPlayers)+", cycle="+(data['cycle']+1)+" WHERE id="+req.body.id;
			connection.query(updateQuery, function(err, rows, fields){
			    if(err){
				res=errorHandler.errorAlert(err, "POST: /game/submitturn", res);
			    }
			    res.send({
				success: 'true'
			    });
			    if(data['cycle']+1==gameManager.gameStats.maxPlayers){
				gameManager.completeTurn();
			    }
			});
		    }
		    else{
			res.send({
			    success: 'false',
			    reason: 'Card was not in hand'
			});
		    }
		}
		else{
		    res.send({
			success: 'false',
			reason: 'Not this players turn'
		    });
		}
		connection.release();
	    });
	}
    });
});

/*
 * PUT /game/addplayer
 * Adds a player to an existing game, takes id and player name
 * @id - ID of game player is joining
 * @player - Name of player joining game
 * @password - Password of game player is joining if one exists
 */
app.put('/game/addplayer', function(req, res){
    connectionpool.getConnection(function(err, connection){
	if(err){
	    res=errorHandler.errorAlert(err, 'PUT: /game/addplayer connection', res);
	}
	else{
	    var getQuery="SELECT * FROM `games` WHERE `id`="+req.body.id;
	    connection.query(getQuery, function(err, rows, fields){
		if(err){
		    res=errorHandler.errorAlert(err, 'POST: /game/addplayer query', res);
		}
		var gamePass=rows[0]['game_password'];
		var gamePlayers=rows[0]['players'];
		var playersJson=JSON.parse(gamePlayers);
		var gameManager=require('./games/'+rows[0]['game']+".js");
		var maxPlayers=gameManager.gameStats.maxplayers;
		console.log(Object.keys(playersJson).length);
		console.log(maxPlayers);
		if(Object.keys(playersJson).length<maxPlayers && (gamePass=="" || gamePass==req.body.password)){
		    playersJson[req.body.player]=[[], 0, 0];
		    var updateQuery="UPDATE `games` SET ";
		    if(maxPlayers==Object.keys(playersJson).length){
			playersJson=gameManager.deal(playersJson);
			updateQuery+="players='"+JSON.stringify(playersJson)+"', cycle=0";
		    }
		    else{
			updateQuery+="players='"+JSON.stringify(playersJson)+"'";
		    }
		    updateQuery+=" WHERE `id`="+req.body.id;
		    console.log(updateQuery);
		    connection.query(updateQuery, function(err, rows, fields){
			if(err){
			    res=errorHandler.errorAlert(err, 'POST: /game/addplayer update', res);
			}
			res.send({
			    success: 'true'
			});
		    });
		}
		else{
		    res.send({
			error: 'ERR',
			reason: 'Game full or password incorrect'
		    });
		}
		connection.release();
	    });
	}
    }); 
});

/*
 * POST: /game/newgame
 * Begins a new game, takes one player (the game starter), and a game type as a string. Also accepts a game name and a game password
 * @game - A game by name, converted to an int internally
 * @player - name of player starting game
 * @name - Name of game to be displayed to users
 * @password - optional argument that adds a password users must enter to join the game
 */
app.post('/game/newgame', function(req, res){
    connectionpool.getConnection(function(err, connection){
	if(err){
	    res=errorHandler.errorAlert(err, 'POST: /game/newgame', res);	    
	}
	else{
	    var id=Math.floor(Math.random()*100000);
	    var players={};
	    var empty=[];
	    var password="";
	    if(req.body.password){
		password=req.body.password;
	    }
	    var name=req.body.player+"'s game of "+req.body.game;
	    if(req.body.name){
		name=req.body.name;
	    }
	    players[req.body.player]=[[], 0, 0];
	    var game=req.body.game;
	    var gameManager=require('./games/'+req.body.game+".js");
	    var deck=gameManager.newDeck();
	    var firstPlayer=Math.floor(Math.random()*gameManager.gameStats.maxPlayers);
	    var newGameQ="INSERT INTO `games` (`id`, players, cycle, deck, played_cards, game, game_name, game_password, current_player, dealer) VALUES ("+id+", '"+JSON.stringify(players)+"', -1, '"+JSON.stringify(deck)+"', '[]', '"+game+"', '"+name+"', '"+password+"', "+firstPlayer+", "+firstPlayer+")";
	    console.log(newGameQ);
	    connection.query(newGameQ, function(err, rows, fields){
		if(err){
		    res=errorHandler.errorAlert(err, 'POST: /game/newgame', res);
		}
		res.send({
		    success: 'true'
		});
		connection.release();
	    });
	}
    });
});



app.use(function(req, res){
    res.status(404);
    res.render('404', {layout: false});
});

app.use(function(err, req, res, next){
    console.error(err.stack);
    res.status(500);
    res.render('500', {layout: false});
});

app.listen(app.get('port'), function(){
 console.log( 'Express started on http://localhost:' +
 app.get('port') + '; press Ctrl-C to terminate.' );
});
