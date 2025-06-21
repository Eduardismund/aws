const {BedrockRuntimeClient, InvokeModelCommand} = require('@aws-sdk/client-bedrock-runtime');
const {getMeetingById} = require('../services/meeting-service');
const {triggerJiraTaskCreation} = require('../services/event-publisher');
const {getCRMBoardMembers} = require('../services/jira-service');
const {updateMeetingRecord} = require('../lib/dynamodbClient');

const bedrockClient = new BedrockRuntimeClient({region: process.env.AWS_REGION});


exports.taskExtractorHandler = async (event) => {
    try {
        const meetingId = event.detail?.meetingId

        if (!meetingId) {
            throw new Error('No meeting ID found in event');
        }

        const meeting = await getMeetingById(meetingId)

        if (meeting == null) {
            throw new Error(`Meeting not found: ${meetingId}`)
        }
        if (meeting.fullTranscript == null) {
            throw new Error(`No transcript found for meeting: ${meetingId}`)
        }

        const boardMembers = await getCRMBoardMembers();

        const extractedTasks = await extractTasksWithBedrock(meeting.fullTranscript, boardMembers)

        await updateMeetingRecord(meetingId, {
            aiExtractedTasks: extractedTasks.tasks,
            aiMeetingSummary: extractedTasks.summary,
            aiMeetingType: extractedTasks.meetingType,
            taskExtractionStatus: 'completed',
            updatedAt: new Date().toISOString()})

        if(extractedTasks.tasks && extractedTasks.tasks.length >0){
            await triggerJiraTaskCreation(meetingId)
        }

        return {
            statusCode: 200,
            body: JSON.stringify({
                message: `Task extraction completed for meeting: ${meetingId}`,
                tasksExtracted: extractedTasks.tasks.length,
                meetingType: extractedTasks.meetingType
            })
        };

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

async function extractTasksWithBedrock(transcript, boardMembers) {
    const availableAssignees = boardMembers.map(member => member.displayName).join(', ');
    const today = new Date().toISOString().split('T')[0];

    const prompt = `Extract actionable tasks from this meeting transcript. Return JSON only.
Available team members in Jira: ${availableAssignees}.
Today the date is: ${today}.

TRANSCRIPT:
${transcript}

Return this exact JSON structure:
{
  "summary": "Brief meeting summary",
  "meetingType": "standup|planning|review|general",
  "tasks": [
    {
      "title": "Task title",
      "description": "What needs to be done",
      "assignee": "Person assigned from the available team members or 'unassigned'",
      "priority": "low|medium|high",
      "dueDate": "YYYY-MM-DD format or null if not specified"
    }
  ]
}

Rules:
- Only extract clear, actionable tasks
- Include both explicit assignments and implied action items
- Return empty tasks array if no actionable items exist
- Return valid JSON only, no additional text
- For dueDate: convert relative dates like "tomorrow", "next week", "by Friday" to YYYY-MM-DD format, compute it by analyzing today's date
- If the name is partial, choose the closest match, and if there are multiple possible matches label 'unassigned'`;
    const payload = {
        anthropic_version: "bedrock-2023-05-31",
        max_tokens: 4000,
        temperature: 0.1,
        messages: [{ role: "user", content: prompt }]
    };

    const command = new InvokeModelCommand({
        modelId: 'anthropic.claude-3-5-sonnet-20240620-v1:0',  // ← Use this instead
        contentType: "application/json",
        accept: "application/json",
        body: JSON.stringify(payload)
    })

    const response = await bedrockClient.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));
    const extractedData = JSON.parse(responseBody.content[0].text);

    if(!extractedData.tasks || !Array.isArray(extractedData.tasks)){
        throw new Error('Invalid response from Bedrock');
    }

    const mappedTasks = extractedData.tasks.map(task => {
        let assigneeId = 'unassigned';

        if (task.assignee && task.assignee !== 'unassigned') {
            const matchedMember = boardMembers.find(member =>
                member.displayName.toLowerCase() === task.assignee.toLowerCase()
            );

            if (matchedMember) {
                assigneeId = matchedMember.accountId;
            }
        }

        return {
            ...task,
            assigneeId: assigneeId
        };
    });
    return {
        ...extractedData,
        tasks: mappedTasks
    }

}

