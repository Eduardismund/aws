import React from 'react';
import './App.css';
import SimpleAudioUpload from "./AudioUpload.jsx";
import JiraBoard from "./JiraBoard.jsx";
import AppLayout from "./AppLayout.jsx";

function App() {
    return (
        <AppLayout layout="grid">
            <SimpleAudioUpload />
            <JiraBoard />
        </AppLayout>
    );
}

export default App;