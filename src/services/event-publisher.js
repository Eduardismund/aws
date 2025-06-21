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
async function publishTranscriptionEvent(meeting){
    const event = {
        Source: 'meeting.app',
        DetailType: 'Meeting Ready for Transcription',
        Detail: JSON.stringify({
            meetingId: meeting.id,
            bucketName: meeting.s3Bucket,
            objectKey: meeting.s3Key,
            fileName: meeting.fileName,
            timestamp: new Date().toISOString()
        })
    };


    try {
        const command = new PutEventsCommand({
            Entries: [event]
        });

        const result = await eventBridgeClient.send(command);

        return result;

    } catch (error) {
        console.error('Error publishing transcription event:', error);
        throw new Error(`Failed to publish event: ${error.message}`);
    }
};

async function triggerJiraTaskCreation(meetingId) {
    const eventDetails = {
        meetingId,
        triggeredBy: "task-extraction-complete",
        timestamp: new Date().toISOString()
    };

    const command = new PutEventsCommand({
        Entries: [{
            Source: "meeting.app",
            DetailType: "Task Extraction Completed",
            Detail: JSON.stringify(eventDetails),
            Time: new Date()
        }]
    });

    await eventBridgeClient.send(command);
}


async function triggerTaskExtraction(meetingId){
    const eventDetails = {
        meetingId,
        triggeredBy: "transcription-complete-processor",
        timestamp: new Date().toISOString()
    }

    const command = new PutEventsCommand({
        Entries: [{
            Source: 'meeting.app',
            DetailType: 'Transcription Completed',
            Detail: JSON.stringify(eventDetails),
            Time: new Date()
        }]
    })

    await eventBridgeClient.send(command)
}

module.exports = {
    publishTranscriptionEvent,
    triggerJiraTaskCreation,
    triggerTaskExtraction
};