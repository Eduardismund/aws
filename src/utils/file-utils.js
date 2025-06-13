const { randomUUID } = require('crypto');

/**
 * Generate unique file name for S3 storage
 */
exports.generateUniqueFileName = (originalFileName, meetingId = null) => {
    const fileExtension = originalFileName.split('.').pop();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const uuid = randomUUID();

    if (meetingId) {
        return `meetings/${meetingId}/${timestamp}-${uuid}.${fileExtension}`;
    }

    return `uploads/${timestamp}-${uuid}.${fileExtension}`;
};