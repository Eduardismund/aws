const {getMeetingById} = require('../services/meeting-service');
const {createJiraTask} = require('../services/jira-service');
const {updateMeetingRecord} = require('../lib/dynamodbClient');
const {createResponse} = require("../utils/api-utils");

exports.jiraTaskCreationHandler = async (event) => {
    try {

        const meetingId = event.detail?.meetingId

        if (!meetingId) {
            throw new Error('No meeting ID found in event');
        }

        const meeting = await getMeetingById(meetingId)

        if (meeting == null) {
            throw new Error(`Meeting not found: ${meetingId}`)
        }
        if (meeting.aiExtractedTasks == null) {
            throw new Error(`No transcript found for meeting: ${meetingId}`)
        }

       const tasks = meeting.aiExtractedTasks;

        const results = []
        for(const task of tasks){
            const result = await createJiraTask(task, meetingId);
            results.push(result)

            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        const successful = results.filter(r => r.success);

        const jiraTickets = successful.map(r => ({
            issueKey: r.issueKey,
            issueUrl: r.issueUrl,
            taskTitle: r.taskTitle

        }));

        await updateMeetingRecord(meetingId, {
            jiraTickets,
            jiraTicketCount: successful.length,
            jiraIntegrationStatus: 'completed'
        })

        return createResponse(200, {
            message: 'Jira tickets created',
            ticketsCreated: successful.length,
            jiraTickets
        });

    } catch (error) {
        console.error('Task extraction failed:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                error: `Task extraction failed: ${error.message}`
            })
        };
    }
};
