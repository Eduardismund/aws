const {createErrorResponse, createResponse} = require("../utils/api-utils");
const {createMeetingFromUpload} = require("../services/meeting-service");
const {publishTranscriptionEvent} = require("../services/event-publisher");

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

            if (objectKey.includes('.temp') ||
                objectKey.includes('.write_access_check') ||
                objectKey.includes('$folder$') ||
                objectKey.endsWith('/')) {
                console.log('Skipping system file:', objectKey);
                return createResponse(200, 'System file ignored');
            }

            const meetingRecord = await createMeetingFromUpload(bucketName, objectKey);
            await publishTranscriptionEvent(meetingRecord);

        // }
        // // Handle direct S3 events
        // else if (event.Records) {
        //     for (const record of event.Records) {
        //         if (record.eventSource === 'aws:s3' && record.eventName.startsWith('ObjectCreated')) {
        //             const bucketName = record.s3.bucket.name;
        //             const objectKey = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));
        //             await createMeetingFromUpload(bucketName, objectKey);
        //         }
        //     }
        } else {
            return createErrorResponse(400, 'Invalid event source - expected S3 upload event');
        }

        return createResponse(200, 'Audio upload processed successfully');

    } catch (error) {
        throw error;
    }
};