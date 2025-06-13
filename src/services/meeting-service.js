const { fetchMeetingById, createMeetingRecord } = require("../lib/dynamodbClient");
const { getFileMetadata } = require("./s3-service");

exports.getMeetingById = async (meetingId) => {
    const meeting = await fetchMeetingById(meetingId);

    if (!meeting) {
        return null;
    }

    return {
        meetingId: meeting.id,
        fileName: meeting.fileName,
        uploadTimestamp: meeting.uploadTimestamp,
        status: meeting.status,
        transcriptionStatus: meeting.transcriptionStatus || 'pending',
        transcriptionJobStatus: meeting.transcriptionJobStatus || 'PENDING',
        fullTranscript: meeting.fullTranscript || null,
        transcriptionData: meeting.transcriptionData || null,
        errorMessage: meeting.errorMessage || null,
        fileSize: meeting.fileSize || null,
        contentType: meeting.contentType || null,
        createdAt: meeting.createdAt,
        updatedAt: meeting.updatedAt
    };
};

exports.createMeetingFromUpload = async (bucketName, objectKey) => {
    try {
        const fileMetadata = await getFileMetadata(bucketName, objectKey);
        const meetingInfo = extractMeetingInfo(objectKey, fileMetadata);

        const meetingRecord = {
            id: meetingInfo.meetingId,
            fileName: meetingInfo.fileName,
            s3Key: objectKey,
            s3Bucket: bucketName,
            uploadTimestamp: meetingInfo.uploadTimestamp,
            status: 'uploaded',
            transcriptionStatus: 'pending',
            transcriptionJobStatus: 'PENDING',
            fileSize: fileMetadata.contentLength,
            contentType: fileMetadata.contentType,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        await createMeetingRecord(meetingRecord);

        console.log('Meeting record created:', {
            meetingId: meetingRecord.id,
            fileName: meetingRecord.fileName,
            fileSize: meetingRecord.fileSize
        });

        return meetingRecord;

    } catch (error) {
        console.error('Error creating meeting from upload:', {
            error: error.message,
            bucketName,
            objectKey
        });
        throw error;
    }
};

/**
 * Extract meeting information from object key and metadata
 * @param {string} objectKey - S3 object key
 * @param {Object} fileMetadata - File metadata from S3
 * @returns {Object} Meeting information
 */
function extractMeetingInfo(objectKey, fileMetadata) {
    const metadata = fileMetadata.metadata || {};

    const meetingId = metadata['meeting-id'] ||
        extractMeetingIdFromKey(objectKey);

    const fileName = metadata['original-name'] ||
        objectKey.split('/').pop();

    const uploadTimestamp = metadata['upload-timestamp'] ||
        fileMetadata.lastModified?.toISOString() ||
        new Date().toISOString();

    return {
        meetingId,
        fileName,
        uploadTimestamp
    };
}


/**
 * Extract meeting ID from S3 object key
 * @param {string} objectKey - S3 object key
 * @returns {string} Meeting ID
 */
function extractMeetingIdFromKey(objectKey){
    // For keys like "meetings/meeting123/file.mp3", extract "meeting123"
    const parts = objectKey.split('/');

    if (parts[0] === 'meetings' && parts.length > 1) {
        return parts[1];
    }

    // For keys like "meeting123_audio.mp3", extract "meeting123"
    const fileName = parts[parts.length - 1];
    const meetingIdMatch = fileName.match(/^([^_]+)_/);
    if (meetingIdMatch) {
        return meetingIdMatch[1];
    }

    // For other formats, return a sanitized version of the filename
    return fileName.split('.')[0].replace(/[^a-zA-Z0-9-]/g, '-');
};