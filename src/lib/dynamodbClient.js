const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand} = require('@aws-sdk/lib-dynamodb');

const ddbClient = new DynamoDBClient({ region: process.env.AWS_REGION || 'eu-central-1' });
const dynamodb = DynamoDBDocumentClient.from(ddbClient);

const SAMPLE_TABLE = process.env.SAMPLE_TABLE;
exports.fetchMeetingById = async (id) => {
    if (!SAMPLE_TABLE) {
        throw new Error('SAMPLE_TABLE environment variable not configured');
    }

    const command = new GetCommand({
        TableName: SAMPLE_TABLE,
        Key: { id }
    });

    try {
        const result = await dynamodb.send(command);
        return result.Item || null;
    } catch (error) {
        console.error('Error fetching meeting from DynamoDB:', {
            meetingId: id,
            error: error.message
        });
        throw error;
    }
};

exports.createMeetingRecord = async (meetingRecord) => {
    if (!SAMPLE_TABLE) {
        throw new Error('SAMPLE_TABLE environment variable is not configured');
    }

    try {
        const command = new PutCommand({
            TableName: SAMPLE_TABLE,
            Item: meetingRecord,
            ConditionExpression: 'attribute_not_exists(id)'
        });

        await dynamodb.send(command);
        return meetingRecord;

    } catch (error) {
        if (error.name === 'ConditionalCheckFailedException') {
            throw new Error(`Meeting with ID ${meetingRecord.id} already exists`);
        }

        throw new Error(`Failed to create meeting record: ${error.message}`);
    }
};

exports.updateMeetingRecord = async (id, updates) => {
    if (!SAMPLE_TABLE) {
        throw new Error('SAMPLE_TABLE environment variable not configured');
    }

    const updateExpressions = [];
    const attributeValues = {};

    Object.entries(updates).forEach(([key, value]) => {
        updateExpressions.push(`${key} = :${key}`);
        attributeValues[`:${key}`] = value;
    });

    const command = new UpdateCommand({
        TableName: SAMPLE_TABLE,
        Key: { id },
        UpdateExpression: `SET ${updateExpressions.join(', ')}`,
        ExpressionAttributeValues: attributeValues,
        ReturnValues: 'UPDATED_NEW'
    });

    try {
        const result = await dynamodb.send(command);
        return result.Attributes;
    } catch (error) {
        throw error;
    }
};