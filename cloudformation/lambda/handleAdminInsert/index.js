const AWS = require('aws-sdk');

const dynamo = new AWS.DynamoDB.DocumentClient();
const tableName = 'athlytics_jy75-dev';

async function getExistingRaces(athleteName){
    const params = {
        TableName : tableName,
        FilterExpression : 'athlete = :athlete_Name',
        ExpressionAttributeValues : {':athlete_Name' : athleteName}
    };
    const existingAthlete  = await dynamo.scan(params).promise();
    if (!existingAthlete.Items || existingAthlete.Items.length == 0)
        return [];
    else
        return existingAthlete.Items[0].races;
}

async function uploadData(body) {
    if (!body || !body.athletes) 
        throw new Error("Athletes not found");
    const res = {"athletes": []};
    const athletes = body.athletes;

    for (let i = 0; i < athletes.length; i++) {
        const existingRaces = await getExistingRaces(athletes[i].athlete);
        const newAthlte = {};
        newAthlte.TableName = tableName;
        newAthlte.Item = {};
        newAthlte.Item.athlete = athletes[i].athlete;
        newAthlte.Item.gender = athletes[i].gender;
        newAthlte.Item.notes = athletes[i].notes;
        newAthlte.Item.races = existingRaces;
        newAthlte.Item.races.push(...athletes[i].races);
        await dynamo.put(newAthlte).promise();
        res.athletes.push(newAthlte);
    }
    return res;
}

/**
 * Update the athlete database upon a PUT with new races.
 * 
 * SAMPLE PAYLOAD:
 * {
 *     "athletes": [
 *         {
 *             "athlete": "athleteName",
 *             "races": [
 *                 {
 *                     "category": "JG",
 *                     "place": 13,
 *                     "province": "ON",
 *                     "year": 2022
 *                 }
 *             ]
 *         }
 *     ]
 * }
 */
exports.handler = async (event, context) => {
    let body;
    let statusCode = '200';
    const headers = {
        'Content-Type': 'application/json',
    };
    try {
        switch (event.httpMethod) {
            case 'PUT':
                body = await uploadData(JSON.parse(event.body));
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
