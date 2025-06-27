// src/services/transcription-service.js
const { TranscribeClient, StartTranscriptionJobCommand, GetTranscriptionJobCommand } = require('@aws-sdk/client-transcribe');
const {GetObjectCommand} = require("@aws-sdk/client-s3");
const {downloadFromS3} = require("./s3-service");
const {updateMeetingRecord} = require("../lib/dynamodbClient");

const transcribeClient = new TranscribeClient({ region: process.env.AWS_REGION || 'eu-central-1' });

/**
 * Start transcription job for audio file
 */
exports.startTranscriptionJob = async (audioFile) => {
    const { meetingId, s3Bucket, s3Key, fileName } = audioFile;
    const timestamp = meetingId.match(/\d{13}/)?.[0] || Date.now();
    const jobName = `meeting-transcription-${meetingId}-${timestamp}`;

    const command = new StartTranscriptionJobCommand({
        TranscriptionJobName: jobName,
        LanguageCode: 'en-US',
        MediaFormat: getMediaFormat(fileName),
        Media: {
            MediaFileUri: `s3://${s3Bucket}/${s3Key}`
        },
        OutputBucketName: s3Bucket,
        OutputKey: `transcriptions/${meetingId}/`,
        Settings: {
            ShowSpeakerLabels: true,
            MaxSpeakerLabels: 10
        }
    });

    const result = await transcribeClient.send(command);
    console.log('Transcription job started:', jobName);

    return {
        jobName,
        jobStatus: result.TranscriptionJob.TranscriptionJobStatus
    };
};
/**
 * Process a completed transcription job
 */
exports.processCompletedTranscription = async(jobName) => {
    try {
        const getJobCommand = new GetTranscriptionJobCommand({
            TranscriptionJobName: jobName
        });

        const transcribeResult = await transcribeClient.send(getJobCommand);
        const transcriptUri = transcribeResult.TranscriptionJob.Transcript.TranscriptFileUri;
        const meetingId = extractMeetingIdFromJobName(jobName);

        if (!meetingId) {
            return {meetingId: null, success: false};
        }

        const transcriptionData = await downloadTranscriptionResults(transcriptUri);
        const fullTranscript = extractFullTranscript(transcriptionData);
        await updateMeetingRecord(meetingId, {
            transcriptionStatus: 'completed',
            transcriptionJobStatus: 'COMPLETED',
            fullTranscript: fullTranscript,
            updatedAt: new Date().toISOString()
        })

        return {
            meetingId,
            success: true,
            transcriptionLength: fullTranscript.length
        }
    } catch (error) {
        throw error;
    }
}

exports.processFailedTranscription = async (jobName, details) => {
    try {
        const meetingId = extractMeetingIdFromJobName(jobName);
        if (!meetingId) {
            console.warn(`Could not extract meeting ID from job name: ${jobName}`);
            return;
        }

        const failureReason = details.FailureReason || 'Transcription job failed';

        await updateMeetingRecord(meetingId, {
            transcriptionStatus: 'failed',
            transcriptionJobStatus: 'FAILED',
            errorMessage: failureReason,
            updatedAt: new Date().toISOString()
        });

        console.error(`Transcription failed for meeting ${meetingId}: ${failureReason}`);
    } catch (error) {
        console.error('Error processing failed transcription:', error);
        throw error;
    }
};


/**
 * Get transcription job status
 */
exports.getTranscriptionJobStatus = async (jobName) => {
    const command = new GetTranscriptionJobCommand({
        TranscriptionJobName: jobName
    });

    const result = await transcribeClient.send(command);
    const job = result.TranscriptionJob;

    return {
        jobName: job.TranscriptionJobName,
        jobStatus: job.TranscriptionJobStatus,
        transcriptFileUri: job.Transcript?.TranscriptFileUri,
        failureReason: job.FailureReason
    };
};


/**
 * Download transcription results from S3
 */
async function downloadTranscriptionResults(transcriptUri) {
    try {
        const {bucket, key} = parseS3Uri(transcriptUri)
        const transcriptString = await downloadFromS3(bucket, key)
        return JSON.parse(transcriptString);
    } catch (error){
        throw new Error(`Failed to download transcription results: ${error.message}`);
    }
}


/**
 * Get media format from file extension
 */
function getMediaFormat(fileName) {
    const extension = fileName.toLowerCase().split('.').pop();

    const formats = {
        'mp3': 'mp3',
        'mp4': 'mp4',
        'm4a': 'mp4',
        'wav': 'wav',
        'flac': 'flac'
    };

    return formats[extension] || 'mp3';
}

/**
 * Extract meeting ID from transcription job name
 */
function extractMeetingIdFromJobName(jobName) {
    const regex = /meeting-transcription-(.+)-\d+$/;
    const match = jobName.match(regex);
    return match ? match[1] : null;
}

function parseS3Uri(transcriptUri) {
    let bucket, key;

    if (transcriptUri.startsWith('https://s3.')) {
        const urlParts = new URL(transcriptUri);
        const pathParts = urlParts.pathname.substring(1).split('/');
        bucket = pathParts[0];
        key = pathParts.slice(1).join('/');
    } else if (transcriptUri.startsWith('https://')) {
        const urlParts = new URL(transcriptUri);
        bucket = urlParts.hostname.split('.')[0];
        key = urlParts.pathname.substring(1);
    } else {
        throw new Error(`Unsupported S3 URI format: ${transcriptUri}`);
    }

    return {bucket, key}
}

/**
 * Extract full transcript text from transcription data
 */
function extractFullTranscript(transcriptionData) {
    if (!transcriptionData.results || !transcriptionData.results.items) {
        return '';
    }

    const pronunciationItems = transcriptionData.results.items.filter(item => item.type === 'pronunciation');
    const transcriptWords = pronunciationItems.map(item => item.alternatives[0].content);
    return transcriptWords.join(' ');
}