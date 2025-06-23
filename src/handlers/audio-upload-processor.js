const {createErrorResponse, createResponse} = require("../utils/api-utils");
const {createMeetingFromUpload} = require("../services/meeting-service");
const {publishTranscriptionEvent} = require("../services/event-publisher");

/**
 * Lambda function to process S3 upload events and create meeting records
 */
exports.audioUploadProcessor = async (event) => {

    try {
        if (event.source === 'aws.s3' && event['detail-type'] === 'Object Created') {
            const bucketName = event.detail.bucket.name;
            const objectKey = decodeURIComponent(event.detail.object.key);

            if (objectKey.includes('.temp') ||
                objectKey.includes('.write_access_check') ||
                objectKey.includes('$folder$') ||
                objectKey.endsWith('/')) {
                return createResponse(200, 'System file ignored');
            }

            const meetingRecord = await createMeetingFromUpload(bucketName, objectKey);
            await publishTranscriptionEvent(meetingRecord);

        } else {
            return createErrorResponse(400, 'Invalid event source - expected S3 upload event');
        }

        return createResponse(200, 'Audio upload processed successfully');

    } catch (error) {
        throw error;
    }
};