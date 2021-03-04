const AWS = require('aws-sdk');

const dynamo = new AWS.DynamoDB.DocumentClient();
const TABLENAME = "athlytics_jy75-dev"; // this should be converted to an env variable


async function filterAthletes(queryParams, athletes) {
    let athleteIdx = athletes.length;
    while (athleteIdx--) {
        let races = athletes[athleteIdx].races;
        let filtered = true;
        for (let raceIdx = 0; raceIdx < races.length; raceIdx++) {
            filtered = true;
            if (!queryParams.province || queryParams.province == races[raceIdx].province)
                filtered = filtered && true;
            else
                filtered = filtered && false;
            if (!queryParams.syear || queryParams.syear <= races[raceIdx].year)
                filtered = filtered && true;
            else
                filtered = filtered && false;
            if (!queryParams.eyear || queryParams.eyear >= races[raceIdx].year)
                filtered = filtered && true;
            else
                filtered = filtered && false;
            if (!queryParams.splace || queryParams.splace <= races[raceIdx].place)
                filtered = filtered && true;
            else
                filtered = filtered && false;
            if (!queryParams.eplace || queryParams.eplace >= races[raceIdx].place)
                filtered = filtered && true;
            else
                filtered = filtered && false;
            if (filtered)
                break;
        }
        if (!filtered)
            athletes.splice(athleteIdx, 1);
    }
}

exports.handler = async (event, context) => {
    let body;
    let statusCode = '200';
    const headers = {
        'Content-Type': 'application/json',
        "Access-Control-Allow-Origin" : "*",
        "Access-Control-Allow-Credentials" : true
    };

    try {
        let command = parseInt(event.queryStringParameters.command);
        switch (command) {
            case 1:
                let percentiles = event.queryStringParameters.percentiles.split(",").map(x => parseFloat(x));
                let threshold = event.queryStringParameters.threshold;
                let data = await dynamo.scan({ TableName: TABLENAME }).promise();
                body = meanSquareError(data["Items"], percentiles, threshold);
                break;
            case 3:
                var params = { TableName: TABLENAME };
                if (event.queryStringParameters.name || event.queryStringParameters.gender || event.queryStringParameters.province ||
                   event.queryStringParameters.splace || event.queryStringParameters.eplace) {
                       params.ExpressionAttributeNames = {};
                       params.ExpressionAttributeValues = {};
                       params.FilterExpression = "";
                }
                if (event.queryStringParameters.name) {
                    params.ExpressionAttributeNames["#name"] = "athlete";
                    params.ExpressionAttributeValues[":name"] = event.queryStringParameters.name;
                    if (params.FilterExpression === "")
                        params.FilterExpression = "#name = :name";
                    else
                        params.FilterExpression += " AND #name = :name";
                }
                if (event.queryStringParameters.gender) {
                    params.ExpressionAttributeNames["#gender"] = "gender";
                    params.ExpressionAttributeValues[":gender"] = event.queryStringParameters.gender;
                    if (params.FilterExpression === "")
                        params.FilterExpression = "#gender = :gender";
                    else
                        params.FilterExpression += " AND #gender = :gender";
                }
                body = await dynamo.scan(params).promise();
                await filterAthletes(event.queryStringParameters, body.Items);
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
