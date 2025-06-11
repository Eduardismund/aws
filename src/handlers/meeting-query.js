// src/handlers/meeting-query.js
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand } = require('@aws-sdk/lib-dynamodb');

const ddbClient = new DynamoDBClient({ region: process.env.AWS_REGION || 'eu-central-1' });
const dynamodb = DynamoDBDocumentClient.from(ddbClient);

const SAMPLE_TABLE = process.env.SAMPLE_TABLE;

/**
 * Lambda function to handle meeting data queries
 * Single Responsibility: Query and return meeting information
 * Triggered by: API Gateway requests
 */
exports.meetingQueryHandler = async (event) => {
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Content-Type': 'application/json'
    };

    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: corsHeaders,
            body: ''
        };
    }

    try {
        const meetingId = event.pathParameters?.meetingId;

        if (!meetingId) {
            return {
                statusCode: 400,
                headers: corsHeaders,
                body: JSON.stringify({
                    error: 'meetingId is required'
                })
            };
        }

        console.log(`Querying meeting data for: ${meetingId}`);

        // Get meeting record from DynamoDB using AWS SDK v3
        const getCommand = new GetCommand({
            TableName: SAMPLE_TABLE,
            Key: { id: meetingId }
        });

        const result = await dynamodb.send(getCommand);

        if (!result.Item) {
            return {
                statusCode: 404,
                headers: corsHeaders,
                body: JSON.stringify({
                    error: 'Meeting not found'
                })
            };
        }

        const meeting = result.Item;

        // Return clean meeting data
        const response = {
            meetingId: meeting.id,
            fileName: meeting.fileName,
            uploadTimestamp: meeting.uploadTimestamp,
            status: meeting.status,
            transcriptionStatus: meeting.transcriptionStatus || 'pending',
            transcriptionJobStatus: meeting.transcriptionJobStatus || 'PENDING',
            fullTranscript: meeting.fullTranscript || null,
            transcriptionData: meeting.transcriptionData || null,
            errorMessage: meeting.errorMessage || null,
            fileSize: meeting.fileSize || null,
            contentType: meeting.contentType || null,
            createdAt: meeting.createdAt,
            updatedAt: meeting.updatedAt
        };

        return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify(response)
        };

    } catch (error) {
        console.error('Error querying meeting data:', error);
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({
                error: 'Internal server error',
                message: error.message
            })
        };
    }
};