import React, { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import SimpleAudioUpload from "./AudioUpload.jsx";
import JiraBoard from "./JiraBoard.jsx";
import AppLayout from "./AppLayout.jsx";

createRoot(document.getElementById('root')).render(
  <StrictMode>
      <AppLayout>
          <SimpleAudioUpload />
          <JiraBoard />
      </AppLayout>
  </StrictMode>,
)
