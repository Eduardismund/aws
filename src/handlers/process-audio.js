// src/handlers/process-audio.js
const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');

const s3 = new AWS.S3();
const dynamodb = new AWS.DynamoDB.DocumentClient();
const transcribe = new AWS.TranscribeService();

const AUDIO_BUCKET = process.env.AUDIO_BUCKET;
const SAMPLE_TABLE = process.env.SAMPLE_TABLE;

/**
 * Lambda function triggered by EventBridge events from S3 to process uploaded audio files
 * This function starts the transcription pipeline for the Smart Meeting Intelligence system
 */
exports.processAudioHandler = async (event) => {
    try {
        // Handle EventBridge events from S3
        if (event.source === 'aws.s3' && event['detail-type'] === 'Object Created') {
            const bucketName = event.detail.bucket.name;
            const objectKey = decodeURIComponent(event.detail.object.key);

            console.log(`Processing audio file: ${objectKey} from bucket: ${bucketName}`);

            await processAudioFile(bucketName, objectKey);
        }
        // Handle direct S3 events (fallback for testing)
        else if (event.Records) {
            for (const record of event.Records) {
                if (record.eventSource === 'aws:s3' && record.eventName.startsWith('ObjectCreated')) {
                    const bucketName = record.s3.bucket.name;
                    const objectKey = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));

                    console.log(`Processing audio file: ${objectKey} from bucket: ${bucketName}`);

                    await processAudioFile(bucketName, objectKey);
                }
            }
        }
        else {
            console.log('Event not recognized as S3 or EventBridge event');
            return {
                statusCode: 400,
                body: JSON.stringify({ message: 'Invalid event source' })
            };
        }

        return {
            statusCode: 200,
            body: JSON.stringify({
                message: 'Audio files processed successfully'
            })
        };

    } catch (error) {
        console.error('Audio processing error:', error);
        throw error;
    }
};

/**
 * Process a single audio file
 */
async function processAudioFile(bucketName, objectKey) {
    try {
        // Get object metadata
        const headParams = {
            Bucket: bucketName,
            Key: objectKey
        };

        const headResult = await s3.headObject(headParams).promise();
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
        await dynamodb.put({
            TableName: SAMPLE_TABLE,
            Item: meetingRecord
        }).promise();

        console.log(`Meeting record created: ${meetingId}`);

        // Start transcription job
        await startTranscriptionJob(meetingId, bucketName, objectKey);

        // Update status to transcribing
        await dynamodb.update({
            TableName: SAMPLE_TABLE,
            Key: { id: meetingId },
            UpdateExpression: 'SET transcriptionStatus = :status, updatedAt = :timestamp',
            ExpressionAttributeValues: {
                ':status': 'transcribing',
                ':timestamp': new Date().toISOString()
            }
        }).promise();

        console.log(`Started transcription for meeting: ${meetingId}`);

    } catch (error) {
        console.error(`Error processing file ${objectKey}:`, error);
        throw error;
    }
}

/**
 * Start an Amazon Transcribe job for the uploaded audio file
 */
async function startTranscriptionJob(meetingId, bucketName, objectKey) {
    const transcriptionJobName = `meeting-transcription-${meetingId}-${Date.now()}`;

    const transcriptionParams = {
        TranscriptionJobName: transcriptionJobName,
        LanguageCode: 'en-US', // You can make this configurable
        MediaFormat: getMediaFormat(objectKey),
        Media: {
            MediaFileUri: `s3://${bucketName}/${objectKey}`
        },
        OutputBucketName: bucketName,
        OutputKey: `transcriptions/${meetingId}/`,
        Settings: {
            ShowSpeakerLabels: true,
            MaxSpeakerLabels: 10,
            ShowAlternatives: true,
            MaxAlternatives: 3
        }
    };

    try {
        const result = await transcribe.startTranscriptionJob(transcriptionParams).promise();
        console.log('Transcription job started:', result.TranscriptionJob.TranscriptionJobName);

        // Update DynamoDB with transcription job details
        await dynamodb.update({
            TableName: SAMPLE_TABLE,
            Key: { id: meetingId },
            UpdateExpression: 'SET transcriptionJobName = :jobName, transcriptionJobStatus = :status',
            ExpressionAttributeValues: {
                ':jobName': transcriptionJobName,
                ':status': 'IN_PROGRESS'
            }
        }).promise();

        return result;
    } catch (error) {
        console.error('Failed to start transcription job:', error);

        // Update DynamoDB with error status
        await dynamodb.update({
            TableName: SAMPLE_TABLE,
            Key: { id: meetingId },
            UpdateExpression: 'SET transcriptionStatus = :status, errorMessage = :error',
            ExpressionAttributeValues: {
                ':status': 'failed',
                ':error': error.message
            }
        }).promise();

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
    return uuidv4();
}

/**
 * Determine media format from file extension
 */
function getMediaFormat(objectKey) {
    const extension = objectKey.toLowerCase().split('.').pop();

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