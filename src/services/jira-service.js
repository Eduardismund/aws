const axios = require('axios');

const JIRA_BASE_URL = "https://meetingtasksdemo.atlassian.net";
const JIRA_EMAIL = "meetingtasks.demo@proton.me";
const JIRA_API_TOKEN = "secret";
const JIRA_PROJECT_KEY = "CRM";
const CRM_BOARD_ID = "1";

async function getCRMBoardMembers() {
    const response = await axios.get(
        `${JIRA_BASE_URL}/rest/api/3/user/assignable/search`,
        {
            auth: {
                username: JIRA_EMAIL,
                password: JIRA_API_TOKEN
            },
            headers: {
                'Accept' : 'application/json'
            },
            params:{
                project: 'CRM',
                maxResults: 1000,
            }
        }
    )

    return response.data.map(user => ({
        accountId: user.accountId,
        displayName: user.displayName,
        active: user.active
    }))
}

async function createJiraTask(task, meetingId) {
    try{
        const issueData = {
            fields: {
                project: {key: JIRA_PROJECT_KEY},
                summary: task.title,
                description:
                    {
                        type: "doc",
                        version: 1,
                        content: [{
                            type: "paragraph",
                            content: [{
                                type: "text",
                                text: `${task.description}\n\n📋 Assignee: ${task.assignee}\n📅 Due: ${task.dueDate}\n⚡ Priority: ${task.priority}\n\n🤖 Auto-generated from meeting: ${meetingId}`
                            }]
                        }]

                    },
                issuetype: {name: "Task"}

            }

        }

        if (task.assigneeId && task.assigneeId !== 'unassigned') {
            issueData.fields.assignee = {
                accountId: task.assigneeId
            };
        }

        const response = await axios.post(
            `${JIRA_BASE_URL}/rest/api/3/issue`,
            issueData,
            {
                auth: {
                    username: JIRA_EMAIL,
                    password: JIRA_API_TOKEN
                },
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                }
            }
        );

        const issueKey = response.data.key;
        const issueUrl = `${JIRA_BASE_URL}/browse/${issueKey}`;

        return {
            success: true,
            issueKey,
            issueUrl,
            taskTitle: task.title
        };



    } catch (error){
        return {
            success: false,
            error: error.message,
            taskTitle: task.title
        }
    }
}
module.exports = {
    getCRMBoardMembers,
    createJiraTask
};