const axios = require('axios');
const {SecretsManagerClient, GetSecretValueCommand} = require('@aws-sdk/client-secrets-manager');
const {BedrockRuntimeClient, InvokeModelCommand} = require('@aws-sdk/client-bedrock-runtime');

const secretsClient = new SecretsManagerClient({region: process.env.AWS_REGION});
const bedrockClient = new BedrockRuntimeClient({region: process.env.AWS_REGION});

let jiraConfig = null;
let users = null;

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
        throw new Error('Failed to load Jira configuration from Secrets Manager');
    }
}

async function getCRMBoardMembers() {
    const config = await getJiraConfig();

    if(users){
        return users;
    }

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

    users = response.data.map(user => ({
        accountId: user.accountId,
        displayName: user.displayName,
        active: user.active
    }));

    return users;
}

async function callBedrock(payload) {
    await new Promise(resolve => setTimeout(resolve, 3000 + Math.random() * 1000));

    const command = new InvokeModelCommand({
        modelId: 'anthropic.claude-3-5-sonnet-20240620-v1:0',
        contentType: "application/json",
        accept: "application/json",
        body: JSON.stringify(payload)
    });

    const response = await bedrockClient.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));
    return responseBody.content[0].text.trim();
}

function quickUserMatch(assignee, users) {
    if (!assignee || assignee === "unassigned" || users.length === 0) {
        return null;
    }

    const assigneeLower = assignee.toLowerCase().trim();

    let user = users.find(u => u.displayName.toLowerCase() === assigneeLower);
    if (user) {
        return user.accountId;
    }

    const firstName = assigneeLower.split(' ')[0];
    user = users.find(u => {
        const userFirstName = u.displayName.toLowerCase().split(' ')[0];
        return userFirstName === firstName;
    });
    if (user) {
        return user.accountId;
    }

    user = users.find(u => u.displayName.toLowerCase().includes(assigneeLower));
    if (user) {
        return user.accountId;
    }

    return null;
}

async function findAssigneeId(assignee, users) {
    const quickResult = quickUserMatch(assignee, users);
    if (quickResult) {
        return quickResult;
    }

    const userList = users.map(user => `Name = ${user.displayName}, AccountId= ${user.accountId}`).join('\n');

    const prompt = `Find the best match for "${assignee}" from this list of users:
${userList}

Consider nicknames, typos, and name variations.
Return only the accountId of the best match, or "none" if no reasonable match exists.`;

    try {
        const payload = {
            anthropic_version: "bedrock-2023-05-31",
            max_tokens: 100,
            temperature: 0.1,
            messages: [{ role: "user", content: prompt }]
        };

        const result = await callBedrock(payload);

        const foundUser = users.find(user => user.accountId === result);
        if (result !== 'none' && !foundUser) {
            return null;
        }

        if (result === 'none') {
            return null;
        }

        return result;
    } catch (error) {
        return null;
    }
}

async function analyzeJiraTasksWithBedrock(extractedTasks) {
    if(!extractedTasks || extractedTasks.length === 0){
        return { create: [], update: [] };
    }

    const jiraTasks = await fetchJiraTasks();
    const usersFromJira = await getCRMBoardMembers();

    const prompt = `Analyze these extracted meeting tasks and determine which should be CREATED as new tickets or UPDATE existing ones.

EXISTING JIRA TASKS:
${JSON.stringify(jiraTasks, null, 2)}

EXTRACTED MEETING TASKS:
${JSON.stringify(extractedTasks, null, 2)}

EXISTING USERS FROM JIRA:
${JSON.stringify(usersFromJira, null, 2)}

Return this exact JSON structure:
{
  "create": [
    {
      "title": "Task title",
      "description": "Task description", 
      "assignee": "assignee name",
      "priority": "high|medium|low",
      "dueDate": "YYYY-MM-DD or null"
    }
  ],
  "update": [
    {
      "jiraKey": "ABC-123",
      "updates": {
        "status": "In Progress|Done|To Do",
        "assignee": "assignee name, or unassigned"
        },
      "reason": "Why this should be updated"
    }
  ]
}

RULES:
CREATE new tasks when:
- Task is completely new and different from existing ones
- No similar task exists in Jira for the same person
- Completely different scope/technology/purpose

UPDATE existing tasks when:
- Status change mentioned (started, completed, blocked, finished)
- Progress update on existing work ("60% done", "almost finished", "need to finish X part")
- Same assignee working on similar/related functionality
- Task is a sub-component or continuation of existing work
- Similar technology/component mentioned (e.g., "finish alerting" relates to existing "monitoring lambda")
- Assignee reassignment

BE VERY CONSERVATIVE about creating new tasks. If there's ANY similarity in:
- Technology/component (lambda, monitoring, auth, etc.)
- Assignee working on related functionality
- Sub-tasks or completion of existing work
Then UPDATE the existing task instead of creating a new one.

Return valid JSON only, no additional text.`;
    const payload = {
        anthropic_version: "bedrock-2023-05-31",
        max_tokens: 4000,
        temperature: 0.1,
        messages: [{ role: "user", content: prompt }]
    };

    const resultText = await callBedrock(payload);
    const result = JSON.parse(resultText);

    if (!result.create || !result.update ||
        !Array.isArray(result.create) || !Array.isArray(result.update)) {
        throw new Error('Invalid response structure from Bedrock analysis');
    }

    return result;
}

