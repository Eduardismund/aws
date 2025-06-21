const {createResponse, createErrorResponse} = require("../utils/api-utils");
const {processCompletedTranscription, processFailedTranscription} = require("../services/transcription-service");
const {triggerTaskExtraction} = require("../services/event-publisher");

/**
 * Lambda function to process completed transcription jobs
 * Triggered by: EventBridge events from Amazon Transcribe
 */
exports.transcriptionCompleteProcessor = async (event) => {
    try {
        if (event.source === 'aws.transcribe' && event['detail-type'] === 'Transcribe Job State Change') {
            const jobName = event.detail.TranscriptionJobName;
            const jobStatus = event.detail.TranscriptionJobStatus;

            if (jobStatus === 'COMPLETED') {
                const result = await processCompletedTranscription(jobName);

                if(result.meetingId && result.success){
                    try{
                        await triggerTaskExtraction(result.meetingId);
                    } catch(taskExtractionError){
                        console.log(`Failed to extract tasks because of the error ${taskExtractionError.toString()}`)
                    }
                }
            } else if (jobStatus === 'FAILED') {
                await processFailedTranscription(jobName, event.detail);
            }

            return createResponse(200, {
                message: `Transcription job ${jobStatus} processed successfully`
            });
        } else {
            return createErrorResponse(400, 'Invalid event source - expected Transcribe event');
        }
    } catch (error) {
        console.error('Transcription complete processor error:', error);
        return createErrorResponse(500, `Transcription processing failed: ${error.message}`);
    }
};
