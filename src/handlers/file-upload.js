import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';
import {createOptionsResponse} from "../utils/api-utils";

const s3Client = new S3Client({ region: process.env.AWS_REGION || 'eu-central-1' });
const AUDIO_BUCKET = process.env.AUDIO_BUCKET;

export const uploadHandler = async (event) => {

    if (event.httpMethod === 'OPTIONS') {
        return createOptionsResponse();
    }

    try {
        let body = {};
        if (event.body) {
            try {
                body = JSON.parse(event.body);
                console.log('Parsed body:', body);
            } catch (parseError) {
                console.error('JSON parse error:', parseError);
                return {
                    statusCode: 400,
                    headers: corsHeaders,
                    body: JSON.stringify({
                        error: 'Invalid JSON in request body',
                        details: parseError.message
                    })
                };
            }
        }

        const { fileName, fileType, meetingId, fileSize } = body;

        if (!fileName) {
            return {
                statusCode: 400,
                headers: corsHeaders,
                body: JSON.stringify({
                    error: 'fileName is required'
                })
            };
        }

        // Generate unique file name
        const fileExtension = fileName.split('.').pop();
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const uniqueFileName = meetingId
            ? `meetings/${meetingId}/${timestamp}-${randomUUID()}.${fileExtension}`
            : `uploads/${timestamp}-${randomUUID()}.${fileExtension}`;

        // Create S3 PutObject command with metadata
        const putObjectCommand = new PutObjectCommand({
            Bucket: AUDIO_BUCKET,
            Key: uniqueFileName,
            ContentType: fileType || 'audio/mpeg',
            Metadata: {
                'meeting-id': meetingId || 'unknown',
                'original-name': fileName,
                'upload-timestamp': new Date().toISOString(),
                'file-size': fileSize ? fileSize.toString() : 'unknown'
            }
        });

        // Generate presigned URL
        const uploadUrl = await getSignedUrl(s3Client, putObjectCommand, {
            expiresIn: 900 // 15 minutes
        });

        console.log('Generated presigned URL successfully for:', uniqueFileName);

        return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify({
                message: 'Upload handler working with ES modules and AWS SDK v3!',
                timestamp: new Date().toISOString(),
                httpMethod: event.httpMethod,
                environment: AUDIO_BUCKET,
                uploadUrl,
                key: uniqueFileName,
                meetingId: meetingId || extractMeetingIdFromKey(uniqueFileName)
            })
        };

    } catch (error) {
        console.error('Error in upload handler:', error);
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({
                error: 'Internal server error',
                message: error.message,
                timestamp: new Date().toISOString()
            })
        };
    }
};

function extractMeetingIdFromKey(objectKey) {
    const parts = objectKey.split('/');
    if (parts[0] === 'meetings' && parts.length > 1) {
        return parts[1];
    }
    // For uploads folder, generate UUID
    return randomUUID();
}