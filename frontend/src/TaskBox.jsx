import React from 'react';
import { User, Calendar, ExternalLink } from 'lucide-react';

const TaskBox = ({ task }) => {
    const formatDate = (dateString) => {
        return new Date(dateString).toLocaleDateString('ro-RO', {
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        });
    };


    return (
        <div
            className="task-box"
            onClick={() => window.open(task.url, '_blank')}
        >
            <div className="task-box-header">
                <span className="task-box-key">
                    {task.key}
                </span>
                <div className="task-box-meta-icons">
                    <div
                        className={`task-box-priority ${task.priority.toLowerCase()}`}
                        title={task.priority}
                    />
                    <ExternalLink size={12} color="#9CA3AF" />
                </div>
            </div>

            <h4 className="task-box-title">
                {task.title}
            </h4>

            <div className="task-box-footer">
                <div className="task-box-assignee">
                    <User size={12} />
                    <span>{task.assignee}</span>
                </div>
                <div className="task-box-date">
                    <Calendar size={12} />
                    <span>{formatDate(task.updated)}</span>
                </div>
            </div>
        </div>
    );
};

export default TaskBox;