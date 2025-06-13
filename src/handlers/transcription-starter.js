// src/handlers/transcription-starter.js
const {createResponse, createErrorResponse} = require("../utils/api-utils");
const { getMeetingById } = require('../services/meeting-service');
const {updateMeetingRecord} = require("../lib/dynamodbClient");
const {startTranscriptionJob} = require("../services/transcription-service");

/**
 * Lambda function to start transcription jobs for uploaded audio files
 * Triggered by: Custom EventBridge events from audio-upload-processor
 */
exports.transcriptionStarter = async (event) => {

    try {

        let meetingData;
        if (event.source === 'meeting.app' && event['detail-type'] === 'Meeting Ready for Transcription') {
            const { meetingId, bucketName, objectKey, fileName } = event.detail;

            // Create meeting object for transcription service
            meetingData = {
                meetingId: meetingId,
                s3Bucket: bucketName,
                s3Key: objectKey,
                fileName: fileName
            };

        }
        // Handle direct invocation (for testing or manual trigger)
        else if (event.meetingId) {

            const meeting = await getMeetingById(event.meetingId);

            if (!meeting) {
                return createErrorResponse(404, `Meeting not found: ${event.meetingId}`);
            }

            meetingData = {
                meetingId: meeting.meetingId,
                s3Bucket: meeting.s3Bucket,
                s3Key: meeting.s3Key,
                fileName: meeting.fileName
            };
        }
        else {
            return createErrorResponse(400, 'Invalid event source - expected audio-upload event');
        }
        const jobResult = await startTranscriptionJob(meetingData);

        // Update meeting record
        await updateMeetingRecord(meetingData.meetingId, {
            transcriptionJobName: jobResult.jobName,
            transcriptionJobStatus: jobResult.jobStatus,
            transcriptionStatus: 'transcribing'
        });

        console.log(`Transcription started for meeting: ${meetingData.meetingId}`);

        return createResponse(200, {
            message: `Transcription started for meeting: ${meetingData.meetingId}`,
            jobName: jobResult.jobName
        });

    } catch (error) {
        console.error('Transcription starter error:', error);
        return createErrorResponse(500, `Transcription failed: ${error.message}`);  // ✅ Better
    }
};