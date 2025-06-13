/**
 * Parse S3 events from different sources (EventBridge or direct S3)
 * @param {Object} event - Lambda event object
 * @returns {Array} Array of upload event objects
 */
exports.parseS3Event = (event) => {
    const uploads = [];

    // Handle EventBridge events from S3
    if (event.source === 'aws.s3' && event['detail-type'] === 'Object Created') {
        uploads.push({
            bucketName: event.detail.bucket.name,
            objectKey: decodeURIComponent(event.detail.object.key),
            eventName: 'ObjectCreated',
            eventTime: event.time,
            objectSize: event.detail.object.size,
            objectETag: event.detail.object.etag
        });
    }
    // Handle direct S3 events (for testing or legacy configurations)
    else if (event.Records) {
        for (const record of event.Records) {
            if (record.eventSource === 'aws:s3' && record.eventName.startsWith('ObjectCreated')) {
                uploads.push({
                    bucketName: record.s3.bucket.name,
                    objectKey: decodeURIComponent(record.s3.object.key.replace(/\+/g, ' ')),
                    eventName: record.eventName,
                    eventTime: record.eventTime,
                    objectSize: record.s3.object.size,
                    objectETag: record.s3.object.eTag
                });
            }
        }
    }

    return uploads;
};