// src/handlers/audio-upload-processor.js
const { S3Client, HeadObjectCommand } = require('@aws-sdk/client-s3');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');
const { randomUUID } = require('crypto');

const s3Client = new S3Client({ region: process.env.AWS_REGION || 'eu-central-1' });
const ddbClient = new DynamoDBClient({ region: process.env.AWS_REGION || 'eu-central-1' });
const docClient = DynamoDBDocumentClient.from(ddbClient);

const AUDIO_BUCKET = process.env.AUDIO_BUCKET;
const SAMPLE_TABLE = process.env.SAMPLE_TABLE;

/**
 * Lambda function to process S3 upload events and create meeting records
 * Single Responsibility: Handle file upload events and create database records
 */
exports.audioUploadProcessor = async (event) => {
    console.log('S3 Upload event:', JSON.stringify(event, null, 2));

    try {
        // Handle EventBridge events from S3
        if (event.source === 'aws.s3' && event['detail-type'] === 'Object Created') {
            const bucketName = event.detail.bucket.name;
            const objectKey = decodeURIComponent(event.detail.object.key);

            console.log(`Processing uploaded audio file: ${objectKey} from bucket: ${bucketName}`);
            await createMeetingRecord(bucketName, objectKey);
        }
        // Handle direct S3 events (fallback for testing)
        else if (event.Records) {
            for (const record of event.Records) {
                if (record.eventSource === 'aws:s3' && record.eventName.startsWith('ObjectCreated')) {
                    const bucketName = record.s3.bucket.name;
                    const objectKey = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));

                    console.log(`Processing uploaded audio file: ${objectKey} from bucket: ${bucketName}`);
                    await createMeetingRecord(bucketName, objectKey);
                }
            }
        }
        else {
            console.log('Event not recognized as S3 upload event');
            return {
                statusCode: 400,
                body: JSON.stringify({ message: 'Invalid event source - expected S3 upload event' })
            };
        }

        return {
            statusCode: 200,
            body: JSON.stringify({
                message: 'Audio upload processed successfully'
            })
        };

    } catch (error) {
        console.error('Audio upload processing error:', error);
        throw error;
    }
};

/**
 * Create a meeting record in DynamoDB for the uploaded audio file
 */
async function createMeetingRecord(bucketName, objectKey) {
    try {
        // Get object metadata
        const headCommand = new HeadObjectCommand({
            Bucket: bucketName,
            Key: objectKey
        });

        const headResult = await s3Client.send(headCommand);
        const metadata = headResult.Metadata || {};

        // Extract meeting information
        const meetingId = metadata['meeting-id'] || extractMeetingIdFromKey(objectKey);
        const originalName = metadata['original-name'] || objectKey.split('/').pop();
        const uploadTimestamp = metadata['upload-timestamp'] || new Date().toISOString();

        // Create meeting record in DynamoDB
        const meetingRecord = {
            id: meetingId,
            fileName: originalName,
            s3Key: objectKey,
            s3Bucket: bucketName,
            uploadTimestamp: uploadTimestamp,
            status: 'uploaded',
            transcriptionStatus: 'pending',
            fileSize: headResult.ContentLength,
            contentType: headResult.ContentType,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        // Save to DynamoDB
        const putCommand = new PutCommand({
            TableName: SAMPLE_TABLE,
            Item: meetingRecord
        });

        await docClient.send(putCommand);

        console.log(`Meeting record created: ${meetingId} for file: ${originalName}`);

    } catch (error) {
        console.error(`Error creating meeting record for file ${objectKey}:`, error);
        throw error;
    }
}

/**
 * Extract meeting ID from S3 object key
 */
function extractMeetingIdFromKey(objectKey) {
    // For keys like "meetings/meeting123/file.mp3", extract "meeting123"
    const parts = objectKey.split('/');
    if (parts[0] === 'meetings' && parts.length > 1) {
        return parts[1];
    }

    // For other formats, generate a UUID
    return randomUUID();
}