const AWS = require('aws-sdk');

const dynamo = new AWS.DynamoDB.DocumentClient();
const TABLENAME = "athlytics_jy75-options" // this should be converted to an env variable 

exports.handler = async (event, context) => {
    let body;
    let statusCode = '200';
    const headers = {
        'Content-Type': 'application/json',
        "Access-Control-Allow-Origin" : "*",
        "Access-Control-Allow-Credentials" : true
    };
    let command = parseInt(event.headers.command)
    try {
        switch (command) {
            case 1:
                let percentiles = event.headers.percentiles.split(",").map(x => parseFloat(x));
                let threshold = event.headers.threshold;
                let data = await dynamo.scan({ TableName: TABLENAME }).promise();
                body = meanSquareError(data["Items"], percentiles, threshold);
                break;
            default:
                statusCode = '400';
                throw new Error(`Unsupported method "${event.httpMethod}"`);
        }

        
    } catch (err) {
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

function meanSquareError(athletes, percentiles, threshold) {
    let similar = [];
    athletes.forEach(entry => {
        let athlete = entry["athlete"];
        let races = entry["races"];

        let hsRaces = races.filter(race => race.category != "university");
        console.log(hsRaces.length);
        console.log(percentiles.length);
        if (hsRaces.length >= percentiles.length) {
            let length = Math.min(hsRaces.length, percentiles.length);
            let sum = 0;
            for (let i = 0; i < length; i++) {
                sum += Math.pow((hsRaces[i].percentile - percentiles[i]), 2)
            }
            let mse = sum / length;
            
            similar.push({ 'athlete': athlete, 'races': races, 'mse': mse});
        }
    });
    similar.sort((a, b) => a.mse - b.mse);

    let topAthletes = [];
    for (let i = 0; i < Math.min(threshold, similar.length); i++) {
        topAthletes.push(similar[i]);
    }
    return topAthletes;
}
