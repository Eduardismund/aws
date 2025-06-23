const { createResponse, createErrorResponse, createOptionsResponse } = require('../utils/api-utils.js');
const {getMeetingById} = require("../services/meeting-service");

/**
 * Lambda function to handle meeting data queries
 * Single Responsibility: Query and return meeting information
 * Triggered by: API Gateway requests
 */
exports.meetingQueryHandler = async (event) => {

    if (event.httpMethod === 'OPTIONS') {
        return createOptionsResponse()
    }

    const meetingId = event.pathParameters?.meetingId;

    if (!meetingId) {
        return createErrorResponse(400, 'meetingId is required');
    }

    try {

        const meeting = await getMeetingById(meetingId)

        if (!meeting) {
            return createErrorResponse(404, 'Meeting not found');
        }

        return createResponse(200, meeting);

    } catch (error) {
        return createErrorResponse(500, 'Internal server error', { message: error.message });
    }
};