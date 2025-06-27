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
    console.log('📧 Publishing transcription event...');
    console.log('📄 Meeting object received:', JSON.stringify(meeting, null, 2));

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

    console.log('📤 Event to publish:', JSON.stringify(event, null, 2));

    try {
        const command = new PutEventsCommand({
            Entries: [event]
        });

        const result = await eventBridgeClient.send(command);
        console.log('✅ Event published successfully!', JSON.stringify(result, null, 2));

        // Check if there were any failed entries
        if (result.FailedEntryCount > 0) {
            console.error('❌ Some events failed:', result.Entries);
        }

        return result;

    } catch (error) {
        console.error('❌ Error publishing transcription event:', error);
        throw new Error(`Failed to publish event: ${error.message}`);
    }
};

async function triggerJiraTaskAnalyzer(meetingId) {
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
async function triggerJiraTaskHandle(data) {

    const command = new PutEventsCommand({
        Entries: [{
            Source: "meeting.app",
            DetailType: `Tasks Ready for ${data.operation}`,
            Detail: JSON.stringify(data),
            Time: new Date()
        }]
    });

    await eventBridgeClient.send(command);
    console.log(`triggered task ${data.operation} event for ${data.tasks.length} tasks`);

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
    triggerJiraTaskHandle,
    triggerTaskExtraction,
    triggerJiraTaskAnalyzer
};