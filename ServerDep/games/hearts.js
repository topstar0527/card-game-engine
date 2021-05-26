exports.newDeck=function newDeck(){
    var deck=[];
    for(var i=0; i<52; i++){
	var suit=Math.floor(i/13);
	var card=i%13+2;
	deck.push([suit, card]);
    }
    return deck;
};

exports.gameStats={
    maxplayers: 4
};
