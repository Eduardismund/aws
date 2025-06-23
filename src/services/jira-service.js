const axios = require('axios');
const {SecretsManagerClient, GetSecretValueCommand} = require('@aws-sdk/client-secrets-manager');
const {BedrockRuntimeClient, InvokeModelCommand} = require('@aws-sdk/client-bedrock-runtime');

const secretsClient = new SecretsManagerClient({region: process.env.AWS_REGION});
const bedrockClient = new BedrockRuntimeClient({region: process.env.AWS_REGION});

let jiraConfig = null;

async function getJiraConfig(){
    if(jiraConfig){
        return jiraConfig;
    }

    try{
        const secretName = process.env.JIRA_SECRET_NAME;

        const command = new GetSecretValueCommand({
            SecretId: secretName
        })

        const response = await secretsClient.send(command);
        const secret = JSON.parse(response.SecretString);

        jiraConfig = {
            baseUrl: secret.JIRA_BASE_URL,
            email: secret.JIRA_EMAIL,
            apiToken: secret.JIRA_API_TOKEN,
            projectKey: secret.JIRA_PROJECT_KEY,
            boardId: secret.JIRA_BOARD_ID
        }
        return jiraConfig;
    } catch (error) {
        console.error('❌ Failed to load Jira configuration:', error.message);
        throw new Error('Failed to load Jira configuration from Secrets Manager');
    }
}

async function getCRMBoardMembers() {
    const config = await getJiraConfig();

    const response = await axios.get(
        `${config.baseUrl}/rest/api/3/user/assignable/search`,
        {
            auth: {
                username: config.email,
                password: config.apiToken
            },
            headers: {
                'Accept' : 'application/json'
            },
            params:{
                project: config.projectKey,
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

    const config = await getJiraConfig();

    const users = await getCRMBoardMembers();
    console.log('found', users.length, 'CRM board members');

    const assigneeId = await findAssigneeId(task.assignee, users);
    console.log('assignee ID found:', assigneeId);

    try {
        const issueData = {
            fields: {
                project: {key: config.projectKey},
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

        console.log('sending to Jira:', JSON.stringify(issueData, null, 2));

        const response = await axios.post(
            `${config.baseUrl}/rest/api/3/issue`,
            issueData,
            {
                auth: {
                    username: config.email,
                    password: config.apiToken
                },
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                }
            }
        );

        const issueKey = response.data.key;
        const issueUrl = `${config.baseUrl}/browse/${issueKey}`;

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