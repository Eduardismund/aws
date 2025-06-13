// src/services/event-publisher.js
const { EventBridgeClient, PutEventsCommand } = require('@aws-sdk/client-eventbridge');

const eventBridgeClient = new EventBridgeClient({
    region: process.env.AWS_REGION || 'eu-central-1'
});

/**
 * Publish transcription ready event after successful file upload
 * @param {Object} meeting - Meeting record with id, s3Bucket, s3Key, fileName
 * @returns {Object} Event result
 */
exports.publishTranscriptionEvent = async (meeting) => {
    // ✅ FIXED: Use correct EventBridge property names and structure
    const event = {
        Source: 'meeting.app',
        DetailType: 'Meeting Ready for Transcription',
        Detail: JSON.stringify({  // ✅ EventBridge requires Detail to be stringified
            meetingId: meeting.id,
            bucketName: meeting.s3Bucket,
            objectKey: meeting.s3Key,
            fileName: meeting.fileName,
            timestamp: new Date().toISOString()
        })
    };

    console.log('Publishing event:', JSON.stringify(event, null, 2)); // ✅ Added debug logging

    try {
        const command = new PutEventsCommand({
            Entries: [event]
        });

        const result = await eventBridgeClient.send(command);

        if (result.FailedEntryCount > 0) {
            console.error('EventBridge failed entries:', result.Entries);
            throw new Error('Failed to publish event');
        }

        console.log(`Transcription event published for meeting: ${meeting.id}`);
        console.log('EventBridge result:', JSON.stringify(result, null, 2)); // ✅ Added debug logging
        return result;

    } catch (error) {
        console.error('Error publishing transcription event:', error);
        throw new Error(`Failed to publish event: ${error.message}`);
    }
};