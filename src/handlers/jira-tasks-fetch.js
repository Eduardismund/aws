const {createOptionsResponse, createResponse, createErrorResponse} = require("../utils/api-utils");
const {fetchJiraTasks} = require("../services/jira-service");

/**
 * Fetches all tasks from Jira project using REST API
 * Triggered by: API Gateway GET /jira/tasks from user-facing application
 */
exports.jiraTasksFetchHandler = async(event) =>{
    console.log("fetch jira tasks");

    if(event.httpMethod === 'OPTIONS'){
        return createOptionsResponse();
    }

    try{
        const tasks = await fetchJiraTasks();
        console.log(`extracted ${tasks.length} tasks`);

        return createResponse(200, {
            tasks
        });
    } catch(error){
        console.error(`Error: ${error}`);
        return createErrorResponse(500, `Failed to fetch tasks!`);
    }
}