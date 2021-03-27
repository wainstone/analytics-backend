const AWS = require('aws-sdk');
const dynamo = new AWS.DynamoDB.DocumentClient();

let TABLENAME = "athlytics_jy75-ben";

/**
* Demonstrates a simple HTTP endpoint using API Gateway. You have full
* access to the request and response payload, including headers and
* status code.
*
* To scan a DynamoDB table, make a GET request with the TableName as a
* query string parameter. To put, update, or delete an item, make a POST,
* PUT, or DELETE request respectively, passing in the payload to the
* DynamoDB API as a JSON body.
*/
exports.handler = async (event, context) => {
    let body;
    let statusCode = '200';
    const headers = {
        'Content-Type': 'application/json',
        "Access-Control-Allow-Origin" : "*", // Required for CORS support to work
        "Access-Control-Allow-Credentials" : true // Required for cookies, authorization headers with HTTPS 
    };

    try {
        let command = parseInt(event.queryStringParameters.command);
        console.log("received command: " + command);
        switch (command) {
            case 1:
                var athlete = event.queryStringParameters.athlete;
                var gender = event.queryStringParameters.gender;
                var notes = event.queryStringParameters.notes;
                body = await updateNotes(athlete, notes, dynamo);
                break;
            case 2:
                console.log(event)
                body = await dynamo.put(JSON.parse(event.body)).promise();
                break;
            default:
                throw new Error(`Unsupported method "${event.httpMethod}"`);
        }
    } catch (err) {
        statusCode = '400';
        console.log("CAUGHT ERROR:" + err);
        if (err.message.includes("conditional request failed")) {
            err.message = "given athlete did not exist: " + event.queryStringParameters.athlete
        }
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

async function updateNotes(athlete, notes) {
    if (athlete == undefined) {
        throw "athlete is undefined";
    }
    if (notes == undefined || notes.len == 0) {
        throw "notes is undefined or empty";
    }
    var params = {
        TableName: TABLENAME,
        Key:{
            "athlete": athlete
        },
        ConditionExpression: 'attribute_exists(athlete)',
        UpdateExpression: "set notes = :p",
        ExpressionAttributeValues:{
            ":p": notes
        },
        ReturnValues:"UPDATED_NEW"
    };

    let ret = await dynamo.update(params).promise();

    return "updated: " + JSON.stringify(ret)
}