import React, { useState, useEffect } from 'react';
import { RefreshCw, AlertCircle, Filter, Search } from 'lucide-react';
import TaskBox from './TaskBox';

const JiraBoard = ({ API_BASE = "https://mt8d9y8i79.execute-api.eu-central-1.amazonaws.com/Prod" }) => {
    const [tasks, setTasks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [filter, setFilter] = useState('All');
    const [searchTerm, setSearchTerm] = useState('');

    const statusColumns = [
        { name: 'To Do', headerClass: 'todo' },
        { name: 'In Progress', headerClass: 'in-progress' },
        { name: 'Done', headerClass: 'done' }
    ];

    const fetchTasks = async () => {
        try {
            setLoading(true);
            setError(null);

            const response = await fetch(`${API_BASE}/jira/tasks`);
            if (!response.ok) {
                throw new Error(`Failed to fetch tasks: ${response.statusText}`);
            }

            const data = await response.json();
            setTasks(data.tasks || []);
        } catch (err) {
            setError(err.message);
            console.error('Error fetching Jira tasks:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchTasks();
    }, [API_BASE]);

    const getFilteredTasks = () => {
        let filtered = tasks;

        if (filter !== 'All') {
            filtered = filtered.filter(task => task.assignee === filter);
        }

        if (searchTerm) {
            filtered = filtered.filter(task =>
                task.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                task.key.toLowerCase().includes(searchTerm.toLowerCase())
            );
        }

        return filtered;
    };

    const getTasksForStatus = (statusName) => {
        const filteredTasks = getFilteredTasks();
        return filteredTasks.filter(task => statusName === task.status);
    };

    const getUniqueAssignees = () => {
        const assignees = [...new Set(tasks.map(task => task.assignee))];
        return assignees.sort();
    };


    if (loading) {
        return (
            <div className="jira-board-loading">
                <div className="jira-board-loading-content">
                    <RefreshCw size={20} className="spin" />
                    Loading Jira tasks...
                </div>
            </div>
        );
    }

    // Error State
    if (error) {
        return (
            <div className="jira-board-error">
                <AlertCircle size={24} color="#DC2626" className="jira-board-error-icon" />
                <h3 className="jira-board-error-title">Error Loading Tasks</h3>
                <p className="jira-board-error-message">{error}</p>
                <button onClick={fetchTasks} className="jira-board-error-button">
                    <RefreshCw size={16} />
                    Retry
                </button>
            </div>
        );
    }

    return (
        <div className="jira-board ">
            <div className="jira-board-header">
                <div className="jira-board-header-info">
                    <h1>Jira Board</h1>
                </div>
                <button
                    onClick={fetchTasks}
                    disabled={loading}
                    className="jira-board-refresh-btn"
                >
                    <RefreshCw size={14} className={loading ? 'spin' : ''} />
                    Refresh
                </button>
            </div>

            <div className="jira-board-filters">
                <div className="jira-board-search-container">
                    <Search size={16} className="jira-board-search-icon" />
                    <input
                        type="text"
                        placeholder="Search tasks..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="jira-board-search-input"
                    />
                </div>

                <div className="jira-board-filter-container">
                    <Filter size={16} color="#6B7280" />
                    <select
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                        className="jira-board-filter-select"
                    >
                        <option value="All">All Assignees</option>
                        {getUniqueAssignees().map(assignee => (
                            <option key={assignee} value={assignee}>{assignee}</option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="jira-board-grid">
                {statusColumns.map(column => {
                    const columnTasks = getTasksForStatus(column.name);

                    return (
                        <div key={column.name} className="jira-board-column">
                            <div className={`jira-board-column-header ${column.headerClass}`}>
                                <h3 className="jira-board-column-title">
                                    {column.name}
                                </h3>
                                <span className="jira-board-column-count">
                                    {columnTasks.length}
                                </span>
                            </div>

                            <div className="jira-board-column-content">
                                {columnTasks.length === 0 ? (
                                    <div className="jira-board-column-empty">
                                        No tasks
                                    </div>
                                ) : (
                                    <div className="jira-board-tasks-list">
                                        {columnTasks.map(task => (
                                            <TaskBox
                                                key={task.key}
                                                task={task}
                                            />
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default JiraBoard;