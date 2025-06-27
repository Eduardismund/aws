const {BedrockRuntimeClient, InvokeModelCommand} = require('@aws-sdk/client-bedrock-runtime');
const {getMeetingById} = require('../services/meeting-service');
const {triggerJiraTaskCreation, triggerJiraTaskAnalyzer} = require('../services/event-publisher');
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


        const extractedTasks = await extractTasksWithBedrock(meeting.fullTranscript)

        await updateMeetingRecord(meetingId, {
            aiExtractedTasks: extractedTasks.tasks,
            aiMeetingSummary: extractedTasks.summary,
            aiMeetingType: extractedTasks.meetingType,
            taskExtractionStatus: 'completed',
            updatedAt: new Date().toISOString()})

        if(extractedTasks.tasks && extractedTasks.tasks.length >0){
            await triggerJiraTaskAnalyzer(meetingId)
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

async function extractTasksWithBedrock(transcript) {
    const today = new Date().toISOString().split('T')[0];

    const prompt = `Extract actionable tasks from this meeting transcript. Return JSON only.
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
      "status": "to do|in progress|done",
      "description": "What needs to be done",
      "assignee": "Person assigned or 'unassigned'",
      "priority": "low|medium|high",
      "dueDate": "YYYY-MM-DD format or null if not specified"
    }
  ]
}
Rules:
- Meeting future check-ins are not tasks
- Extract ALL tasks mentioned, including work that's completed
- Status determination:
  * "done" = completed work ("it's done", "finished", "completed", "working like a charm")
  * "in progress" = currently working ("60% done", "getting there", "working on", "finishing [soon]")
  * "to do" = newly assigned or upcoming work
- Include status updates on existing work - if someone reports work is finished, extract it as "done"
- Include both explicit assignments and work progress updates
- Don't miss completed work - if someone says their task is finished, include it
- Return empty tasks array if no actionable items exist
- Return valid JSON only, no additional text`;
    const payload = {
        anthropic_version: "bedrock-2023-05-31",
        max_tokens: 4000,
        temperature: 0.1,
        messages: [{ role: "user", content: prompt }]
    };

    const command = new InvokeModelCommand({
        modelId: 'anthropic.claude-3-5-sonnet-20240620-v1:0',
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

    return extractedData
}

