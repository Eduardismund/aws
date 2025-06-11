const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { randomUUID } = require('crypto');

const s3Client = new S3Client({ region: process.env.AWS_REGION || 'eu-central-1' });
const AUDIO_BUCKET = process.env.AUDIO_BUCKET;

exports.presignedUrlHandler = async (event) => {

    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Content-Type': 'application/json'
    };

    if (event.httpMethod === 'OPTIONS') {
        console.log('Handling OPTIONS preflight request');
        return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'CORS preflight successful' })
        };
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


        // Create S3 PutObject command
        const putObjectCommand = new PutObjectCommand({
            Bucket: AUDIO_BUCKET,
            Key: uniqueFileName,
            ContentType: fileType || 'audio/mpeg'
        });

        // Generate presigned URL
        const uploadUrl = await getSignedUrl(s3Client, putObjectCommand, {
            expiresIn: 900 // 15 minutes
        });

        console.log('Generated presigned URL successfully');

        const response = {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify({
                uploadUrl,
                key: uniqueFileName
            })
        };

        console.log('Returning successful response');
        return response;

    } catch (error) {
        console.error('=== ERROR IN PRESIGNED URL HANDLER ===');
        console.error('Error:', error);
        console.error('Stack:', error.stack);

        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({
                error: 'Internal server error',
                message: error.message
            })
        };
    } finally {
        console.log('=== PRESIGNED URL HANDLER END ===');
    }
};