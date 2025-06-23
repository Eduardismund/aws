const {getMeetingById} = require('../services/meeting-service');
const {createJiraTask} = require('../services/jira-service');
const {updateMeetingRecord} = require('../lib/dynamodbClient');
const {createResponse} = require("../utils/api-utils");

exports.jiraTaskCreationHandler = async (event) => {
    console.log('🎫 JiraTaskCreation received event:', JSON.stringify(event, null, 2));

    try {
        const meetingId = event.detail?.meetingId;
        console.log('🔍 Extracted meetingId:', meetingId);

        if (!meetingId) {
            console.error('❌ No meeting ID found in event');
            throw new Error('No meeting ID found in event');
        }

        console.log('📋 Fetching meeting by ID:', meetingId);
        const meeting = await getMeetingById(meetingId);
        console.log('📄 Meeting found:', meeting ? 'Yes' : 'No');

        if (meeting == null) {
            console.error('❌ Meeting not found:', meetingId);
            throw new Error(`Meeting not found: ${meetingId}`);
        }

        console.log('🤖 AI extracted tasks:', meeting.aiExtractedTasks?.length || 0);
        if (meeting.aiExtractedTasks == null) {
            console.error('❌ No AI extracted tasks found for meeting:', meetingId);
            throw new Error(`No transcript found for meeting: ${meetingId}`);
        }

        const tasks = meeting.aiExtractedTasks;
        console.log('📝 Processing', tasks.length, 'tasks');

        const results = [];
        for(const task of tasks){
            console.log('🔨 Creating Jira task:', task.title || task.summary || 'Untitled');
            const result = await createJiraTask(task, meetingId);
            console.log('✅ Jira task result:', result.success ? 'Success' : 'Failed', result.issueKey || result.error);
            results.push(result);

            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        const successful = results.filter(r => r.success);
        console.log('🎯 Successfully created', successful.length, 'out of', results.length, 'tasks');

        const jiraTickets = successful.map(r => ({
            issueKey: r.issueKey,
            issueUrl: r.issueUrl,
            taskTitle: r.taskTitle
        }));

        console.log('📝 Updating meeting record with Jira tickets');
        await updateMeetingRecord(meetingId, {
            jiraTickets,
            jiraTicketCount: successful.length,
            jiraIntegrationStatus: 'completed'
        });

        console.log('✅ Jira task creation completed successfully');
        return createResponse(200, {
            message: 'Jira tickets created',
            ticketsCreated: successful.length,
            jiraTickets
        });

    } catch (error) {
        console.error('❌ Task creation failed:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                error: `Task creation failed: ${error.message}`
            })
        };
    }
};