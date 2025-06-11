// src/handlers/transcription-starter.js
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { TranscribeClient, StartTranscriptionJobCommand } = require('@aws-sdk/client-transcribe');
const { unmarshall } = require('@aws-sdk/util-dynamodb');

const ddbClient = new DynamoDBClient({ region: process.env.AWS_REGION || 'eu-central-1' });
const dynamodb = DynamoDBDocumentClient.from(ddbClient);
const transcribeClient = new TranscribeClient({ region: process.env.AWS_REGION || 'eu-central-1' });

const AUDIO_BUCKET = process.env.AUDIO_BUCKET;
const SAMPLE_TABLE = process.env.SAMPLE_TABLE;

/**
 * Lambda function to start transcription jobs for uploaded audio files
 * Single Responsibility: Start Amazon Transcribe jobs
 * Triggered by: DynamoDB Streams when new records with status 'uploaded' are created
 */
exports.transcriptionStarter = async (event) => {
    console.log('DynamoDB Stream event:', JSON.stringify(event, null, 2));

    try {
        // Process DynamoDB stream records
        if (event.Records) {
            for (const record of event.Records) {
                if (record.eventName === 'INSERT' && record.dynamodb.NewImage) {
                    // Use AWS SDK v3 unmarshall utility
                    const newRecord = unmarshall(record.dynamodb.NewImage);

                    // Only process records that are uploaded and need transcription
                    if (newRecord.status === 'uploaded' && newRecord.transcriptionStatus === 'pending') {
                        console.log(`Starting transcription for meeting: ${newRecord.id}`);
                        await startTranscriptionJob(newRecord);
                    }
                }
            }
        }
        // Handle direct invocation (for testing or manual trigger)
        else if (event.meetingId) {
            // Get meeting record from DynamoDB using AWS SDK v3
            const getCommand = new GetCommand({
                TableName: SAMPLE_TABLE,
                Key: { id: event.meetingId }
            });

            const result = await dynamodb.send(getCommand);

            if (result.Item) {
                await startTranscriptionJob(result.Item);
            } else {
                throw new Error(`Meeting record not found: ${event.meetingId}`);
            }
        }
        else {
            console.log('Event not recognized as DynamoDB stream or direct invocation');
            return {
                statusCode: 400,
                body: JSON.stringify({ message: 'Invalid event source' })
            };
        }

        return {
            statusCode: 200,
            body: JSON.stringify({
                message: 'Transcription jobs started successfully'
            })
        };

    } catch (error) {
        console.error('Transcription starter error:', error);
        throw error;
    }
};

/**
 * Start an Amazon Transcribe job for the meeting record
 */
async function startTranscriptionJob(meetingRecord) {
    const { id: meetingId, s3Bucket, s3Key, fileName } = meetingRecord;
    const transcriptionJobName = `meeting-transcription-${meetingId}-${Date.now()}`;

    const transcriptionCommand = new StartTranscriptionJobCommand({
        TranscriptionJobName: transcriptionJobName,
        LanguageCode: 'en-US', // You can make this configurable
        MediaFormat: getMediaFormat(fileName),
        Media: {
            MediaFileUri: `s3://${s3Bucket}/${s3Key}`
        },
        OutputBucketName: s3Bucket,
        OutputKey: `transcriptions/${meetingId}/`,
        Settings: {
            ShowSpeakerLabels: true,
            MaxSpeakerLabels: 10,
            ShowAlternatives: true,
            MaxAlternatives: 3
        }
    });

    try {
        const result = await transcribeClient.send(transcriptionCommand);
        console.log('Transcription job started:', result.TranscriptionJob.TranscriptionJobName);

        // Update DynamoDB with transcription job details using AWS SDK v3
        const updateCommand = new UpdateCommand({
            TableName: SAMPLE_TABLE,
            Key: { id: meetingId },
            UpdateExpression: 'SET transcriptionJobName = :jobName, transcriptionJobStatus = :status, transcriptionStatus = :transcriptionStatus, updatedAt = :timestamp',
            ExpressionAttributeValues: {
                ':jobName': transcriptionJobName,
                ':status': 'IN_PROGRESS',
                ':transcriptionStatus': 'transcribing',
                ':timestamp': new Date().toISOString()
            }
        });

        await dynamodb.send(updateCommand);

        console.log(`Transcription started for meeting: ${meetingId}`);
        return result;

    } catch (error) {
        console.error('Failed to start transcription job:', error);

        // Update DynamoDB with error status using AWS SDK v3
        const updateCommand = new UpdateCommand({
            TableName: SAMPLE_TABLE,
            Key: { id: meetingId },
            UpdateExpression: 'SET transcriptionStatus = :status, transcriptionJobStatus = :jobStatus, errorMessage = :error, updatedAt = :timestamp',
            ExpressionAttributeValues: {
                ':status': 'failed',
                ':jobStatus': 'FAILED',
                ':error': error.message,
                ':timestamp': new Date().toISOString()
            }
        });

        await dynamodb.send(updateCommand);

        throw error;
    }
}

/**
 * Determine media format from file extension
 */
function getMediaFormat(fileName) {
    const extension = fileName.toLowerCase().split('.').pop();

    switch (extension) {
        case 'mp3':
            return 'mp3';
        case 'mp4':
        case 'm4a':
            return 'mp4';
        case 'wav':
            return 'wav';
        case 'flac':
            return 'flac';
        case 'ogg':
            return 'ogg';
        case 'amr':
            return 'amr';
        case 'webm':
            return 'webm';
        default:
            return 'mp3'; // Default fallback
    }
}