// src/handlers/transcription-complete-processor.js
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { TranscribeClient, GetTranscriptionJobCommand } = require('@aws-sdk/client-transcribe');

const s3Client = new S3Client({ region: process.env.AWS_REGION || 'eu-central-1' });
const ddbClient = new DynamoDBClient({ region: process.env.AWS_REGION || 'eu-central-1' });
const dynamodb = DynamoDBDocumentClient.from(ddbClient);
const transcribeClient = new TranscribeClient({ region: process.env.AWS_REGION || 'eu-central-1' });

const AUDIO_BUCKET = process.env.AUDIO_BUCKET;
const SAMPLE_TABLE = process.env.SAMPLE_TABLE;

/**
 * Lambda function to process completed transcription jobs
 * Single Responsibility: Handle transcription completion and store results
 * Triggered by: EventBridge events from Amazon Transcribe
 */
exports.transcriptionCompleteProcessor = async (event) => {
    console.log('Transcription completion event:', JSON.stringify(event, null, 2));

    try {
        // Handle EventBridge events from Transcribe
        if (event.source === 'aws.transcribe' && event['detail-type'] === 'Transcribe Job State Change') {
            const jobName = event.detail.TranscriptionJobName;
            const jobStatus = event.detail.TranscriptionJobStatus;

            console.log(`Processing transcription job: ${jobName} with status: ${jobStatus}`);

            if (jobStatus === 'COMPLETED') {
                await processCompletedTranscription(jobName);

                // Optional: Send completion event to EventBridge
                const params = {
                    Entries: [
                        {
                            Source: "transcription-complete-processor.js",
                            DetailType: "TranscriptionFinished",
                            Detail: JSON.stringify({
                                message: "The task creation is able to start",
                                jobName: jobName,
                                status: jobStatus
                            }),
                            EventBusName: "default",
                        },
                    ],
                };

                try {
                    const command = new PutEventsCommand(params);
                    console.log("EventBridge PutEvents response:", response);
                } catch (err) {
                    console.error("Failed to send event to EventBridge:", err);
                    // Don't throw here - transcription processing succeeded
                }
            } else if (jobStatus === 'FAILED') {
                await processFailedTranscription(jobName, event.detail);
            } else {
                console.log(`Ignoring transcription job status: ${jobStatus}`);
            }

            return {
                statusCode: 200,
                body: JSON.stringify({
                    message: `Transcription job ${jobStatus} processed successfully`
                })
            };
        }
        else {
            console.log('Event not recognized as Transcribe completion event');
            return {
                statusCode: 400,
                body: JSON.stringify({ message: 'Invalid event source - expected Transcribe event' })
            };
        }

    } catch (error) {
        console.error('Transcription completion processing error:', error);
        throw error;
    }
};

/**
 * Process a completed transcription job
 */
async function processCompletedTranscription(jobName) {
    try {
        // Get transcription job details using AWS SDK v3
        const getJobCommand = new GetTranscriptionJobCommand({
            TranscriptionJobName: jobName
        });

        const transcribeResult = await transcribeClient.send(getJobCommand);
        const transcriptUri = transcribeResult.TranscriptionJob.Transcript.TranscriptFileUri;

        // Extract meeting ID from job name
        const meetingId = extractMeetingIdFromJobName(jobName);

        if (!meetingId) {
            console.error(`Could not extract meeting ID from job name: ${jobName}`);
            return;
        }

        console.log(`Processing completed transcription for meeting: ${meetingId}`);

        // Download transcription results from S3
        const transcriptionData = await downloadTranscriptionResults(transcriptUri);

        // Extract full transcript text
        const fullTranscript = extractFullTranscript(transcriptionData);

        // Store results in DynamoDB
        await storeTranscriptionResults(meetingId, transcriptionData, fullTranscript);

        console.log(`Transcription results stored successfully for meeting: ${meetingId}`);

    } catch (error) {
        console.error('Error processing completed transcription:', error);
        throw error;
    }
}

/**
 * Process a failed transcription job
 */
