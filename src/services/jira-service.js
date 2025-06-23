const axios = require('axios');
const {BedrockRuntimeClient, InvokeModelCommand} = require('@aws-sdk/client-bedrock-runtime');
const bedrockClient = new BedrockRuntimeClient({region: process.env.AWS_REGION});


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


async function findAssigneeId(assignee, users) {
    console.log('the assignee to find:', assignee);

    if(!assignee || assignee === "unassigned" || users.length === 0){
        console.log('no assignee determined or any user available');
        return null;
    }

    const userList = users.map(user => `Name = ${user.displayName}, AccountId= ${user.accountId}`).join('\n');
    console.log('available users with their corresponding id: ', userList);

    const prompt = `Find the best match for "${assignee}" from this list:
${userList}

Return only the accountId of the best match, or "none" if no good match.`;

    try{
        const payload = {
            anthropic_version: "bedrock-2023-05-31",
            max_tokens: 100,
            temperature: 0.1,
            messages: [{ role: "user", content: prompt }]
        };

        const command = new InvokeModelCommand({
            modelId: 'anthropic.claude-3-5-sonnet-20240620-v1:0',
            contentType: "application/json",
            accept: "application/json",
            body: JSON.stringify(payload)
        });

        const response = await bedrockClient.send(command);
        const responseBody = JSON.parse(new TextDecoder().decode(response.body));
        const result = responseBody.content[0].text.trim();

        console.log('bedrock result:', result);

        const foundUser = users.find(user => user.accountId === result);
        if (result !== 'none' && !foundUser) {
            console.error('bedrock returned invalid accountId:', result);
            return null;
        }

        return result === 'none' ? null : result;
    } catch (error) {
        console.error('bedrock failed:', error.message);
        return null;
    }
}

async function createJiraTask(task, meetingId) {
    console.log('🎫 Creating Jira task for:', JSON.stringify(task, null, 2));

    const users = await getCRMBoardMembers();
    console.log('👥 Found', users.length, 'CRM board members');

    const assigneeId = await findAssigneeId(task.assignee, users);
    console.log('🧑‍💼 Assignee ID found:', assigneeId);

    try {
        const issueData = {
            fields: {
                project: {key: JIRA_PROJECT_KEY},
                summary: task.title,
                description: {
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
        };

        if (assigneeId) {
            issueData.fields.assignee = { accountId: assigneeId };
        }

        console.log('📤 Sending to Jira:', JSON.stringify(issueData, null, 2));

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

        console.log('✅ Jira task created successfully:', issueKey);
        return {
            success: true,
            issueKey,
            issueUrl,
            taskTitle: task.title
        };

    } catch (error) {
        console.error('❌ Jira API Error:', {
            status: error.response?.status,
            statusText: error.response?.statusText,
            data: error.response?.data,
            message: error.message
        });

        return {
            success: false,
            error: error.message,
            taskTitle: task.title
        };
    }
}
module.exports = {
    createJiraTask
};