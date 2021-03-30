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
        if (event.queryStringParameters == undefined) {
            throw "no query string parameters were given"
        }
        let command = event.queryStringParameters.command;
        if (command == undefined) {
            throw "command not given"
        }
        command = parseInt(command);
        if (isNaN(command)) {
            throw "given command was not a number";
        }
        console.log("Received command " + command);
        
        switch (command) {
            case 1:
                var percentiles = event.queryStringParameters.percentiles.split(",").map(x => parseFloat(x));
                var threshold = event.queryStringParameters.threshold;
                var data = await dynamo.scan({ TableName: TABLENAME }).promise();
                body = meanSquareError(data["Items"], percentiles, threshold);
                break;
            case 2: 
                var percentiles = event.queryStringParameters.percentiles.split(",").map(x => parseFloat(x));
                var numAthletes = event.queryStringParameters.threshold;
                var data = await dynamo.scan({ TableName: TABLENAME }).promise();
                body = findPlacers(data["Items"], percentiles, 5, numAthletes);
                break;
            case 3:
                var params = { TableName: TABLENAME };
                if (event.queryStringParameters.name || event.queryStringParameters.gender) {
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
                throw new Error(`Unsupported method`);
        }
    } catch (err) {
        statusCode = '400';
        console.log("ERROR CAUGHT: " + err)
        body = err;
    } finally {
        body = JSON.stringify(body);
    }
    return {
        statusCode,
        body,
        headers,
    };
};

function findPlacers(athletes, percentiles, threshold, numAthletes) {
    let seeds = {}; // Uni athletes who passed the placement test. Used to get eligible athletes.
    if (percentiles.length != 2) {
        throw "list of percentiles is not length 2"
    }
    if (threshold == undefined) {
        throw "threshold not given"
    }
    if (numAthletes == undefined) {
        throw "numAthletes not given"
    }
    let low = Math.min(...percentiles);
    let high = Math.max(...percentiles);
    if (high > 1) {
        throw "max percentile was above 1. Percentiles should be between 0 and 1"
    }

    athletes.forEach(entry => {
        let athlete = entry["athlete"];
        let races = entry["races"];
        let uniRaces = races.filter(race => race.category == "university");
        let good = false;

        for (let i = 0; i < uniRaces.length; i++) {
            let race = uniRaces[i];
            if (low <= race.percentile && race.percentile <= high) { // Maybe add MSE here compared against placements in the range to prioritize athletes who land more in the range. Multiply the MSE of an athlete to the middle of the range with a seed athlete's similar athlete result MSEs
                good = true;
                break;
            }
        }
        // Seed athlete should have at least 3 highschool races for good similarity comparisons.
        if (good && 3 <= races.filter(race => race.category != "university").length) {
            seeds[athlete] = races;
        }
    });
    
    let intermediate = [] // all athletes returned from the similarity algorithm for each seed athlete
    for (const athlete in seeds) {
        let races = seeds[athlete];
        let hsRaces = races.filter(race => race.category != "university");
        let hsPlacements = hsRaces.map(x => x.percentile);
        intermediate.push(...meanSquareError(athletes, hsPlacements, threshold)); // Push all similar athletes onto the list. Will contain duplicates (but with different MSE's)
    }
    // Since intermediate might contain duplicate athletes (because two seed athletes could find the same athlete as similar), average their MSE's
    let averaged = averageMses(intermediate);
    averaged.sort((a,b) => a.mse - b.mse);
    return averaged.slice(0, numAthletes) // Let the frontend do the rest of the filtering on this set
}

// Helper function for findPlacers. Returns the averaged MSEs of the intermediate list of similar athletes.
function averageMses(intermediate) {
    let unique = {};
    let averagedList = []; // contains list of unique athletes with averaged MSEs.
    let copy = [...intermediate];

    copy.forEach((entry) => {
        if (entry.athlete in unique) {
            unique[entry.athlete].mses.push(entry.mse);
        }
        else {
            unique[entry.athlete] = entry;
            unique[entry.athlete].mses = [entry.mse]; // add field to hold list of mses
        }
    });
    Object.values(unique).forEach(entry => {
        averagedList.push({'athlete': entry.athlete, 'races': entry.races, 'mse': (entry.mses.reduce((a, b) => a + b) / entry.mses.length)})
    })
    
    return averagedList;
}

function meanSquareError(athletes, percentiles, threshold) {
    if (percentiles == undefined) {
        throw "percentiles not given";
    }
    if (threshold == undefined) {
        throw "threshold not given";
    }
    let similar = [];

    athletes.forEach(entry => {
        let athlete = entry["athlete"];
        let races = entry["races"];

        let hsRaces = races.filter(race => race.category != "university");
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
