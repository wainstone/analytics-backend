const AWS = require('aws-sdk');

const dynamo = new AWS.DynamoDB.DocumentClient();

exports.handler = async (event, context) => {
    let body;
    let statusCode = '200';
    const headers = {
        'Content-Type': 'application/json',
        "Access-Control-Allow-Origin" : "*",
        "Access-Control-Allow-Credentials" : true
    };
    let command = parseInt(event.headers.command)
    console.log(command)
    try {
        switch (command) {
            case 1:
                body = "FindSimilar called";
                break;
            default:
                throw new Error(`Unsupported method "${event.httpMethod}"`);
        }

        
    } catch (err) {
        statusCode = '400';
        body = err.message;
    } finally {
        body = JSON.stringify(body);
    }
    return {
        statusCode,
        body,
        headers,
    };
};

function meanSquareError(athletes, placements, threshold) {
    let similar = [];
    for (const [athlete, races] of Object.entries(athletes)) {

        let hsRaces = races.filter(race => race.category != "university");

        if (hsRaces.length < placements.length) {
            continue;
        }

        length = Math.min(hsRaces.length, placements.length);
        let sum = 0;
        for (i = 0; i < length; i++) {
            sum += Math.pow((hsRaces[i].place - placements[i]), 2)
        }
        let mse = sum / length;
        
        similar.push({'athlete': athlete, 'mse': mse});
    }
    similar.sort((a, b) => a.mse - b.mse);

    topAthletes = {};
    for (i = 0; i < Math.min(threshold, similar.length); i++) {
        topAthletes[similar[i].athlete] = athletes[similar[i].athlete];
    }
    return topAthletes;
}
