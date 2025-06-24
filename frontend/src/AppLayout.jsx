import React, {useState} from 'react';
import { Upload, ListTodo } from 'lucide-react';


const AppLayout = ({ children }) => {
    const [activeView, setActiveView] = useState('upload');

    const getFilteredChildren = () => {
        const childrenArray = React.Children.toArray(children);

        switch(activeView){
            case 'jira':
                return childrenArray.filter(child => child.type?.name === 'JiraBoard' || child.type?.displayName === 'JiraBoard');
            case 'upload':
            default:
                return childrenArray.filter(child => child.type?.name === 'SimpleAudioUpload' || child.type?.displayName === 'SimpleAudioUpload');
        }
    };


    return (
        <div className="app-container">
            <div className="app-toggle-bar">
                <button
                    className={`app-toggle-option ${activeView === 'upload' ? 'active' : ''}`}
                    onClick={() => setActiveView('upload')}>
                    <Upload size={16}/>
                    Audio Upload
                </button>
                <button
                    className={`app-toggle-option ${activeView === 'jira' ? 'active' : ''}`}
                    onClick={() => setActiveView('jira')}>
                    <ListTodo size={16}/>
                    Jira Tasks
                </button>
            </div>
            <div className="app-grid single-column">
                {getFilteredChildren()}
            </div>
        </div>
    );
};

export default AppLayout;