import AWS from 'aws-sdk';

export const handler = async (event, context, callback) => {
    const s3 = new AWS.S3();
    const requestBody = JSON.parse(event.body);
    var retreive_file = "assets/" + requestBody.stateabb + ".json";

    try {
        const s3Params = {
            Bucket: "snotel.info",
            Key: retreive_file
        };
        const s3Data = await s3.getObject(s3Params).promise();
        const contents = s3Data.Body.toString("utf-8");

        var raw = new Object();
        raw = JSON.parse(contents);
        console.log(JSON.stringify(raw));

        var response2 = {
            statusCode: 200,
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Headers": "*",
                "Access-Control-Allow-Origin": event.stageVariables.cors_host,
                "Access-Control-Allow-Methods": "OPTIONS,POST"
            },
            body: JSON.stringify(raw)
        };

        callback(null, response2);
    } catch (err) {
        console.error(err);
        callback(err);
    }
}
