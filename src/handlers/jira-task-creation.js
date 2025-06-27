const {createJiraTask} = require('../services/jira-service');
const {updateMeetingRecord} = require('../lib/dynamodbClient');
const {createResponse} = require("../utils/api-utils");

exports.jiraTaskCreationHandler = async (event) => {
    try {
        if (event.source === 'meeting.app' && event['detail-type'] === 'Tasks Ready for Creation') {

            const {meetingId, tasks} = event.detail;

            let createdCount = 0;
            const results ={
                created: [],
                errors: []
            } ;

            for (const task of tasks) {
                try {

                    const result = await createJiraTask(task, meetingId);

                    if (result.success) {
                        results.created.push(result);
                        createdCount++;
                    } else {
                        results.errors.push({
                            task: task.title,
                            error: result.error,
                            action: 'create'
                        });
                    }
                } catch (error){
                    results.errors.push({
                        task: task.title,
                        error: error.message,
                        action: 'create'
                    });
                }

            }

            await updateMeetingRecord(meetingId, {
                jiraTasksCreated: results.created,
                jiraCreationErrors: results.errors,
                jiraCreationStatus: 'completed',
                updatedAt: new Date().toISOString()
            });

            return createResponse(200, {
                message: 'Jira tickets created',
                meetingId: meetingId,
                summary: {
                    tasksCreated: createdCount,
                    errors: results.errors.length
                },
                details: results
            });
        }

    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify({
                error: `Task creation failed: ${error.message}`
            })
        };
    }
};