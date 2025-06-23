const {createResponse, createErrorResponse} = require("../utils/api-utils");
const {updateMeetingRecord} = require("../lib/dynamodbClient");
const {startTranscriptionJob} = require("../services/transcription-service");

/**
 * Lambda function to start transcription jobs for uploaded audio files
 */
exports.transcriptionStarter = async (event) => {

    try {

        let meetingData;
        if (event.source === 'meeting.app' && event['detail-type'] === 'Meeting Ready for Transcription') {
            const { meetingId, bucketName, objectKey, fileName } = event.detail;
q
            meetingData = {
                meetingId: meetingId,
                s3Bucket: bucketName,
                s3Key: objectKey,
                fileName: fileName
            };

        }
        else {
            return createErrorResponse(400, 'Invalid event source - expected audio-upload event');
        }
        const jobResult = await startTranscriptionJob(meetingData);

        await updateMeetingRecord(meetingData.meetingId, {
            transcriptionJobName: jobResult.jobName,
            transcriptionJobStatus: jobResult.jobStatus,
            transcriptionStatus: 'transcribing'
        });

        return createResponse(200, {
            message: `Transcription started for meeting: ${meetingData.meetingId}`,
            jobName: jobResult.jobName
        });

    } catch (error) {
        return createErrorResponse(500, `Transcription failed: ${error.message}`);
    }
};