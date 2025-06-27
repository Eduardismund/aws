const { updateJiraTask } = require('../services/jira-service');
const {updateMeetingRecord} = require('../lib/dynamodbClient');
const {createResponse} = require("../utils/api-utils");

exports.jiraTaskUpdateHandler = async (event) => {
    try {
        if (event.source === 'meeting.app' && event['detail-type'] === 'Tasks Ready for Update') {

            const {meetingId, tasks} = event.detail;

            let updatedCount = 0;
            const results ={
                updated: [],
                errors: []
            } ;

            for (const task of tasks) {
                try {

                    const result = await updateJiraTask(task.jiraKey, task.updates);
                    results.updated.push(result);
                    updatedCount++;

                } catch (error){
                    results.errors.push({
                        task: task.jiraKey,
                        error: error.message,
                        action: 'update'
                    });
                }

            }

            await updateMeetingRecord(meetingId, {
                jiraTasksUpdated: results.updated,
                jiraUpdateErrors: results.errors,
                jiraUpdateStatus: 'completed',
                updatedAt: new Date().toISOString()
            });

            return createResponse(200, {
                message: 'Jira tickets updated',
                meetingId: meetingId,
                summary: {
                    tasksUpdated: updatedCount,
                    errors: results.errors.length
                },
                details: results
            });
        }

    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify({
                error: `Task updates failed: ${error.message}`
            })
        };
    }
};