async function processFailedTranscription(jobName, details) {
    try {
        const meetingId = extractMeetingIdFromJobName(jobName);

        if (!meetingId) {
            console.error(`Could not extract meeting ID from job name: ${jobName}`);
            return;
        }

        console.log(`Processing failed transcription for meeting: ${meetingId}`);

        // Update meeting record with failed status using AWS SDK v3
        const updateCommand = new UpdateCommand({
            TableName: SAMPLE_TABLE,
            Key: { id: meetingId },
            UpdateExpression: 'SET transcriptionStatus = :status, transcriptionJobStatus = :jobStatus, errorMessage = :error, updatedAt = :timestamp',
            ExpressionAttributeValues: {
                ':status': 'failed',
                ':jobStatus': 'FAILED',
                ':error': details.FailureReason || 'Transcription job failed',
                ':timestamp': new Date().toISOString()
            }
        });

        await dynamodb.send(updateCommand);

        console.log(`Transcription failure recorded for meeting: ${meetingId}`);

    } catch (error) {
        console.error('Error processing failed transcription:', error);
        throw error;
    }
}

/**
 * Download transcription results from S3
 */
async function downloadTranscriptionResults(transcriptUri) {
    console.log(`Processing transcription URI: ${transcriptUri}`);

    // Parse different S3 URI formats
    let bucket, key;

    if (transcriptUri.startsWith('https://s3.')) {
        // Format: https://s3.region.amazonaws.com/bucket-name/key
        const urlParts = new URL(transcriptUri);
        const pathParts = urlParts.pathname.substring(1).split('/'); // Remove leading slash and split
        bucket = pathParts[0];
        key = pathParts.slice(1).join('/');
    } else if (transcriptUri.startsWith('https://')) {
        // Format: https://bucket-name.s3.region.amazonaws.com/key
        const urlParts = new URL(transcriptUri);
        bucket = urlParts.hostname.split('.')[0];
        key = urlParts.pathname.substring(1); // Remove leading slash
    } else {
        throw new Error(`Unsupported S3 URI format: ${transcriptUri}`);
    }

    console.log(`Downloading transcription from bucket: ${bucket}, key: ${key}`);

    const getObjectCommand = new GetObjectCommand({
        Bucket: bucket,
        Key: key
    });

    const transcriptObject = await s3Client.send(getObjectCommand);

    // Convert stream to string for AWS SDK v3
    const chunks = [];
    for await (const chunk of transcriptObject.Body) {
        chunks.push(chunk);
    }
    const transcriptString = Buffer.concat(chunks).toString('utf-8');

    return JSON.parse(transcriptString);
}

/**
 * Extract full transcript text from transcription data
 */
function extractFullTranscript(transcriptionData) {
    if (!transcriptionData.results || !transcriptionData.results.items) {
        return '';
    }

    return transcriptionData.results.items
        .filter(item => item.type === 'pronunciation')
        .map(item => item.alternatives[0].content)
        .join(' ');
}

/**
 * Store transcription results in DynamoDB
 */
async function storeTranscriptionResults(meetingId, transcriptionData, fullTranscript) {
    const updateCommand = new UpdateCommand({
        TableName: SAMPLE_TABLE,
        Key: { id: meetingId },
        UpdateExpression: 'SET transcriptionStatus = :status, transcriptionJobStatus = :jobStatus, transcriptionData = :data, fullTranscript = :transcript, updatedAt = :timestamp',
        ExpressionAttributeValues: {
            ':status': 'completed',
            ':jobStatus': 'COMPLETED',
            ':data': transcriptionData,
            ':transcript': fullTranscript,
            ':timestamp': new Date().toISOString()
        }
    });

    await dynamodb.send(updateCommand);
}

/**
 * Extract meeting ID from transcription job name
 */
function extractMeetingIdFromJobName(jobName) {
    // Extract meeting ID from job name format: meeting-transcription-{meetingId}-{timestamp}
    const match = jobName.match(/meeting-transcription-(.+)-\d+$/);
    return match ? match[1] : null;
}