async function createJiraTask(task, meetingId) {
    const config = await getJiraConfig();
    const usersFromJira = await getCRMBoardMembers();
    const assigneeId = await findAssigneeId(task.assignee, usersFromJira);

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
                        text: `${task.description}\n\n📋 Original Assignee: ${task.assignee}\n📅 Due Date: ${task.dueDate || 'Not specified'}\n⚡ Priority: ${task.priority}\n\n🤖 Auto-generated from meeting: ${meetingId}`
                    }]
                }]
            },
            issuetype: {name: "Task"}
        }
    };

    if (assigneeId) {
        issueData.fields.assignee = { accountId: assigneeId };
    }

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

    return {
        success: true,
        issueKey,
        issueUrl,
        taskTitle: task.title
    };
}

async function updateJiraTask(jiraKey, updates){
    const config = await getJiraConfig();

    const updatePayload = {
        fields: {}
    };

    if(updates.assignee){
        const usersFromJira = await getCRMBoardMembers();
        const assigneeId = await findAssigneeId(updates.assignee, usersFromJira);
        if(assigneeId){
            updatePayload.fields.assignee = { accountId: assigneeId };
        }
    }

    let transitionId = null;

    if(updates.status){
        const transitions = await getAvailableTransitions(jiraKey);
        const targetTransition = transitions.find(t => t.name.toLowerCase() === updates.status.toLowerCase());
        if(targetTransition){
            transitionId = targetTransition.id;
        }
    }

    if(Object.keys(updatePayload.fields).length > 0){
        await axios.put(
            `${config.baseUrl}/rest/api/3/issue/${jiraKey}`,
            updatePayload,
            {
                auth:{
                    username: config.email,
                    password: config.apiToken
                },
                headers:{
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                }
            }
        );
    }

    if (transitionId) {
        await axios.post(
            `${config.baseUrl}/rest/api/3/issue/${jiraKey}/transitions`,
            {
                transition: { id: transitionId }
            },
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
    }

    return {
        success: true,
        jiraKey: jiraKey,
        updatedFields: Object.keys(updatePayload.fields),
        statusTransition: transitionId ? updates.status : null
    };
}

async function fetchJiraTasks(){
    const config = await getJiraConfig();

    const jql = `project = ${config.projectKey} ORDER BY updated DESC`;

    const response = await axios.get(`${config.baseUrl}/rest/api/3/search`,
        {
            auth: {
                username: config.email,
                password: config.apiToken
            },
            headers: {
                'Accept': 'application/json'
            },
            params: {
                jql: jql,
                maxResults: 50,
                fields: 'summary,status,assignee,priority,created,updated'
            }
        });

    const tasks = response.data.issues.map(issue => ({
        key: issue.key,
        title: issue.fields.summary,
        status: issue.fields.status.name,
        assignee: issue.fields.assignee?.displayName || 'Unassigned',
        priority: issue.fields.priority?.name || 'None',
        created: issue.fields.created,
        updated: issue.fields.updated,
        url: `${config.baseUrl}/browse/${issue.key}`
    }));

    return tasks;
}

async function getAvailableTransitions(jiraKey){
    const config = await getJiraConfig();

    const response = await axios.get(
        `${config.baseUrl}/rest/api/3/issue/${jiraKey}/transitions`,
        {
            auth: {
                username: config.email,
                password: config.apiToken
            },
            headers: {
                'Accept' : 'application/json'
            }
        }
    );

    const transitions = response.data.transitions.map(t => ({
        id: t.id,
        name: t.name
    }));

    return transitions;
}

module.exports = {
    createJiraTask,
    updateJiraTask,
    fetchJiraTasks,
    analyzeJiraTasksWithBedrock
};