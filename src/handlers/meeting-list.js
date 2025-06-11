// src/handlers/meeting-list.js
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand } = require('@aws-sdk/lib-dynamodb');

const ddbClient = new DynamoDBClient({ region: process.env.AWS_REGION || 'eu-central-1' });
const dynamodb = DynamoDBDocumentClient.from(ddbClient);

const SAMPLE_TABLE = process.env.SAMPLE_TABLE;

/**
 * Lambda function to list all meetings
 * Single Responsibility: Return paginated list of meetings
 * Triggered by: API Gateway requests
 */
exports.meetingListHandler = async (event) => {
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

        // Get query parameters for pagination
        const limit = parseInt(event.queryStringParameters?.limit) || 20;
        const lastEvaluatedKey = event.queryStringParameters?.lastKey;

        const scanParams = {
            TableName: SAMPLE_TABLE,
            Limit: limit,
            ProjectionExpression: 'id, fileName, uploadTimestamp, #status, transcriptionStatus, transcriptionJobStatus, createdAt, updatedAt, fileSize',
            ExpressionAttributeNames: {
                '#status': 'status' // 'status' is a reserved word in DynamoDB
            }
        };

        // Add pagination if provided
        if (lastEvaluatedKey) {
            scanParams.ExclusiveStartKey = {
                id: lastEvaluatedKey
            };
        }

        // Execute scan using AWS SDK v3
        const scanCommand = new ScanCommand(scanParams);
        const result = await dynamodb.send(scanCommand);

        // Format response data
        const meetings = result.Items.map(meeting => ({
            meetingId: meeting.id,
            fileName: meeting.fileName,
            uploadTimestamp: meeting.uploadTimestamp,
            status: meeting.status,
            transcriptionStatus: meeting.transcriptionStatus || 'pending',
            transcriptionJobStatus: meeting.transcriptionJobStatus || 'PENDING',
            fileSize: meeting.fileSize || null,
            createdAt: meeting.createdAt,
            updatedAt: meeting.updatedAt
        }));

        // Sort by creation date (newest first)
        meetings.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        const response = {
            meetings: meetings,
            count: meetings.length,
            lastEvaluatedKey: result.LastEvaluatedKey?.id || null,
            hasMore: !!result.LastEvaluatedKey
        };

        return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify(response)
        };

    } catch (error) {
        console.error('Error listing meetings:', error);
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