const {getMeetingById} = require('../services/meeting-service');
const {analyzeJiraTasksWithBedrock} = require('../services/jira-service');
const {updateMeetingRecord} = require('../lib/dynamodbClient');
const {createResponse} = require("../utils/api-utils");
const {triggerJiraTaskHandle} = require("../services/event-publisher");

exports.jiraTaskAnalyzerHandler = async (event) => {

    let meetingId;
    try {
        if (event.source === 'meeting.app' && event['detail-type'] === 'Task Extraction Completed') {

            meetingId = event.detail?.meetingId;

            const meeting = await getMeetingById(meetingId);

            if (!meeting) {
                throw new Error(`Meeting not found: ${meetingId}`);
            }

            if (!meeting.aiExtractedTasks?.length) {
                throw new Error(`No tasks extracted for meeting: ${meetingId}`);
            }

            const extractedTasks = meeting.aiExtractedTasks;

            const tasks = await analyzeJiraTasksWithBedrock(extractedTasks);

            let triggeredEvents = [];

            if (tasks.create?.length > 0) {
                await triggerJiraTaskHandle({
                    meetingId,
                    tasks: tasks.create,
                    operation: 'Creation'
                });

                triggeredEvents.push(`create: ${tasks.create.length} tasks`);
            }

            if (tasks.update?.length > 0) {
                await triggerJiraTaskHandle({
                    meetingId,
                    tasks: tasks.update,
                    operation: 'Update'
                });

                triggeredEvents.push(`update: ${tasks.update.length} tasks`);
            }

            if ((tasks.create?.length || 0) === 0 && (tasks.update?.length || 0) === 0) {
                await updateMeetingRecord(meetingId, {
                    jiraProcessingStatus: 'completed',
                    updatedAt: new Date().toISOString()
                });
            }

            return createResponse(200, {
                message: 'Jira Tasks Analyze completed',
                meetingId: meetingId,
                triggeredEvents: triggeredEvents,
                analysis: {
                    ticketsCreated: tasks.create?.length || 0,
                    ticketsUpdated: tasks.update?.length || 0
                }
            });
        }

    } catch (error) {
        if (meetingId) {
            try {
                await updateMeetingRecord(meetingId, {
                    jiraProcessingStatus: 'analysis_failed',
                    jiraProcessingError: error.message,
                    updatedAt: new Date().toISOString()
                });
            } catch (updateError) {
                console.error('Failed to update meeting record with error status:', updateError);
            }
        }

        return {
            statusCode: 500,
            body: JSON.stringify({
                error: `Jira task analysis failed: ${error.message}`
            })
        };
    }
};